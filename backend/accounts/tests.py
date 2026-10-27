from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from .models import EmployeeProfile, LoginHistory, PasswordResetRequest


class StaffAccountAPITests(APITestCase):
	def setUp(self):
		self.admin_user = User.objects.create_user(
			username="admin-001",
			password="Admin-Password-2026!",
		)
		EmployeeProfile.objects.create(
			user=self.admin_user,
			employee_id="ADMIN-001",
			full_name="System Administrator",
			mobile_number="9000000001",
			role="ADMIN",
		)
		self.staff_user = User.objects.create_user(
			username="staff-001",
			password="Staff-Password-2026!",
		)
		self.staff_profile = EmployeeProfile.objects.create(
			user=self.staff_user,
			employee_id="STAFF-001",
			full_name="Store Associate",
			mobile_number="9000000002",
			role="STAFF",
		)
		self.admin_token = Token.objects.create(user=self.admin_user)
		self.staff_token = Token.objects.create(user=self.staff_user)
		self.admin_client = APIClient()
		self.admin_client.credentials(
			HTTP_AUTHORIZATION=f"Token {self.admin_token.key}"
		)
		self.staff_client = APIClient()
		self.staff_client.credentials(
			HTTP_AUTHORIZATION=f"Token {self.staff_token.key}"
		)

	def test_login_rejects_wrong_portal_role(self):
		response = self.client.post(
			reverse("login"),
			{
				"employee_id": "STAFF-001",
				"password": "Staff-Password-2026!",
				"portal": "ADMIN",
			},
			format="json",
		)

		self.assertEqual(response.status_code, 403)
		self.assertEqual(LoginHistory.objects.latest("id").status, "FAILED")

	def test_login_uses_one_flow_for_admin_and_staff_without_portal(self):
		staff_response = self.client.post(
			reverse("login"),
			{
				"employee_id": "STAFF-001",
				"password": "Staff-Password-2026!",
			},
			format="json",
		)
		admin_response = self.client.post(
			reverse("login"),
			{
				"employee_id": "ADMIN-001",
				"password": "Admin-Password-2026!",
			},
			format="json",
		)

		self.assertEqual(staff_response.status_code, 200)
		self.assertEqual(staff_response.data["employee"]["role"], "STAFF")
		self.assertEqual(admin_response.status_code, 200)
		self.assertEqual(admin_response.data["employee"]["role"], "ADMIN")

	def test_login_accepts_employee_id_without_case_sensitivity(self):
		response = self.client.post(
			reverse("login"),
			{
				"employee_id": "staff-001",
				"password": "Staff-Password-2026!",
			},
			format="json",
		)

		self.assertEqual(response.status_code, 200, response.data)
		self.assertEqual(response.data["employee"]["employee_id"], "STAFF-001")

	def test_login_accepts_legacy_username_when_it_differs_from_employee_id(self):
		self.staff_user.username = "legacy-staff-login"
		self.staff_user.save(update_fields=["username"])

		response = self.client.post(
			reverse("login"),
			{
				"employee_id": "LEGACY-STAFF-LOGIN",
				"password": "Staff-Password-2026!",
			},
			format="json",
		)

		self.assertEqual(response.status_code, 200, response.data)
		self.assertEqual(response.data["employee"]["employee_id"], "STAFF-001")

	def test_login_rejects_ambiguous_employee_id_or_username(self):
		other_user = User.objects.create_user(
			username="STAFF-001",
			password="Other-Password-2026!",
		)
		EmployeeProfile.objects.create(
			user=other_user,
			employee_id="OTHER-001",
			mobile_number="9000000003",
			role="STAFF",
		)

		response = self.client.post(
			reverse("login"),
			{
				"employee_id": "STAFF-001",
				"password": "Staff-Password-2026!",
			},
			format="json",
		)

		self.assertEqual(response.status_code, 401)
		self.assertEqual(response.data["message"], "Invalid employee ID or password.")

	def test_authenticated_user_can_change_password(self):
		wrong_current = self.staff_client.post(
			reverse("change-password"),
			{
				"current_password": "wrong-password",
				"new_password": "New-Unique-Password-2026!",
				"confirm_password": "New-Unique-Password-2026!",
			},
			format="json",
		)
		changed = self.staff_client.post(
			reverse("change-password"),
			{
				"current_password": "Staff-Password-2026!",
				"new_password": "New-Unique-Password-2026!",
				"confirm_password": "New-Unique-Password-2026!",
			},
			format="json",
		)

		self.staff_user.refresh_from_db()
		self.assertEqual(wrong_current.status_code, 400)
		self.assertEqual(changed.status_code, 200)
		self.assertTrue(self.staff_user.check_password("New-Unique-Password-2026!"))
		self.assertTrue(Token.objects.filter(user=self.staff_user).exists())

	def test_staff_cannot_list_staff_accounts(self):
		response = self.staff_client.get(reverse("staff-list-create"))

		self.assertEqual(response.status_code, 403)

	def test_admin_can_create_staff_account(self):
		response = self.admin_client.post(
			reverse("staff-list-create"),
			{
				"employee_id": "STAFF-002",
				"full_name": "New Associate",
				"email": "associate@example.com",
				"mobile_number": "9000000003",
				"department": "Receiving",
				"job_title": "Inventory Associate",
				"start_date": "2026-10-21",
				"password": "Unique-Staff-Password-2026!",
			},
			format="json",
		)

		self.assertEqual(response.status_code, 201, response.data)
		created_user = User.objects.get(username="STAFF-002")
		profile = created_user.employee_profile
		self.assertTrue(created_user.check_password("Unique-Staff-Password-2026!"))
		self.assertEqual(profile.role, "STAFF")
		self.assertEqual(profile.full_name, "New Associate")
		self.assertEqual(profile.department, "Receiving")
		self.assertNotIn("password", response.data)

	def test_staff_creation_requires_exactly_ten_mobile_digits(self):
		for index, mobile_number in enumerate(
			("900000000", "90000000000", "90000000ab")
		):
			with self.subTest(mobile_number=mobile_number):
				response = self.admin_client.post(
					reverse("staff-list-create"),
					{
						"employee_id": f"STAFF-INVALID-{index}",
						"full_name": "Invalid Mobile Associate",
						"mobile_number": mobile_number,
						"password": "Unique-Staff-Password-2026!",
					},
					format="json",
				)

				self.assertEqual(response.status_code, 400)
				self.assertIn("mobile_number", response.data)

	def test_staff_mobile_update_requires_exactly_ten_digits(self):
		response = self.admin_client.patch(
			reverse("staff-detail", args=[self.staff_profile.id]),
			{"mobile_number": "123456789"},
			format="json",
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn("mobile_number", response.data)
		self.staff_profile.refresh_from_db()
		self.assertEqual(self.staff_profile.mobile_number, "9000000002")

	def test_admin_deactivation_disables_login_and_revokes_token(self):
		response = self.admin_client.patch(
			reverse("staff-detail", args=[self.staff_profile.id]),
			{"is_active": False},
			format="json",
		)

		self.assertEqual(response.status_code, 200, response.data)
		self.staff_user.refresh_from_db()
		self.assertFalse(self.staff_user.is_active)
		self.assertFalse(Token.objects.filter(user=self.staff_user).exists())

		login_response = self.client.post(
			reverse("login"),
			{
				"employee_id": "STAFF-001",
				"password": "Staff-Password-2026!",
				"portal": "STAFF",
			},
			format="json",
		)
		self.assertEqual(login_response.status_code, 401)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        self.admin_user = User.objects.create_user(
            username="admin-reset",
            password="Admin-Original-Password-2026!",
            email="admin@example.com",
        )
        self.admin_profile = EmployeeProfile.objects.create(
            user=self.admin_user,
            employee_id="ADMIN-RESET",
            full_name="Reset Administrator",
            mobile_number="9000000011",
            role="ADMIN",
        )
        self.staff_user = User.objects.create_user(
            username="staff-reset",
            password="Staff-Original-Password-2026!",
            email="staff-reset@example.com",
        )
        self.staff_profile = EmployeeProfile.objects.create(
            user=self.staff_user,
            employee_id="STAFF-RESET",
            full_name="Reset Staff Member",
            mobile_number="9000000012",
            role="STAFF",
        )
        admin_token = Token.objects.create(user=self.admin_user)
        staff_token = Token.objects.create(user=self.staff_user)
        self.admin_client = APIClient()
        self.admin_client.credentials(
            HTTP_AUTHORIZATION=f"Token {admin_token.key}"
        )
        self.staff_client = APIClient()
        self.staff_client.credentials(
            HTTP_AUTHORIZATION=f"Token {staff_token.key}"
        )

    def test_password_reset_request_can_identify_employee_without_role_picker(self):
        response = self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "STAFF-RESET"},
            format="json",
        )

        self.assertEqual(response.status_code, 202)
        self.assertTrue(
            PasswordResetRequest.objects.filter(
                employee_profile=self.staff_profile,
                status="PENDING",
            ).exists()
        )

    def test_reset_request_response_does_not_disclose_account_existence(self):
        valid_response = self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "STAFF-RESET", "portal": "STAFF"},
            format="json",
        )
        invalid_response = self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "UNKNOWN-RESET", "portal": "STAFF"},
            format="json",
        )

        self.assertEqual(valid_response.status_code, 202)
        self.assertEqual(valid_response.data, invalid_response.data)
        self.assertEqual(PasswordResetRequest.objects.count(), 1)

    def test_only_admin_can_review_and_approve_reset_requests(self):
        self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "STAFF-RESET", "portal": "STAFF"},
            format="json",
        )

        staff_response = self.staff_client.get(
            reverse("password-reset-requests-review")
        )
        pending_response = self.admin_client.get(
            reverse("password-reset-requests-review")
        )

        self.assertEqual(staff_response.status_code, 403)
        self.assertEqual(pending_response.status_code, 200)
        self.assertEqual(len(pending_response.data), 1)
        self.assertEqual(
            pending_response.data[0]["employee_id"],
            "STAFF-RESET",
        )

        reset_request = PasswordResetRequest.objects.get()
        approval_response = self.admin_client.post(
            reverse(
                "password-reset-request-approve",
                args=[reset_request.id],
            ),
            {},
            format="json",
        )

        self.assertEqual(approval_response.status_code, 200)
        self.assertNotIn("approval_code", approval_response.data)
        self.assertIn("staff-reset@example.com", approval_response.data["detail"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            mail.outbox[0].to,
            ["staff-reset@example.com"],
        )
        code = mail.outbox[0].body.split("one-time approval code is: ")[1].splitlines()[0]
        self.assertRegex(code, r"^\d{8}$")
        reset_request.refresh_from_db()
        self.assertEqual(reset_request.status, "APPROVED")
        self.assertNotEqual(
            reset_request.approval_code_hash,
            code,
        )

    def test_approved_code_resets_password_once_and_revokes_tokens(self):
        self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "STAFF-RESET", "portal": "STAFF"},
            format="json",
        )
        reset_request = PasswordResetRequest.objects.get()
        approval_response = self.admin_client.post(
            reverse(
                "password-reset-request-approve",
                args=[reset_request.id],
            ),
            {},
            format="json",
        )
        code = mail.outbox[0].body.split("one-time approval code is: ")[1].splitlines()[0]

        reset_response = self.client.post(
            reverse("password-reset-confirm"),
            {
                "employee_id": "STAFF-RESET",
                "portal": "STAFF",
                "approval_code": code,
                "new_password": "Another-Unique-Password-2026!",
            },
            format="json",
        )

        self.assertEqual(reset_response.status_code, 200, reset_response.data)
        self.staff_user.refresh_from_db()
        self.assertTrue(
            self.staff_user.check_password("Another-Unique-Password-2026!")
        )
        self.assertFalse(Token.objects.filter(user=self.staff_user).exists())
        reset_request.refresh_from_db()
        self.assertEqual(reset_request.status, "COMPLETED")
        self.assertEqual(reset_request.approval_code_hash, "")

        reused_code_response = self.client.post(
            reverse("password-reset-confirm"),
            {
                "employee_id": "STAFF-RESET",
                "portal": "STAFF",
                "approval_code": code,
                "new_password": "Third-Unique-Password-2026!",
            },
            format="json",
        )
        self.assertEqual(reused_code_response.status_code, 400)

    def test_admin_cannot_approve_own_reset_request(self):
        self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "ADMIN-RESET", "portal": "ADMIN"},
            format="json",
        )
        reset_request = PasswordResetRequest.objects.get()

        response = self.admin_client.post(
            reverse(
                "password-reset-request-approve",
                args=[reset_request.id],
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        reset_request.refresh_from_db()
        self.assertEqual(reset_request.status, "PENDING")

    def test_five_invalid_codes_expire_the_approval(self):
        self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "STAFF-RESET", "portal": "STAFF"},
            format="json",
        )
        reset_request = PasswordResetRequest.objects.get()
        approval_response = self.admin_client.post(
            reverse(
                "password-reset-request-approve",
                args=[reset_request.id],
            ),
            {},
            format="json",
        )
        valid_code = mail.outbox[0].body.split("one-time approval code is: ")[1].splitlines()[0]
        wrong_code = "00000000" if valid_code != "00000000" else "99999999"

        for _ in range(5):
            response = self.client.post(
                reverse("password-reset-confirm"),
                {
                    "employee_id": "STAFF-RESET",
                    "portal": "STAFF",
                    "approval_code": wrong_code,
                    "new_password": "Another-Unique-Password-2026!",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 400)

        reset_request.refresh_from_db()
        self.assertEqual(reset_request.status, "EXPIRED")
        self.assertEqual(reset_request.failed_attempts, 5)
        self.assertEqual(reset_request.approval_code_hash, "")

    def test_email_delivery_failure_leaves_request_pending(self):
        self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "STAFF-RESET", "portal": "STAFF"},
            format="json",
        )
        reset_request = PasswordResetRequest.objects.get()

        with override_settings(
            EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            response = self.admin_client.post(
                reverse(
                    "password-reset-request-approve",
                    args=[reset_request.id],
                ),
                {},
                format="json",
            )

        self.assertEqual(response.status_code, 503)
        reset_request.refresh_from_db()
        self.assertEqual(reset_request.status, "PENDING")

    @patch(
        "accounts.views.send_mail",
        side_effect=OSError("SMTP is unavailable"),
    )
    def test_smtp_failure_does_not_approve_or_expose_code(self, send_mail_mock):
        self.client.post(
            reverse("password-reset-request"),
            {"employee_id": "STAFF-RESET", "portal": "STAFF"},
            format="json",
        )
        reset_request = PasswordResetRequest.objects.get()

        response = self.admin_client.post(
            reverse(
                "password-reset-request-approve",
                args=[reset_request.id],
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("approval_code", response.data)
        send_mail_mock.assert_called_once()
        reset_request.refresh_from_db()
        self.assertEqual(reset_request.status, "PENDING")
        self.assertEqual(reset_request.approval_code_hash, "")
