from decimal import Decimal
from datetime import timedelta

from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from accounts.models import EmployeeProfile, LoginHistory

from .models import Item, Purchase, StockMovement


class InventoryResetAPITests(APITestCase):
	def setUp(self):
		admin_user = User.objects.create_user(
			username="reset-admin",
			password="Admin-Password-2026!",
		)
		self.admin_profile = EmployeeProfile.objects.create(
			user=admin_user,
			employee_id="RESET-ADMIN",
			mobile_number="9000000100",
			role="ADMIN",
		)
		staff_user = User.objects.create_user(
			username="reset-staff",
			password="Staff-Password-2026!",
		)
		self.staff_profile = EmployeeProfile.objects.create(
			user=staff_user,
			employee_id="RESET-STAFF",
			mobile_number="9000000101",
			role="STAFF",
		)
		self.admin_client = APIClient()
		self.admin_client.credentials(
			HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=admin_user).key}"
		)
		self.staff_client = APIClient()
		self.staff_client.credentials(
			HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=staff_user).key}"
		)

	def create_inventory_records(self):
		item = Item.objects.create(
			sku="RESET-SKU",
			name="Reset sample item",
			unit_price=Decimal("10.00"),
			quantity=4,
		)
		Purchase.objects.create(
			reference="RESET-PURCHASE",
			supplier_name="Test supplier",
			item=item,
			quantity=4,
			unit_cost=Decimal("8.00"),
		)
		StockMovement.objects.create(
			item=item,
			movement_type=StockMovement.SALE,
			quantity=1,
			quantity_before=5,
			quantity_after=4,
			reference="RESET-SALE",
		)
		LoginHistory.objects.create(
			employee_profile=self.admin_profile,
			employee_id=self.admin_profile.employee_id,
			username=self.admin_profile.user.username,
			status="SUCCESS",
		)

	def test_only_admin_can_request_reset_code(self):
		response = self.staff_client.post(reverse("inventory-reset-challenge"))

		self.assertEqual(response.status_code, 403)


class ProfitAndLossReportAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="report-admin",
            password="test-password",
        )
        EmployeeProfile.objects.create(
            user=self.admin,
            employee_id="REPORT-ADMIN",
            mobile_number="9000000200",
            role="ADMIN",
        )
        self.staff = User.objects.create_user(
            username="report-staff",
            password="test-password",
        )
        EmployeeProfile.objects.create(
            user=self.staff,
            employee_id="REPORT-STAFF",
            mobile_number="9000000201",
            role="STAFF",
        )
        self.admin_client = APIClient()
        self.admin_client.credentials(
            HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}"
        )
        self.staff_client = APIClient()
        self.staff_client.credentials(
            HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.staff).key}"
        )

    def create_item(self, quantity=0, cost=None):
        return Item.objects.create(
            sku="COST-SKU",
            name="Costed inventory item",
            unit_price=Decimal("700.00"),
            quantity=quantity,
            inventory_unit_cost=cost,
        )

    def record_purchase(self, item, reference, quantity, unit_cost):
        return self.admin_client.post(
            reverse("purchase-list"),
            {
                "reference": reference,
                "supplier_name": "Supplier",
                "item": item.pk,
                "quantity": quantity,
                "unit_cost": str(unit_cost),
            },
            format="json",
        )

    def record_sale(
        self,
        item,
        reference,
        quantity,
        unit_price,
        customer_name="Test customer",
        customer_phone="",
    ):
        return self.admin_client.post(
            reverse("sale-list"),
            {
                "reference": reference,
                "item": item.pk,
                "quantity": quantity,
                "transaction_type": "SALE",
                "unit_selling_price": str(unit_price),
                "customer_name": customer_name,
                "customer_phone": customer_phone,
            },
            format="json",
        )

    def test_sale_saves_customer_details_and_returns_them(self):
        item = self.create_item(quantity=4, cost=Decimal("8.0000"))

        response = self.record_sale(
            item,
            "CUSTOMER-SALE-1",
            1,
            Decimal("15.00"),
            customer_name="  Priya Sharma  ",
            customer_phone="9876543210",
        )

        self.assertEqual(response.status_code, 201, response.data)
        movement = StockMovement.objects.get(reference="CUSTOMER-SALE-1")
        self.assertEqual(movement.customer_name, "Priya Sharma")
        self.assertEqual(movement.customer_phone, "9876543210")
        self.assertEqual(response.data["customer_name"], "Priya Sharma")
        self.assertEqual(response.data["customer_phone"], "9876543210")

        report = self.admin_client.get(reverse("reports-data"))
        self.assertEqual(report.status_code, 200)
        self.assertEqual(
            report.data["sales"]["results"][0]["customer_name"],
            "Priya Sharma",
        )
        self.assertEqual(
            report.data["sales"]["results"][0]["customer_phone"],
            "9876543210",
        )

    def test_sale_rejects_customer_phone_unless_exactly_ten_digits(self):
        item = self.create_item(quantity=4, cost=Decimal("8.0000"))

        for phone in ("123456789", "12345678901", "12345abc90"):
            with self.subTest(phone=phone):
                response = self.record_sale(
                    item,
                    f"INVALID-PHONE-{len(phone)}-{phone[-1]}",
                    1,
                    Decimal("15.00"),
                    customer_phone=phone,
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("customer_phone", response.data)

        item.refresh_from_db()
        self.assertEqual(item.quantity, 4)

    def test_sale_requires_customer_name_without_reducing_stock(self):
        item = self.create_item(quantity=4, cost=Decimal("8.0000"))

        response = self.record_sale(
            item,
            "CUSTOMER-NAME-REQUIRED",
            1,
            Decimal("15.00"),
            customer_name="   ",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("customer_name", response.data)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 4)
        self.assertFalse(
            StockMovement.objects.filter(
                reference="CUSTOMER-NAME-REQUIRED"
            ).exists()
        )

    def test_purchase_uses_existing_item_and_updates_weighted_average(self):
        item = self.create_item(quantity=10, cost=Decimal("600.0000"))

        response = self.record_purchase(
            item, "COST-PURCHASE-1", 10, Decimal("650.00")
        )

        self.assertEqual(response.status_code, 201)
        item.refresh_from_db()
        self.assertEqual(Item.objects.count(), 1)
        self.assertEqual(item.quantity, 20)
        self.assertEqual(item.inventory_unit_cost, Decimal("625.0000"))
        self.assertEqual(item.unit_price, Decimal("700.00"))
        self.assertEqual(response.data["unit_cost"], "650.00")

    def test_other_purchase_creates_catalog_item_and_purchase_atomically(self):
        response = self.admin_client.post(
            reverse("purchase-list"),
            {
                "item": "other",
                "item_name": "New purchase-only catalog item",
                "brand": "Acme",
                "model": "MX-1",
                "category": "Accessories",
                "warranty": "12 months",
                "unit_price": "",
                "reference": "NEW-ITEM-PURCHASE",
                "supplier_name": "New supplier",
                "quantity": 3,
                "unit_cost": "600.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        item = Item.objects.get(name="New purchase-only catalog item")
        self.assertEqual(item.quantity, 3)
        self.assertEqual(item.inventory_unit_cost, Decimal("600.0000"))
        self.assertEqual(item.unit_price, Decimal("0.00"))
        self.assertEqual(item.brand, "Acme")
        self.assertEqual(item.model, "MX-1")
        self.assertEqual(item.category, "Accessories")
        self.assertEqual(item.warranty, "12 months")
        self.assertEqual(item.sku, "NEW-PURCHASE-ONLY-CATALOG-ITEM")
        self.assertEqual(Purchase.objects.count(), 1)
        self.assertEqual(response.data["item"], item.pk)

    def test_other_purchase_rejects_duplicate_item_name_without_creating_records(self):
        self.create_item()

        response = self.admin_client.post(
            reverse("purchase-list"),
            {
                "item": "other",
                "item_name": "Costed inventory item",
                "reference": "DUPLICATE-NEW-ITEM",
                "supplier_name": "Supplier",
                "quantity": 1,
                "unit_cost": "10.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Item.objects.count(), 1)
        self.assertEqual(Purchase.objects.count(), 0)

    def test_other_purchase_makes_readable_sku_unique_for_similar_names(self):
        Item.objects.create(
            sku="DISPLAY-PANEL",
            name="Display Panel",
            unit_price=Decimal("10.00"),
            quantity=0,
        )

        response = self.admin_client.post(
            reverse("purchase-list"),
            {
                "item": "other",
                "item_name": "Display-Panel",
                "reference": "READABLE-SKU-PURCHASE",
                "supplier_name": "Supplier",
                "quantity": 1,
                "unit_cost": "10.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        item = Item.objects.get(name="Display-Panel")
        self.assertEqual(item.sku, "DISPLAY-PANEL-2")

    def test_item_catalog_saves_new_product_details_without_creating_a_purchase(self):
        response = self.admin_client.post(
            reverse("item-list"),
            {
                "sku": "DETAIL-SKU",
                "name": "Detailed item",
                "brand": "StockPilot",
                "model": "Model-X",
                "category": "Equipment",
                "warranty": "12 months",
                "description": "Catalog description",
                "unit_price": "125.00",
                "quantity": 0,
                "reorder_level": 2,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["brand"], "StockPilot")
        self.assertEqual(response.data["model"], "Model-X")
        self.assertEqual(response.data["category"], "Equipment")
        self.assertEqual(response.data["warranty"], "12 months")
        self.assertEqual(Purchase.objects.count(), 0)

    def test_sale_snapshots_price_and_cost_and_reports_gross_profit(self):
        item = self.create_item(quantity=10, cost=Decimal("600.0000"))
        self.record_purchase(item, "COST-PURCHASE-2", 10, Decimal("650.00"))

        response = self.record_sale(
            item, "COST-SALE-1", 5, Decimal("700.00")
        )

        self.assertEqual(response.status_code, 201)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 15)
        movement = StockMovement.objects.get(reference="COST-SALE-1")
        self.assertEqual(movement.unit_selling_price, Decimal("700.00"))
        self.assertEqual(movement.unit_cost, Decimal("625.0000"))

        report = self.admin_client.get(reverse("reports-data"))
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.data["summary"]["sales_revenue"], "3500.00")
        self.assertEqual(report.data["summary"]["cogs"], "3125.00")
        self.assertEqual(report.data["summary"]["gross_profit"], "375.00")

    def test_top_profit_products_are_ranked_by_profit_not_sales_revenue(self):
        high_revenue = self.create_item(quantity=1, cost=Decimal("99.0000"))
        high_profit = Item.objects.create(
            sku="PROFIT-SKU",
            name="Higher gross profit",
            unit_price=Decimal("50.00"),
            quantity=1,
            inventory_unit_cost=Decimal("0.0000"),
        )
        self.record_sale(
            high_revenue, "HIGH-REVENUE-SALE", 1, Decimal("100.00")
        )
        self.record_sale(
            high_profit, "HIGH-PROFIT-SALE", 1, Decimal("50.00")
        )

        report = self.admin_client.get(reverse("reports-data"))

        self.assertEqual(report.data["top_products"][0]["sku"], "COST-SKU")
        self.assertEqual(
            report.data["top_profit_products"][0]["sku"], "PROFIT-SKU"
        )

    def test_duplicate_sale_reference_does_not_reduce_stock_twice(self):
        item = self.create_item(quantity=5, cost=Decimal("10.0000"))
        first = self.record_sale(item, "DUP-SALE-1", 2, Decimal("15.00"))
        duplicate = self.record_sale(item, "DUP-SALE-1", 2, Decimal("15.00"))

        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 3)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.SALE,
                reference="DUP-SALE-1",
            ).count(),
            1,
        )

    def test_stock_issue_does_not_inflate_sales_revenue(self):
        item = self.create_item(quantity=4, cost=Decimal("8.0000"))
        response = self.admin_client.post(
            reverse("sale-list"),
            {
                "reference": "ISSUE-1",
                "item": item.pk,
                "quantity": 1,
                "transaction_type": "ISSUE",
            },
            format="json",
        )
        report = self.admin_client.get(reverse("reports-data"))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(report.data["summary"]["sales_count"], 0)
        self.assertEqual(report.data["summary"]["sales_revenue"], "0.00")

    def test_zero_revenue_has_no_margin_and_staff_cannot_read_financial_report(self):
        item = self.create_item()
        report = self.admin_client.get(reverse("reports-data"))
        forbidden = self.staff_client.get(reverse("reports-data"))

        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.data["summary"]["sales_revenue"], "0.00")
        self.assertIsNone(report.data["summary"]["gross_profit_margin"])
        self.assertEqual(forbidden.status_code, 403)

    def test_zero_price_sale_calculates_loss_without_division_error(self):
        item = self.create_item(quantity=1, cost=Decimal("5.0000"))
        sale = self.record_sale(item, "ZERO-PRICE-SALE", 1, Decimal("0.00"))

        report = self.admin_client.get(reverse("reports-data"))

        self.assertEqual(sale.status_code, 201)
        self.assertEqual(report.data["summary"]["sales_revenue"], "0.00")
        self.assertEqual(report.data["summary"]["gross_profit"], "-5.00")
        self.assertIsNone(report.data["summary"]["gross_profit_margin"])

    def test_staff_serializers_do_not_expose_inventory_or_purchase_costs(self):
        item = self.create_item(quantity=0, cost=Decimal("5.0000"))
        self.record_purchase(item, "PRIVATE-COST-PURCHASE", 1, Decimal("6.00"))

        item_data = self.staff_client.get(reverse("item-list")).data[0]
        purchase_data = self.staff_client.get(reverse("purchase-list")).data[0]

        self.assertNotIn("inventory_unit_cost", item_data)
        self.assertNotIn("unit_cost", purchase_data)
        self.assertNotIn("total_cost", purchase_data)

    def test_dashboard_inventory_value_is_available_to_staff_without_cost_details(self):
        self.create_item(quantity=2, cost=Decimal("5.0000"))

        admin_response = self.admin_client.get(reverse("dashboard-summary"))
        staff_response = self.staff_client.get(reverse("dashboard-summary"))
        anonymous_response = APIClient().get(reverse("dashboard-summary"))

        self.assertEqual(
            Decimal(admin_response.data["inventory_value"]),
            Decimal("10.00"),
        )
        self.assertEqual(
            Decimal(staff_response.data["inventory_value"]),
            Decimal("10.00"),
        )
        self.assertEqual(
            Decimal(staff_response.data["known_inventory_value"]),
            Decimal("10.00"),
        )
        self.assertEqual(staff_response.data["unvalued_items"], 0)
        self.assertNotIn(
            "inventory_unit_cost",
            staff_response.data["low_stock_items"][0],
        )
        self.assertEqual(anonymous_response.status_code, 401)

    def test_dashboard_returns_known_inventory_value_when_some_costs_are_missing(self):
        self.create_item(quantity=2, cost=Decimal("5.0000"))
        Item.objects.create(
            sku="UNVALUED-SKU",
            name="Unvalued item",
            unit_price=Decimal("10.00"),
            quantity=3,
        )

        response = self.admin_client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["inventory_value"])
        self.assertEqual(
            Decimal(response.data["known_inventory_value"]),
            Decimal("10.00"),
        )
        self.assertEqual(response.data["unvalued_items"], 1)

        staff_response = self.staff_client.get(reverse("dashboard-summary"))
        self.assertIsNone(staff_response.data["inventory_value"])
        self.assertEqual(
            Decimal(staff_response.data["known_inventory_value"]),
            Decimal("10.00"),
        )
        self.assertEqual(staff_response.data["unvalued_items"], 1)

    def test_legacy_sale_without_price_or_cost_is_not_reported_as_zero_profit(self):
        item = self.create_item(quantity=1)
        StockMovement.objects.create(
            item=item,
            movement_type=StockMovement.SALE,
            quantity=1,
            quantity_before=2,
            quantity_after=1,
            reference="LEGACY-SALE",
        )

        response = self.admin_client.get(reverse("reports-data"))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["summary"]["sales_revenue"])
        self.assertIsNone(response.data["summary"]["cogs"])
        self.assertIsNone(response.data["summary"]["gross_profit"])
        self.assertFalse(response.data["summary"]["data_complete"])

    def test_opening_cost_initialization_is_admin_only_and_one_time(self):
        item = self.create_item(quantity=7)
        url = reverse("item-initialize-cost", kwargs={"pk": item.pk})

        denied = self.staff_client.post(
            url, {"unit_cost": "12.50"}, format="json"
        )
        initialized = self.admin_client.post(
            url, {"unit_cost": "12.50"}, format="json"
        )
        repeated = self.admin_client.post(
            url, {"unit_cost": "14.00"}, format="json"
        )

        item.refresh_from_db()
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(initialized.status_code, 200)
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(item.quantity, 7)
        self.assertEqual(item.inventory_unit_cost, Decimal("12.5000"))

    def test_custom_date_range_filters_sales_by_transaction_date(self):
        item = self.create_item(quantity=4, cost=Decimal("8.0000"))
        self.record_sale(item, "DATE-SALE-1", 1, Decimal("15.00"))
        StockMovement.objects.filter(reference="DATE-SALE-1").update(
            created_at=timezone.now() - timedelta(days=10)
        )
        start_date = timezone.localdate().isoformat()
        response = self.admin_client.get(
            reverse("reports-data"),
            {
                "period": "custom",
                "start_date": start_date,
                "end_date": start_date,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["sales_count"], 0)

class RemainingInventoryResetAPITests(InventoryResetAPITests):
	def test_reset_code_clears_inventory_but_preserves_accounts_and_history(self):
		self.create_inventory_records()
		challenge_response = self.admin_client.post(
			reverse("inventory-reset-challenge")
		)
		self.assertEqual(challenge_response.status_code, 200)
		code = challenge_response.data["code"]

		incorrect_response = self.admin_client.post(
			reverse("inventory-reset"),
			{"code": "incorrect", "confirmation": "RESET INVENTORY"},
			format="json",
		)
		self.assertEqual(incorrect_response.status_code, 400)
		self.assertEqual(Item.objects.count(), 1)

		reset_response = self.admin_client.post(
			reverse("inventory-reset"),
			{"code": code, "confirmation": "RESET INVENTORY"},
			format="json",
		)
		self.assertEqual(reset_response.status_code, 200)
		self.assertEqual(reset_response.data["deleted"]["items"], 1)
		self.assertEqual(Item.objects.count(), 0)
		self.assertEqual(Purchase.objects.count(), 0)
		self.assertEqual(StockMovement.objects.count(), 0)
		self.assertTrue(EmployeeProfile.objects.filter(id=self.staff_profile.id).exists())
		self.assertEqual(LoginHistory.objects.count(), 1)

		replay_response = self.admin_client.post(
			reverse("inventory-reset"),
			{"code": code, "confirmation": "RESET INVENTORY"},
			format="json",
		)
		self.assertEqual(replay_response.status_code, 400)

	def test_reset_requires_confirmation_phrase(self):
		self.create_inventory_records()
		code = self.admin_client.post(
			reverse("inventory-reset-challenge")
		).data["code"]

		response = self.admin_client.post(
			reverse("inventory-reset"), {"code": code}, format="json"
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(Item.objects.count(), 1)

	def test_cancelled_challenge_cannot_reset_inventory(self):
		self.create_inventory_records()
		code = self.admin_client.post(
			reverse("inventory-reset-challenge")
		).data["code"]
		cancel_response = self.admin_client.post(
			reverse("inventory-reset-cancel")
		)
		self.assertEqual(cancel_response.status_code, 200)

		reset_response = self.admin_client.post(
			reverse("inventory-reset"),
			{"code": code, "confirmation": "RESET INVENTORY"},
			format="json",
		)

		self.assertEqual(reset_response.status_code, 400)
		self.assertEqual(Item.objects.count(), 1)

	def test_reset_challenge_expires_after_five_failed_attempts(self):
		self.create_inventory_records()
		self.admin_client.post(reverse("inventory-reset-challenge"))

		for _ in range(5):
			response = self.admin_client.post(
				reverse("inventory-reset"),
				{"code": "incorrect", "confirmation": "RESET INVENTORY"},
				format="json",
			)

		self.assertEqual(response.status_code, 400)
		self.assertIn("Too many", response.data["detail"])
		self.assertEqual(Item.objects.count(), 1)

	def test_staff_cannot_confirm_inventory_reset(self):
		response = self.staff_client.post(
			reverse("inventory-reset"), {"code": "123456"}, format="json"
		)

		self.assertEqual(response.status_code, 403)
