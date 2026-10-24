
from rest_framework import serializers

from .models import Item, Purchase, StockMovement


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = "__all__"


class PurchaseSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(
        source="item.name", read_only=True
    )
    item_sku = serializers.CharField(
        source="item.sku", read_only=True
    )
    total_cost = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        read_only=True,
    )
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
        default="",
    )

    class Meta:
        model = Purchase
        fields = [
            "id",
            "reference",
            "supplier_name",
            "item",
            "item_name",
            "item_sku",
            "quantity",
            "unit_cost",
            "total_cost",
            "notes",
            "received_at",
            "created_by",
            "created_by_username",
        ]
        read_only_fields = [
            "id",
            "received_at",
            "created_by",
            "created_by_username",
            "item_name",
            "item_sku",
            "total_cost",
        ]

    def validate_reference(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Purchase reference is required."
            )

        queryset = Purchase.objects.filter(
            reference__iexact=value
        )

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                "This purchase reference already exists."
            )

        return value

    def validate_supplier_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Supplier name is required."
            )

        return value

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Quantity must be at least 1."
            )

        return value

    def validate_unit_cost(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Unit cost must be greater than zero."
            )

        return value

    def validate_item(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "This item is inactive."
            )

        return value


class StockMovementSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(
        source="item.name", read_only=True
    )
    item_sku = serializers.CharField(
        source="item.sku", read_only=True
    )
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
        default="",
    )

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "item",
            "item_name",
            "item_sku",
            "movement_type",
            "quantity",
            "quantity_before",
            "quantity_after",
            "reference",
            "notes",
            "created_at",
            "created_by",
            "created_by_username",
        ]
        read_only_fields = fields
