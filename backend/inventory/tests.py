from decimal import Decimal

from django.contrib.auth.models import User
from django.urls import reverse
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
