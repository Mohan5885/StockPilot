
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from django.utils import timezone
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

logger = logging.getLogger(__name__)

# Load backend/.env explicitly.
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def send_successful_login_alert(employee_id, username=""):
    """Send the StockPilot administrator an SMS after successful login."""

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
    admin_number = os.getenv("ADMIN_PHONE_NUMBER", "").strip()

    if not all((account_sid, auth_token, from_number, admin_number)):
        logger.warning(
            "Login SMS skipped: Twilio configuration is incomplete."
        )
        return False

    login_time = timezone.localtime().strftime("%d-%m-%Y %I:%M %p")
    employee_label = str(employee_id)

    if username:
        employee_label = f"{employee_id} ({username})"

    message_body = (
        "StockPilot Login Alert: "
        f"{employee_label} logged in successfully at {login_time}."
    )

    try:
        client = Client(account_sid, auth_token)
        message = client.messages.create(
            body=message_body,
            from_=from_number,
            to=admin_number,
        )

        logger.info(
            "Login SMS submitted to Twilio. Message SID: %s",
            message.sid,
        )
        return True

    except Exception:
        # Do not log credentials or let SMS errors break authentication.
        logger.exception("StockPilot login SMS failed.")
        return False
