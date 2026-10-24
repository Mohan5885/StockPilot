
import logging
import secrets
import smtplib
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import EmployeeProfile, LoginHistory, PasswordResetRequest
from .serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    StaffCreateSerializer,
    StaffProfileSerializer,
)
from .sms_notifications import send_successful_login_alert
from .throttles import (
    PasswordResetConfirmThrottle,
    PasswordResetRequestThrottle,
)


logger = logging.getLogger(__name__)


def record_login_attempt(
    request,
    employee_id="",
    username="",
    attempt_status="FAILED",
    employee_profile=None,
):
    """Save a login attempt without storing the submitted password."""

    ip_address = request.META.get("REMOTE_ADDR")

    LoginHistory.objects.create(
        employee_profile=employee_profile,
        employee_id=employee_id or "",
        username=username or "",
        status=attempt_status,
        ip_address=ip_address,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)

    if not serializer.is_valid():
        record_login_attempt(
            request,
            employee_id=str(
                request.data.get("employee_id", "")
            ).strip()[:30],
        )

        return Response(
            {
                "success": False,
                "message": (
                    "Please enter your employee ID and password."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    employee_id = (
        serializer.validated_data["employee_id"].strip()
    )
    password = serializer.validated_data["password"]
    requested_role = serializer.validated_data.get("portal")

    try:
        profile = EmployeeProfile.objects.select_related(
            "user"
        ).get(employee_id__exact=employee_id)

    except EmployeeProfile.DoesNotExist:
        record_login_attempt(
            request,
            employee_id=employee_id[:30],
        )

        return Response(
            {
                "success": False,
                "message": "Invalid employee ID or password.",
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if requested_role and requested_role != profile.role:
        record_login_attempt(
            request,
            employee_id=profile.employee_id,
            username=profile.user.username,
            employee_profile=profile,
        )
        return Response(
            {"detail": "This account cannot sign in through this portal."},
            status=status.HTTP_403_FORBIDDEN,
        )

    user = authenticate(
        request,
        username=profile.user.username,
        password=password,
    )

    if user is None or not user.is_active:
        record_login_attempt(
            request,
            employee_id=profile.employee_id,
            username=profile.user.username,
            employee_profile=profile,
        )

        return Response(
            {
                "success": False,
                "message": "Invalid employee ID or password.",
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

    token, _ = Token.objects.get_or_create(user=user)

    # Record a successful login.
    record_login_attempt(
        request,
        employee_id=profile.employee_id,
        username=user.username,
        attempt_status="SUCCESS",
        employee_profile=profile,
    )

    # Send the admin an SMS after successful authentication.
    # SMS errors must not prevent login.
    try:
        send_successful_login_alert(
            employee_id=profile.employee_id,
            username=user.username,
        )
    except Exception:
        logger.exception(
            "Unexpected error while sending the login SMS alert."
        )

    return Response(
        {
            "success": True,
            "message": "Login successful.",
            "token": token.key,
            "employee": {
                "employee_id": profile.employee_id,
                "full_name": profile.full_name,
                "email": user.email,
                "mobile_number": profile.mobile_number,
                "department": profile.department,
                "job_title": profile.job_title,
                "start_date": profile.start_date,
                "username": user.username,
                "role": profile.role,
            },
        },
        status=status.HTTP_200_OK,
    )


def admin_required(request):
    try:
        profile = request.user.employee_profile
    except EmployeeProfile.DoesNotExist:
        return False
    return profile.role == "ADMIN"


def password_reset_generic_response():
    return Response(
        {
            "detail": (
                "If the account matches, a password reset request has been "
                "sent to an administrator for review."
            )
        },
        status=status.HTTP_202_ACCEPTED,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRequestThrottle])
def password_reset_request_view(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    employee_id = serializer.validated_data["employee_id"]
    role = serializer.validated_data["portal"]

    try:
        profile = EmployeeProfile.objects.select_related("user").get(
            employee_id__iexact=employee_id,
            role=role,
            user__is_active=True,
        )
    except EmployeeProfile.DoesNotExist:
        return password_reset_generic_response()

    try:
        with transaction.atomic():
            profile = EmployeeProfile.objects.select_for_update().get(
                pk=profile.pk
            )
            if PasswordResetRequest.objects.filter(
                employee_profile=profile,
                status="PENDING",
            ).exists():
                return password_reset_generic_response()

            now = timezone.now()
            PasswordResetRequest.objects.filter(
                employee_profile=profile,
                status="APPROVED",
                code_expires_at__lte=now,
            ).update(status="EXPIRED", approval_code_hash="")
            if PasswordResetRequest.objects.filter(
                employee_profile=profile,
                status="APPROVED",
                code_expires_at__gt=now,
            ).exists():
                return password_reset_generic_response()
            PasswordResetRequest.objects.create(
                employee_profile=profile,
                employee_id=profile.employee_id,
                role=profile.role,
            )
    except IntegrityError:
        return password_reset_generic_response()

    return password_reset_generic_response()


@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def password_reset_requests_view(request):
    if not admin_required(request):
        return Response(
            {"detail": "Only administrators can review password reset requests."},
            status=status.HTTP_403_FORBIDDEN,
        )

    requests = PasswordResetRequest.objects.filter(
        status="PENDING"
    ).select_related("employee_profile")
    return Response(
        [
            {
                "id": reset_request.id,
                "employee_id": reset_request.employee_id,
                "full_name": (
                    reset_request.employee_profile.full_name
                    if reset_request.employee_profile
                    else ""
                ),
                "role": reset_request.role,
                "requested_at": timezone.localtime(
                    reset_request.requested_at
                ).isoformat(),
            }
            for reset_request in requests
        ],
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def approve_password_reset_request_view(request, reset_request_id):
    if not admin_required(request):
        return Response(
            {"detail": "Only administrators can review password reset requests."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        with transaction.atomic():
            reset_request = PasswordResetRequest.objects.select_for_update().get(
                pk=reset_request_id,
                status="PENDING",
            )
            if reset_request.employee_profile_id == request.user.employee_profile.id:
                return Response(
                    {"detail": "An administrator cannot approve their own request."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            employee = reset_request.employee_profile
            recipient_email = employee.user.email.strip()
            if not recipient_email:
                return Response(
                    {
                        "detail": (
                            "This employee does not have a registered email "
                            "address. Add one to the staff profile before approval."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            code = f"{secrets.randbelow(100_000_000):08d}"
            expires_at = timezone.now() + timedelta(minutes=15)
            email_body = (
                f"Hello {employee.full_name or employee.employee_id},\n\n"
                "An administrator approved your StockPilot password reset "
                "request.\n\n"
                f"Your one-time approval code is: {code}\n\n"
                "Enter this code on the StockPilot sign-in page to set a new "
                "password. The code expires in 15 minutes and can only be used "
                "once. If you did not request a password reset, contact your "
                "system administrator immediately."
            )
            if settings.EMAIL_BACKEND == (
                "django.core.mail.backends.console.EmailBackend"
            ):
                return Response(
                    {
                        "detail": (
                            "Email delivery is not configured; this server "
                            "only prints emails to its console. Configure an "
                            "SMTP email backend before approving reset requests."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            try:
                sent_count = send_mail(
                    subject="Your StockPilot password reset code",
                    message=email_body,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[recipient_email],
                    fail_silently=False,
                )
            except (OSError, smtplib.SMTPException):
                logger.exception(
                    "Could not email password reset code for request %s.",
                    reset_request.id,
                )
                return Response(
                    {
                        "detail": (
                            "The approval email could not be delivered. "
                            "The request remains pending; verify the email "
                            "service configuration and try again."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            if sent_count != 1:
                logger.error(
                    "Password reset email backend did not send request %s.",
                    reset_request.id,
                )
                return Response(
                    {
                        "detail": (
                            "The approval email could not be delivered. "
                            "The request remains pending; verify the email "
                            "service configuration and try again."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            reset_request.status = "APPROVED"
            reset_request.approval_code_hash = make_password(code)
            reset_request.reviewed_at = timezone.now()
            reset_request.reviewed_by = request.user
            reset_request.code_expires_at = expires_at
            reset_request.failed_attempts = 0
            reset_request.save(
                update_fields=[
                    "status",
                    "approval_code_hash",
                    "reviewed_at",
                    "reviewed_by",
                    "code_expires_at",
                    "failed_attempts",
                ]
            )
    except PasswordResetRequest.DoesNotExist:
        return Response(
            {"detail": "This request is no longer pending."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(
        {
            "detail": (
                f"Request approved. A one-time code was emailed to "
                f"{recipient_email}. It expires in 15 minutes."
            ),
            "expires_at": timezone.localtime(expires_at).isoformat(),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def deny_password_reset_request_view(request, reset_request_id):
    if not admin_required(request):
        return Response(
            {"detail": "Only administrators can review password reset requests."},
            status=status.HTTP_403_FORBIDDEN,
        )

    updated = PasswordResetRequest.objects.filter(
        pk=reset_request_id,
        status="PENDING",
    ).update(
        status="DENIED",
        reviewed_at=timezone.now(),
        reviewed_by=request.user,
    )
    if not updated:
        return Response(
            {"detail": "This request is no longer pending."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(
        {"detail": "Password reset request denied."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetConfirmThrottle])
def password_reset_confirm_view(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    generic_error = {
        "detail": "The approval code is invalid or expired."
    }

    profile = EmployeeProfile.objects.select_related("user").filter(
        employee_id__iexact=data["employee_id"],
        role=data["portal"],
        user__is_active=True,
    ).first()
    if profile is None:
        return Response(generic_error, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        reset_request = (
            PasswordResetRequest.objects.select_for_update()
            .filter(
                employee_profile=profile,
                status="APPROVED",
            )
            .order_by("-reviewed_at")
            .first()
        )
        if reset_request is None:
            return Response(generic_error, status=status.HTTP_400_BAD_REQUEST)

        if (
            reset_request.code_expires_at is None
            or reset_request.code_expires_at <= timezone.now()
            or reset_request.failed_attempts >= 5
        ):
            reset_request.status = "EXPIRED"
            reset_request.approval_code_hash = ""
            reset_request.save(
                update_fields=["status", "approval_code_hash"]
            )
            return Response(generic_error, status=status.HTTP_400_BAD_REQUEST)

        if not check_password(
            data["approval_code"],
            reset_request.approval_code_hash,
        ):
            reset_request.failed_attempts += 1
            if reset_request.failed_attempts >= 5:
                reset_request.status = "EXPIRED"
                reset_request.approval_code_hash = ""
            reset_request.save(
                update_fields=[
                    "failed_attempts",
                    "status",
                    "approval_code_hash",
                ]
            )
            return Response(generic_error, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(data["new_password"], user=profile.user)
        except ValidationError as error:
            return Response(
                {"new_password": list(error.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile.user.set_password(data["new_password"])
        profile.user.save(update_fields=["password"])
        Token.objects.filter(user=profile.user).delete()
        reset_request.status = "COMPLETED"
        reset_request.approval_code_hash = ""
        reset_request.save(
            update_fields=["status", "approval_code_hash"]
        )

    return Response(
        {"detail": "Password updated. You can now sign in with your new password."},
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def staff_list_create_view(request):
    if not admin_required(request):
        return Response(
            {"detail": "Only administrators can manage staff accounts."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == "GET":
        profiles = EmployeeProfile.objects.filter(
            role="STAFF"
        ).select_related("user").order_by("employee_id")
        return Response(StaffProfileSerializer(profiles, many=True).data)

    serializer = StaffCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    user_model = get_user_model()
    password = data.pop("password")
    email = data.pop("email", "")

    with transaction.atomic():
        user = user_model.objects.create_user(
            username=data["employee_id"],
            email=email,
            password=password,
        )
        profile = EmployeeProfile.objects.create(
            user=user,
            role="STAFF",
            **data,
        )

    return Response(
        StaffProfileSerializer(profile).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def staff_detail_view(request, profile_id):
    if not admin_required(request):
        return Response(
            {"detail": "Only administrators can manage staff accounts."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        profile = EmployeeProfile.objects.select_related("user").get(
            id=profile_id,
            role="STAFF",
        )
    except EmployeeProfile.DoesNotExist:
        return Response(
            {"detail": "Staff account not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = StaffProfileSerializer(
        profile,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    profile = serializer.save()

    if not profile.user.is_active:
        from rest_framework.authtoken.models import Token
        Token.objects.filter(user=profile.user).delete()

    return Response(serializer.data)


@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def login_history_view(request):
    # Only a user with the StockPilot ADMIN role may view history.
    try:
        profile = request.user.employee_profile
    except EmployeeProfile.DoesNotExist:
        return Response(
            {
                "success": False,
                "message": "You are not authorized to view login history.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    if profile.role != "ADMIN":
        return Response(
            {
                "success": False,
                "message": "Only administrators can view login history.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    history = LoginHistory.objects.select_related(
        "employee_profile"
    ).all()[:200]

    results = [
        {
            "id": entry.id,
            "employee_id": entry.employee_id or "Unknown",
            "username": entry.username or "Unknown",
            "status": entry.status,
            "ip_address": entry.ip_address or "Unavailable",
            "created_at": timezone.localtime(
                entry.created_at
            ).isoformat(),
        }
        for entry in history
    ]

    return Response(
        {
            "success": True,
            "count": len(results),
            "results": results,
        },
        status=status.HTTP_200_OK,
    )
