
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ItemViewSet,
    PurchaseViewSet,
    SaleViewSet,
    StockMovementViewSet,
    dashboard_summary,
    inventory_reset,
    inventory_reset_cancel,
    inventory_reset_challenge,
)

router = DefaultRouter()
router.register("items", ItemViewSet, basename="item")
router.register("purchases", PurchaseViewSet, basename="purchase")
router.register("sales", SaleViewSet, basename="sale")
router.register(
    "stock-movements",
    StockMovementViewSet,
    basename="stock-movement",
)

urlpatterns = [
    path("dashboard/", dashboard_summary, name="dashboard-summary"),
    path(
        "admin/reset-challenge/",
        inventory_reset_challenge,
        name="inventory-reset-challenge",
    ),
    path(
        "admin/reset-challenge/cancel/",
        inventory_reset_cancel,
        name="inventory-reset-cancel",
    ),
    path("admin/reset/", inventory_reset, name="inventory-reset"),
    *router.urls,
]
