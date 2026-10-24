
from django.contrib import admin
from .models import Item


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = (
        "sku",
        "name",
        "unit_price",
        "quantity",
        "reorder_level",
        "is_active",
    )

    search_fields = ("sku", "name")
    list_filter = ("is_active",)
    ordering = ("name",)
