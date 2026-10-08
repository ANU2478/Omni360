import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")


def send_admin_otp_email(recipient: str, otp: str) -> bool:
    """Send an Admin OTP email using Gmail SMTP configuration."""
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        return False

    message = EmailMessage()
    message["Subject"] = "Omni360 Admin Login OTP"
    message["From"] = SMTP_EMAIL
    message["To"] = recipient
    message.set_content(
        f"Your Omni360 Admin login OTP is: {otp}\n\n"
        "This OTP expires in 5 minutes."
    )

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            server.send_message(message)
        return True
    except Exception:
        return False
