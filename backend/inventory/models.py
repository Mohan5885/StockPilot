
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Item(models.Model):
    sku = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=5)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.sku} - {self.name}"


class Purchase(models.Model):
    reference = models.CharField(max_length=50, unique=True)
    supplier_name = models.CharField(max_length=150)
    item = models.ForeignKey(
        Item,
        on_delete=models.PROTECT,
        related_name="purchases",
    )
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    notes = models.TextField(blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_purchases",
    )

    class Meta:
        ordering = ["-received_at", "-id"]

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost

    def __str__(self):
        return f"{self.reference} - {self.item.sku}"


class StockMovement(models.Model):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    ADJUSTMENT = "ADJUSTMENT"

    MOVEMENT_CHOICES = [
        (PURCHASE, "Purchase / Inbound"),
        (SALE, "Sale / Issue"),
        (ADJUSTMENT, "Stock Adjustment"),
    ]

    item = models.ForeignKey(
        Item,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    movement_type = models.CharField(
        max_length=20,
        choices=MOVEMENT_CHOICES,
    )
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    quantity_before = models.PositiveIntegerField()
    quantity_after = models.PositiveIntegerField()
    reference = models.CharField(max_length=50, db_index=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_stock_movements",
    )

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return (
            f"{self.movement_type}: {self.item.sku} "
            f"({self.quantity_before} -> {self.quantity_after})"
        )
