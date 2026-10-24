from rest_framework.throttling import AnonRateThrottle


class PasswordResetRequestThrottle(AnonRateThrottle):
    scope = "password_reset_request"
    rate = "5/hour"


class PasswordResetConfirmThrottle(AnonRateThrottle):
    scope = "password_reset_confirm"
    rate = "10/hour"
