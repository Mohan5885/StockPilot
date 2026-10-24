
from decimal import Decimal
import secrets
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import (
    Count, F, Sum, Value, DecimalField, ExpressionWrapper
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.mixins import ListModelMixin, CreateModelMixin
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Item, Purchase, StockMovement
from .serializers import (
    ItemSerializer,
    PurchaseSerializer,
    StockMovementSerializer,
)


RESET_CHALLENGE_TTL = 300
RESET_CHALLENGE_ATTEMPT_LIMIT = 5


def _is_admin(user):
    try:
        return user.employee_profile.role == "ADMIN"
    except AttributeError:
        return False


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def inventory_reset_challenge(request):
    if not _is_admin(request.user):
        return Response(
            {"detail": "Only administrators can reset inventory."},
            status=status.HTTP_403_FORBIDDEN,
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = timezone.now() + timedelta(seconds=RESET_CHALLENGE_TTL)
    cache.set(
        f"inventory-reset:{request.user.pk}",
        {"code": code, "attempts": 0, "expires_at": expires_at},
        timeout=RESET_CHALLENGE_TTL,
    )
    return Response({"code": code, "expires_in": RESET_CHALLENGE_TTL})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def inventory_reset_cancel(request):
    if not _is_admin(request.user):
        return Response(
            {"detail": "Only administrators can reset inventory."},
            status=status.HTTP_403_FORBIDDEN,
        )
    cache.delete(f"inventory-reset:{request.user.pk}")
    return Response({"success": True}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def inventory_reset(request):
    if not _is_admin(request.user):
        return Response(
            {"detail": "Only administrators can reset inventory."},
            status=status.HTTP_403_FORBIDDEN,
        )

    cache_key = f"inventory-reset:{request.user.pk}"
    challenge = cache.get(cache_key)
    submitted_code = str(request.data.get("code", "")).strip()
    confirmation = str(request.data.get("confirmation", "")).strip()
    if confirmation != "RESET INVENTORY":
        return Response(
            {"detail": "Type RESET INVENTORY to confirm this action."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not challenge:
        return Response(
            {"detail": "Request a new reset code and try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if challenge["expires_at"] <= timezone.now():
        cache.delete(cache_key)
        return Response(
            {"detail": "The reset code has expired. Request a new code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not secrets.compare_digest(submitted_code, challenge["code"]):
        challenge["attempts"] += 1
        if challenge["attempts"] >= RESET_CHALLENGE_ATTEMPT_LIMIT:
            cache.delete(cache_key)
            detail = "Too many incorrect attempts. Request a new reset code."
        else:
            remaining = max(
                1,
                int((challenge["expires_at"] - timezone.now()).total_seconds()),
            )
            cache.set(cache_key, challenge, timeout=remaining)
            detail = "The reset code is incorrect."
        return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

    cache.delete(cache_key)
    with transaction.atomic():
        movement_count = StockMovement.objects.count()
        purchase_count = Purchase.objects.count()
        item_count = Item.objects.count()
        StockMovement.objects.all().delete()
        Purchase.objects.all().delete()
        Item.objects.all().delete()

    return Response(
        {
            "success": True,
            "deleted": {
                "stock_movements": movement_count,
                "purchases": purchase_count,
                "items": item_count,
            },
            "preserved": ["staff accounts", "login history"],
        },
        status=status.HTTP_200_OK,
    )


class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all().order_by("name")
    serializer_class = ItemSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Item.objects.all().order_by("name")
        search = self.request.query_params.get("search", "").strip()

        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(sku__icontains=search)
            )

        return queryset


class PurchaseViewSet(ListModelMixin, CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Purchase.objects.select_related(
            "item", "created_by"
        ).order_by("-received_at", "-id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            item_id = serializer.validated_data["item"].id
            item = Item.objects.select_for_update().get(id=item_id)

            if not item.is_active:
                return Response(
                    {"item": ["This item is inactive."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            quantity_received = serializer.validated_data["quantity"]
            quantity_before = item.quantity
            quantity_after = quantity_before + quantity_received

            if quantity_after > 2147483647:
                return Response(
                    {"quantity": ["The resulting stock quantity is too large."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            purchase = serializer.save(created_by=request.user)

            item.quantity = quantity_after
            item.save(update_fields=["quantity", "updated_at"])

            StockMovement.objects.create(
                item=item,
                movement_type=StockMovement.PURCHASE,
                quantity=quantity_received,
                quantity_before=quantity_before,
                quantity_after=quantity_after,
                reference=purchase.reference,
                notes=(
                    f"Supplier: {purchase.supplier_name}. "
                    f"{purchase.notes}"
                ).strip(),
                created_by=request.user,
            )

        return Response(
            self.get_serializer(purchase).data,
            status=status.HTTP_201_CREATED,
        )


class SaleInputSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.all()
    )
    quantity = serializers.IntegerField(min_value=1)
    reference = serializers.CharField(max_length=50)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_reference(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "A sale or issue reference is required."
            )

        if StockMovement.objects.filter(
            movement_type=StockMovement.SALE,
            reference__iexact=value,
        ).exists():
            raise serializers.ValidationError(
                "This sale reference has already been used."
            )

        return value


class SaleViewSet(ListModelMixin, CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StockMovement.objects.filter(
            movement_type=StockMovement.SALE
        ).select_related(
            "item", "created_by"
        ).order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        input_serializer = SaleInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        data = input_serializer.validated_data

        with transaction.atomic():
            item = Item.objects.select_for_update().get(
                id=data["item"].id
            )

            if not item.is_active:
                return Response(
                    {"item": ["This item is inactive."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            quantity_sold = data["quantity"]

            if quantity_sold > item.quantity:
                return Response(
                    {
                        "quantity": [
                            f"Insufficient stock. Available quantity: "
                            f"{item.quantity}."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            quantity_before = item.quantity
            quantity_after = quantity_before - quantity_sold

            item.quantity = quantity_after
            item.save(update_fields=["quantity", "updated_at"])

            movement = StockMovement.objects.create(
                item=item,
                movement_type=StockMovement.SALE,
                quantity=quantity_sold,
                quantity_before=quantity_before,
                quantity_after=quantity_after,
                reference=data["reference"],
                notes=data.get("notes", ""),
                created_by=request.user,
            )

        output = self.get_serializer(movement)
        return Response(output.data, status=status.HTTP_201_CREATED)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = StockMovement.objects.select_related(
            "item", "created_by"
        ).all()

        item_id = self.request.query_params.get("item")
        movement_type = self.request.query_params.get("movement_type")

        if item_id:
            queryset = queryset.filter(item_id=item_id)

        if movement_type:
            queryset = queryset.filter(
                movement_type=movement_type.upper()
            )

        return queryset


@api_view(["GET"])
@permission_classes([AllowAny])
def dashboard_summary(request):
    active_items = Item.objects.filter(is_active=True)

    summary = active_items.aggregate(
        total_items=Count("id"),
        total_units=Coalesce(Sum("quantity"), Value(0)),
        inventory_value=Coalesce(
            Sum(
                ExpressionWrapper(
                    F("quantity") * F("unit_price"),
                    output_field=DecimalField(
                        max_digits=18, decimal_places=2
                    ),
                )
            ),
            Value(Decimal("0.00")),
            output_field=DecimalField(
                max_digits=18, decimal_places=2
            ),
        ),
    )

    low_stock_items = active_items.filter(
        quantity__lte=F("reorder_level")
    ).order_by("quantity", "name")

    return Response({
        "total_items": summary["total_items"],
        "total_units": summary["total_units"],
        "low_stock_count": low_stock_items.count(),
        "inventory_value": str(summary["inventory_value"]),
        "low_stock_items": ItemSerializer(
            low_stock_items[:5], many=True
        ).data,
    })
