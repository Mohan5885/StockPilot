
from decimal import Decimal, ROUND_HALF_UP
import secrets
from datetime import date, datetime, time, timedelta

from django.core.cache import cache
from django.db import models, transaction
from django.db.models import (
    Count, F, Sum, Value, DecimalField, ExpressionWrapper
)
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from django.utils.text import slugify
from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.mixins import ListModelMixin, CreateModelMixin
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Item, Purchase, StockMovement
from .serializers import (
    ItemSerializer,
    PurchaseSerializer,
    StockMovementSerializer,
)


def _is_admin(user):
    try:
        return user.employee_profile.role == "ADMIN"
    except AttributeError:
        return False


RESET_CHALLENGE_TTL = 300
RESET_CHALLENGE_ATTEMPT_LIMIT = 5


def _generate_item_sku(item_name):
    base = slugify(item_name).upper()[:40].rstrip("-") or "ITEM"
    sku = base
    suffix = 2
    while Item.objects.filter(sku=sku).exists():
        sku = f"{base[:45 - len(str(suffix))]}-{suffix}"
        suffix += 1
    return sku


class NewItemPurchaseSerializer(serializers.Serializer):
    reference = serializers.CharField(max_length=50)
    supplier_name = serializers.CharField(max_length=150)
    quantity = serializers.IntegerField(min_value=1, max_value=2147483647)
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    item_name = serializers.CharField(max_length=150)
    brand = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    model = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    category = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    warranty = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")

    def validate_reference(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Purchase reference is required.")
        if Purchase.objects.filter(reference__iexact=value).exists():
            raise serializers.ValidationError("This purchase reference already exists.")
        return value

    def validate_supplier_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Supplier name is required.")
        return value

    def validate_item_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Item name is required.")
        if Item.objects.filter(name__iexact=value).exists():
            raise serializers.ValidationError(
                "An item with this name already exists. Reactivate it from the Items page and select it."
            )
        return value


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


class PurchaseViewSet(ListModelMixin, CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Purchase.objects.select_related(
            "item", "created_by"
        ).order_by("-received_at", "-id")

    def create(self, request, *args, **kwargs):
        create_item = request.data.get("item") == "other"
        serializer = (
            NewItemPurchaseSerializer(data=request.data)
            if create_item
            else self.get_serializer(data=request.data)
        )
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            if create_item:
                data = serializer.validated_data
                sku = _generate_item_sku(data["item_name"])
                item = Item.objects.create(
                    sku=sku,
                    name=data["item_name"],
                    brand=data["brand"],
                    model=data["model"],
                    category=data["category"],
                    warranty=data["warranty"],
                    unit_price=Decimal("0.00"),
                    quantity=0,
                )
            else:
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

            purchase = (
                Purchase.objects.create(
                    reference=data["reference"],
                    supplier_name=data["supplier_name"],
                    item=item,
                    quantity=serializer.validated_data["quantity"],
                    unit_cost=serializer.validated_data["unit_cost"],
                    notes=serializer.validated_data["notes"],
                    created_by=request.user,
                )
                if create_item
                else serializer.save(created_by=request.user)
            )

            if item.inventory_unit_cost is None:
                if quantity_before == 0:
                    item.inventory_unit_cost = purchase.unit_cost
            else:
                weighted_cost = (
                    item.inventory_unit_cost * quantity_before
                    + purchase.unit_cost * quantity_received
                ) / quantity_after
                item.inventory_unit_cost = weighted_cost.quantize(
                    Decimal("0.0001"), rounding=ROUND_HALF_UP
                )

            item.quantity = quantity_after
            item.save(
                update_fields=[
                    "quantity",
                    "inventory_unit_cost",
                    "updated_at",
                ]
            )

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
    transaction_type = serializers.ChoiceField(
        choices=[StockMovement.SALE, "ISSUE"],
        default=StockMovement.SALE,
    )
    unit_selling_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0"),
        required=False,
        allow_null=True,
    )
    customer_name = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
        default="",
    )
    customer_phone = serializers.RegexField(
        regex=r"^\d{10}$",
        error_messages={"invalid": "Enter a 10-digit phone number."},
        required=False,
        allow_blank=True,
        default="",
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_reference(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "A sale or issue reference is required."
            )

        if StockMovement.objects.filter(
            movement_type__in=[StockMovement.SALE, "ISSUE"],
            reference__iexact=value,
        ).exists():
            raise serializers.ValidationError(
                "This sale reference has already been used."
            )

        return value

    def validate(self, attrs):
        if (
            attrs["transaction_type"] == StockMovement.SALE
            and attrs.get("unit_selling_price") is None
        ):
            raise serializers.ValidationError(
                {"unit_selling_price": "Enter the actual selling price."}
            )
        if (
            attrs["transaction_type"] == StockMovement.SALE
            and not attrs.get("customer_name", "").strip()
        ):
            raise serializers.ValidationError(
                {"customer_name": "Enter the customer name."}
            )
        attrs["customer_name"] = attrs.get("customer_name", "").strip()
        attrs["customer_phone"] = attrs.get("customer_phone", "").strip()
        return attrs


class SaleViewSet(ListModelMixin, CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StockMovement.objects.filter(
            movement_type__in=[StockMovement.SALE, "ISSUE"]
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
            transaction_type = data["transaction_type"]

            movement = StockMovement.objects.create(
                item=item,
                movement_type=transaction_type,
                quantity=quantity_sold,
                quantity_before=quantity_before,
                quantity_after=quantity_after,
                unit_selling_price=data.get("unit_selling_price"),
                unit_cost=(
                    item.inventory_unit_cost
                    if transaction_type == StockMovement.SALE
                    else None
                ),
                reference=data["reference"],
                customer_name=(
                    data["customer_name"]
                    if transaction_type == StockMovement.SALE else ""
                ),
                customer_phone=(
                    data["customer_phone"]
                    if transaction_type == StockMovement.SALE else ""
                ),
                notes=data.get("notes", ""),
                created_by=request.user,
            )
            item.quantity = quantity_after
            item.save(update_fields=["quantity", "updated_at"])

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


class OpeningCostSerializer(serializers.Serializer):
    unit_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=4,
        min_value=Decimal("0"),
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
                Q(name__icontains=search) | Q(sku__icontains=search)
            )
        return queryset

    @action(detail=True, methods=["post"], url_path="initialize-cost")
    def initialize_cost(self, request, pk=None):
        if not _is_admin(request.user):
            return Response(
                {"detail": "Only administrators can initialize inventory cost."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = OpeningCostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            item = Item.objects.select_for_update().get(pk=pk)
            if item.quantity == 0:
                return Response(
                    {"detail": "Opening cost requires current stock above zero."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if item.inventory_unit_cost is not None:
                return Response(
                    {"detail": "Inventory cost has already been initialized."},
                    status=status.HTTP_409_CONFLICT,
                )
            item.inventory_unit_cost = serializer.validated_data["unit_cost"]
            item.inventory_cost_initialized_at = timezone.now()
            item.inventory_cost_initialized_by = request.user
            item.save(
                update_fields=[
                    "inventory_unit_cost",
                    "inventory_cost_initialized_at",
                    "inventory_cost_initialized_by",
                    "updated_at",
                ]
            )
        return Response(ItemSerializer(item, context=self.get_serializer_context()).data)


def _report_period(request):
    period = request.query_params.get("period", "month")
    today = timezone.localdate()
    if period == "today":
        start_date = end_date = today
    elif period == "week":
        start_date = today - timedelta(days=today.weekday())
        end_date = today
    elif period == "month":
        start_date = today.replace(day=1)
        end_date = today
    elif period == "year":
        start_date = today.replace(month=1, day=1)
        end_date = today
    elif period == "custom":
        try:
            start_date = date.fromisoformat(
                request.query_params.get("start_date", "")
            )
            end_date = date.fromisoformat(
                request.query_params.get("end_date", "")
            )
        except ValueError:
            raise serializers.ValidationError(
                {"date_range": "Custom ranges require valid start_date and end_date."}
            )
    else:
        raise serializers.ValidationError(
            {"period": "Choose today, week, month, year, or custom."}
        )
    if end_date < start_date:
        raise serializers.ValidationError(
            {"date_range": "End date must not precede start date."}
        )
    current_tz = timezone.get_current_timezone()
    start_at = timezone.make_aware(
        datetime.combine(start_date, time.min), current_tz
    )
    end_at = timezone.make_aware(
        datetime.combine(end_date + timedelta(days=1), time.min), current_tz
    )
    return period, start_date, end_date, start_at, end_at


def _page(queryset, request, parameter, page_size):
    paginator = Paginator(queryset, page_size)
    try:
        selected = paginator.page(request.query_params.get(parameter, 1))
    except (EmptyPage, PageNotAnInteger):
        raise serializers.ValidationError(
            {parameter: "Page number is outside the available range."}
        )
    return {
        "results": list(selected.object_list),
        "count": paginator.count,
        "page": selected.number,
        "pages": paginator.num_pages,
    }


def _decimal_text(value):
    return str(
        (value or Decimal("0")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    )


def _sale_revenue_expression():
    return F("quantity") * F("unit_selling_price")


def _sale_cost_expression():
    return F("quantity") * F("unit_cost")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reports_data(request):
    if not _is_admin(request.user):
        return Response(
            {"detail": "Only administrators can access financial reports."},
            status=status.HTTP_403_FORBIDDEN,
        )

    period, start_date, end_date, start_at, end_at = _report_period(request)
    try:
        page_size = min(max(int(request.query_params.get("page_size", 25)), 1), 100)
    except ValueError:
        raise serializers.ValidationError(
            {"page_size": "Page size must be a number between 1 and 100."}
        )

    sales = StockMovement.objects.filter(
        movement_type=StockMovement.SALE,
        created_at__gte=start_at,
        created_at__lt=end_at,
    )
    totals = sales.aggregate(
        sales_count=Count("id"),
        sales_revenue=Sum(
            _sale_revenue_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
        cogs=Sum(
            _sale_cost_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
        missing_revenue=Count("id", filter=models.Q(unit_selling_price__isnull=True)),
        missing_cost=Count("id", filter=models.Q(unit_cost__isnull=True)),
    )
    sales_count = totals["sales_count"]
    missing_revenue = totals["missing_revenue"]
    missing_cost = totals["missing_cost"]
    data_complete = missing_revenue == 0 and missing_cost == 0
    revenue = totals["sales_revenue"] or Decimal("0")
    cogs = totals["cogs"] or Decimal("0")
    gross_profit = revenue - cogs if data_complete else None

    daily = sales.annotate(
        day=TruncDate("created_at", tzinfo=timezone.get_current_timezone())
    ).values("day").annotate(
        sales_revenue=Sum(
            _sale_revenue_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
        cogs=Sum(
            _sale_cost_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
        missing_revenue=Count("id", filter=models.Q(unit_selling_price__isnull=True)),
        missing_cost=Count("id", filter=models.Q(unit_cost__isnull=True)),
    ).order_by("day")
    trends = []
    for row in daily:
        complete = row["missing_revenue"] == 0 and row["missing_cost"] == 0
        day_revenue = row["sales_revenue"] or Decimal("0")
        day_cogs = row["cogs"] or Decimal("0")
        trends.append(
            {
                "date": row["day"].isoformat(),
                "sales_revenue": (
                    _decimal_text(day_revenue)
                    if row["missing_revenue"] == 0 else None
                ),
                "cogs": _decimal_text(day_cogs) if row["missing_cost"] == 0 else None,
                "gross_profit": _decimal_text(day_revenue - day_cogs) if complete else None,
                "complete": complete,
            }
        )

    products = sales.values("item_id", "item__name", "item__sku").annotate(
        units_sold=Sum("quantity"),
        sales_count=Count("id"),
        sales_revenue=Sum(
            _sale_revenue_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
        cogs=Sum(
            _sale_cost_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
        missing_revenue=Count("id", filter=models.Q(unit_selling_price__isnull=True)),
        missing_cost=Count("id", filter=models.Q(unit_cost__isnull=True)),
    ).filter(
        missing_revenue=0
    ).order_by("-sales_revenue", "item__name")
    top_products = []
    for product in products[:10]:
        complete = product["missing_cost"] == 0
        product_revenue = product["sales_revenue"] or Decimal("0")
        product_cogs = product["cogs"] or Decimal("0")
        top_products.append(
            {
                "item_id": product["item_id"],
                "name": product["item__name"],
                "sku": product["item__sku"],
                "quantity": product["units_sold"],
                "sales_revenue": (
                    _decimal_text(product_revenue)
                    if product["missing_revenue"] == 0 else None
                ),
                "gross_profit": _decimal_text(product_revenue - product_cogs) if complete else None,
            }
        )

    profit_products = sales.filter(
        unit_selling_price__isnull=False,
        unit_cost__isnull=False,
    ).values(
        "item_id", "item__name", "item__sku"
    ).annotate(
        units_sold=Sum("quantity"),
        sales_revenue=Sum(
            _sale_revenue_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
        cogs=Sum(
            _sale_cost_expression(),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        ),
    ).annotate(
        gross_profit=F("sales_revenue") - F("cogs")
    ).order_by("-gross_profit", "item__name")
    top_profit_products = [
        {
            "item_id": product["item_id"],
            "name": product["item__name"],
            "sku": product["item__sku"],
            "quantity": product["units_sold"],
            "gross_profit": _decimal_text(product["gross_profit"]),
        }
        for product in profit_products[:10]
    ]

    purchase_queryset = Purchase.objects.filter(
        received_at__gte=start_at,
        received_at__lt=end_at,
    ).select_related("item").order_by("-received_at", "-id").values(
        "reference", "supplier_name", "item__name", "item__sku",
        "item__brand", "item__model",
        "quantity", "unit_cost", "received_at",
    )
    purchase_page = _page(
        purchase_queryset, request, "purchase_page", page_size
    )
    purchase_page["results"] = [
        {
            "reference": row["reference"],
            "supplier_name": row["supplier_name"],
            "item_name": row["item__name"],
            "item_sku": row["item__sku"],
            "item_brand": row["item__brand"],
            "item_model": row["item__model"],
            "quantity": row["quantity"],
            "total_cost": _decimal_text(Decimal(row["unit_cost"]) * row["quantity"]),
            "unit_cost": str(row["unit_cost"]),
            "received_at": row["received_at"].isoformat(),
            "status": "RECEIVED",
        }
        for row in purchase_page["results"]
    ]

    sales_queryset = sales.select_related("item").order_by("-created_at", "-id").values(
        "reference", "item__name", "item__sku", "quantity",
        "item__brand", "item__model",
        "unit_selling_price", "unit_cost", "customer_name",
        "customer_phone", "created_at",
    )
    sales_page = _page(sales_queryset, request, "sales_page", page_size)
    sales_rows = []
    for row in sales_page["results"]:
        revenue_value = (
            Decimal(row["unit_selling_price"]) * row["quantity"]
            if row["unit_selling_price"] is not None else None
        )
        cogs_value = (
            Decimal(row["unit_cost"]) * row["quantity"]
            if row["unit_cost"] is not None else None
        )
        sales_rows.append(
            {
                "reference": row["reference"],
                "item_name": row["item__name"],
                "item_sku": row["item__sku"],
                "item_brand": row["item__brand"],
                "item_model": row["item__model"],
                "customer_name": row["customer_name"],
                "customer_phone": row["customer_phone"],
                "quantity": row["quantity"],
                "unit_selling_price": (
                    str(row["unit_selling_price"])
                    if row["unit_selling_price"] is not None else None
                ),
                "sales_revenue": _decimal_text(revenue_value) if revenue_value is not None else None,
                "unit_cost": str(row["unit_cost"]) if row["unit_cost"] is not None else None,
                "cogs": _decimal_text(cogs_value) if cogs_value is not None else None,
                "gross_profit": (
                    _decimal_text(revenue_value - cogs_value)
                    if revenue_value is not None and cogs_value is not None else None
                ),
                "created_at": row["created_at"].isoformat(),
                "status": "COMPLETED",
            }
        )
    sales_page["results"] = sales_rows

    inventory_queryset = Item.objects.order_by("name").values(
        "id", "sku", "name", "quantity", "reorder_level",
        "inventory_unit_cost", "unit_price", "brand", "model",
        "category", "warranty",
    )
    inventory_page = _page(
        inventory_queryset, request, "inventory_page", page_size
    )
    inventory_rows = []
    for row in inventory_page["results"]:
        cost = row["inventory_unit_cost"]
        inventory_rows.append(
            {
                "id": row["id"],
                "sku": row["sku"],
                "name": row["name"],
                "brand": row["brand"],
                "model": row["model"],
                "category": row["category"],
                "warranty": row["warranty"],
                "quantity": row["quantity"],
                "reorder_level": row["reorder_level"],
                "unit_cost": str(cost) if cost is not None else None,
                "selling_price": str(row["unit_price"]),
                "inventory_value": (
                    _decimal_text(Decimal(cost) * row["quantity"])
                    if cost is not None else None
                ),
                "stock_status": (
                    "Out of stock" if row["quantity"] == 0 else
                    "Low stock" if row["quantity"] <= row["reorder_level"] else
                    "In stock"
                ),
            }
        )
    inventory_page["results"] = inventory_rows

    inventory_summary = Item.objects.aggregate(
        known_inventory_value=Sum(
            ExpressionWrapper(
                F("quantity") * F("inventory_unit_cost"),
                output_field=DecimalField(max_digits=24, decimal_places=4),
            )
        ),
        unvalued_items=Count("id", filter=models.Q(
            quantity__gt=0, inventory_unit_cost__isnull=True
        )),
    )
    inventory_by_item = Item.objects.filter(
        quantity__gt=0,
        inventory_unit_cost__isnull=False,
    ).annotate(
        inventory_value=ExpressionWrapper(
            F("quantity") * F("inventory_unit_cost"),
            output_field=DecimalField(max_digits=24, decimal_places=4),
        )
    ).order_by("-inventory_value").values(
        "sku", "name", "inventory_value"
    )[:10]
    return Response(
        {
            "period": period,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "generated_at": timezone.localtime().isoformat(),
            "currency": "INR",
            "summary": {
                "sales_revenue": (
                    _decimal_text(revenue) if missing_revenue == 0 else None
                ),
                "cogs": _decimal_text(cogs) if missing_cost == 0 else None,
                "gross_profit": _decimal_text(gross_profit) if gross_profit is not None else None,
                "gross_profit_margin": (
                    str(
                        (gross_profit / revenue * 100).quantize(
                            Decimal("0.01"), rounding=ROUND_HALF_UP
                        )
                    )
                    if gross_profit is not None and revenue != 0 else None
                ),
                "sales_count": sales_count,
                "missing_revenue_count": missing_revenue,
                "missing_cost_count": missing_cost,
                "data_complete": data_complete,
                "purchase_total": _decimal_text(
                    Purchase.objects.filter(
                        received_at__gte=start_at, received_at__lt=end_at
                    ).aggregate(
                        total=Sum(
                            ExpressionWrapper(
                                F("quantity") * F("unit_cost"),
                                output_field=DecimalField(
                                    max_digits=24, decimal_places=4
                                ),
                            )
                        )
                    )["total"]
                ),
                "inventory_value": (
                    _decimal_text(inventory_summary["known_inventory_value"])
                    if inventory_summary["unvalued_items"] == 0 else None
                ),
                "known_inventory_value": _decimal_text(
                    inventory_summary["known_inventory_value"]
                ),
                "unvalued_items": inventory_summary["unvalued_items"],
            },
            "trends": trends,
            "top_products": top_products,
            "top_profit_products": top_profit_products,
            "inventory_by_item": [
                {
                    **row,
                    "inventory_value": _decimal_text(row["inventory_value"]),
                }
                for row in inventory_by_item
            ],
            "purchases": purchase_page,
            "sales": sales_page,
            "inventory": inventory_page,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    active_items = Item.objects.filter(is_active=True)

    summary = active_items.aggregate(
        total_items=Count("id"),
        total_units=Coalesce(Sum("quantity"), Value(0)),
    )
    inventory_summary = active_items.aggregate(
        inventory_value=Sum(
            ExpressionWrapper(
                F("quantity") * F("inventory_unit_cost"),
                output_field=DecimalField(
                    max_digits=18, decimal_places=2
                ),
            )
        ),
        unvalued_items=Count(
            "id",
            filter=models.Q(quantity__gt=0, inventory_unit_cost__isnull=True),
        ),
    )

    low_stock_items = active_items.filter(
        quantity__lte=F("reorder_level")
    ).order_by("quantity", "name")

    inventory_value = None
    if inventory_summary["unvalued_items"] == 0:
        inventory_value = str(
            inventory_summary["inventory_value"] or Decimal("0.00")
        )

    return Response({
        "total_items": summary["total_items"],
        "total_units": summary["total_units"],
        "low_stock_count": low_stock_items.count(),
        "inventory_value": inventory_value,
        "known_inventory_value": str(
            inventory_summary["inventory_value"] or Decimal("0.00")
        ),
        "unvalued_items": inventory_summary["unvalued_items"],
        "low_stock_items": ItemSerializer(
            low_stock_items[:5], many=True
        ).data,
    })
