
from django.urls import path
from .views import (
    login_view,
    login_history_view,
    password_reset_request_view,
    password_reset_requests_view,
    approve_password_reset_request_view,
    deny_password_reset_request_view,
    password_reset_confirm_view,
    change_password_view,
    staff_detail_view,
    staff_list_create_view,
)


urlpatterns = [
    path("login/", login_view, name="login"),
    path(
        "change-password/",
        change_password_view,
        name="change-password",
    ),
    path(
        "password-reset-requests/",
        password_reset_request_view,
        name="password-reset-request",
    ),
    path(
        "password-reset-requests/review/",
        password_reset_requests_view,
        name="password-reset-requests-review",
    ),
    path(
        "password-reset-requests/<int:reset_request_id>/approve/",
        approve_password_reset_request_view,
        name="password-reset-request-approve",
    ),
    path(
        "password-reset-requests/<int:reset_request_id>/deny/",
        deny_password_reset_request_view,
        name="password-reset-request-deny",
    ),
    path(
        "password-reset-confirm/",
        password_reset_confirm_view,
        name="password-reset-confirm",
    ),
    path(
        "login-history/",
        login_history_view,
        name="login-history",
    ),
    path("staff/", staff_list_create_view, name="staff-list-create"),
    path(
        "staff/<int:profile_id>/",
        staff_detail_view,
        name="staff-detail",
    ),
]
