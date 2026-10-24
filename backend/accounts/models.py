
from django.db import models
from django.db.models import Q
from django.contrib.auth.models import User


class EmployeeProfile(models.Model):
    ROLE_CHOICES = [
        ("ADMIN", "Admin"),
        ("STAFF", "Inventory Staff"),
    ]

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="employee_profile",
    )

    employee_id = models.CharField(max_length=30, unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    mobile_number = models.CharField(max_length=20)
    department = models.CharField(max_length=100, blank=True)
    job_title = models.CharField(max_length=100, blank=True)
    start_date = models.DateField(null=True, blank=True)

    role = models.CharField(
        max_length=10,
        choices=ROLE_CHOICES,
        default="STAFF",
    )

    def __str__(self):
        return f"{self.employee_id} - {self.user.username}"


class LoginHistory(models.Model):
    STATUS_CHOICES = [
        ("SUCCESS", "Successful"),
        ("FAILED", "Failed"),
    ]

    employee_profile = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="login_history",
    )

    employee_id = models.CharField(max_length=30, blank=True)
    username = models.CharField(max_length=150, blank=True)

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
    )

    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.employee_id or 'Unknown'} - "
            f"{self.status} - {self.created_at}"
        )


class PasswordResetRequest(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending approval"),
        ("APPROVED", "Approved"),
        ("DENIED", "Denied"),
        ("COMPLETED", "Completed"),
        ("EXPIRED", "Expired"),
    ]

    employee_profile = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.SET_NULL,
        null=True,
        related_name="password_reset_requests",
    )
    employee_id = models.CharField(max_length=30)
    role = models.CharField(max_length=10)
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="PENDING",
    )
    approval_code_hash = models.CharField(max_length=128, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_password_reset_requests",
    )
    code_expires_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["requested_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee_profile"],
                condition=Q(status="PENDING"),
                name="uniq_pending_pw_reset_per_profile",
            ),
        ]

    def __str__(self):
        return f"{self.employee_id} - {self.status}"
