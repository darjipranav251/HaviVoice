import logging
import smtplib
from datetime import datetime
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from typing import Optional

from api.constants import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_TLS,
)

logger = logging.getLogger(__name__)


def is_smtp_configured() -> bool:
    """Checks if central SMTP is configured in environment variables."""
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def create_ics_calendar_event(
    title: str,
    description: str,
    start_dt: datetime,
    end_dt: datetime,
    location: str = "Phone / Web Call",
) -> str:
    """Generates an iCalendar (.ics) string for appointment attachment."""
    fmt = "%Y%m%dT%H%M%SZ"
    start_str = start_dt.strftime(fmt)
    end_str = end_dt.strftime(fmt)
    now_str = datetime.utcnow().strftime(fmt)

    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//HaviAI Voice//NONSGML Appointment System//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:apt-{int(start_dt.timestamp())}@haviai.com
DTSTAMP:{now_str}
DTSTART:{start_str}
DTEND:{end_str}
SUMMARY:{title}
DESCRIPTION:{description}
LOCATION:{location}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR"""
    return ics_content


def _send_smtp_email(
    to_email: str,
    subject: str,
    html_body: str,
    ics_attachment: Optional[str] = None,
    attachment_filename: str = "appointment.ics",
) -> bool:
    """Sends an email using the central SMTP server."""
    if not is_smtp_configured():
        logger.warning("SMTP is not configured. Skipping email dispatch to %s", to_email)
        return False

    sender_email = SMTP_FROM_EMAIL or SMTP_USER
    sender_name = SMTP_FROM_NAME or "HaviAI Appointments"

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{sender_email}>"
    msg["To"] = to_email

    # Alternative part for HTML
    msg_body = MIMEMultipart("alternative")
    html_part = MIMEText(html_body, "html")
    msg_body.attach(html_part)
    msg.attach(msg_body)

    # Attach ICS calendar file if provided
    if ics_attachment:
        part = MIMEBase("text", "calendar", method="REQUEST", name=attachment_filename)
        part.set_payload(ics_attachment.encode("utf-8"))
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f'attachment; filename="{attachment_filename}"',
        )
        msg.attach(part)

    try:
        logger.info("Connecting to SMTP server %s:%s...", SMTP_HOST, SMTP_PORT)
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
            if SMTP_TLS:
                server.starttls()

        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(sender_email, [to_email], msg.as_string())
        server.quit()
        logger.info("Successfully sent appointment email to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send SMTP email to %s: %s", to_email, str(e), exc_info=True)
        return False


def send_customer_appointment_confirmation(
    customer_email: str,
    customer_name: str,
    appointment_title: str,
    start_time: datetime,
    end_time: datetime,
    notes: Optional[str] = None,
    org_name: str = "HaviAI Voice Assistant",
) -> bool:
    """Sends confirmation email with calendar invite to customer."""
    start_formatted = start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")

    subject = f"Appointment Confirmed: {appointment_title} with {org_name}"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; color: #333; }}
            .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 5px solid #2563eb; }}
            .header {{ font-size: 22px; font-weight: bold; color: #1e293b; margin-bottom: 8px; }}
            .badge {{ display: inline-block; background: #dbeafe; color: #1e40af; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }}
            .detail-row {{ margin: 12px 0; font-size: 15px; line-height: 1.6; }}
            .detail-label {{ font-weight: 600; color: #64748b; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #94a3b8; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">Hello {customer_name or 'Valued Client'},</div>
            <p style="font-size: 16px; color: #475569;">Your appointment has been successfully scheduled!</p>
            
            <div class="badge">✓ Confirmed Appointment</div>

            <div class="detail-row">
                <span class="detail-label">Service / Event:</span> {appointment_title}
            </div>
            <div class="detail-row">
                <span class="detail-label">Date & Time:</span> <strong>{start_formatted}</strong>
            </div>
            <div class="detail-row">
                <span class="detail-label">Hosted By:</span> {org_name}
            </div>
            {f'<div class="detail-row"><span class="detail-label">Notes:</span> {notes}</div>' if notes else ''}

            <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
                📅 We have attached a calendar invite (<code>.ics</code>) to this email so you can add it to your calendar with one click.
            </p>

            <div class="footer">
                Sent by {org_name} via HaviAI Voice Platform.
            </div>
        </div>
    </body>
    </html>
    """

    ics_content = create_ics_calendar_event(
        title=f"{appointment_title} - {org_name}",
        description=f"Appointment with {org_name}. Notes: {notes or 'N/A'}",
        start_dt=start_time,
        end_dt=end_time,
    )

    return _send_smtp_email(
        to_email=customer_email,
        subject=subject,
        html_body=html_body,
        ics_attachment=ics_content,
        attachment_filename="appointment_confirmation.ics",
    )


def send_owner_booking_notification(
    owner_email: str,
    customer_name: str,
    customer_email: Optional[str],
    customer_phone: Optional[str],
    appointment_title: str,
    start_time: datetime,
    notes: Optional[str] = None,
    org_name: str = "Your Business",
) -> bool:
    """Sends notification email to business owner when a new booking arrives."""
    start_formatted = start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")

    subject = f"🎉 New AI Booking: {customer_name or 'Client'} - {appointment_title}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }}
            .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 5px solid #16a34a; }}
            .header {{ font-size: 22px; font-weight: bold; color: #0f172a; margin-bottom: 12px; }}
            .detail-box {{ background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0; }}
            .detail-row {{ margin: 8px 0; font-size: 15px; }}
            .detail-label {{ font-weight: 600; color: #475569; }}
            .footer {{ margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #94a3b8; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">🎉 New Appointment Booked!</div>
            <p>Your AI assistant has just booked a new appointment for <strong>{org_name}</strong>.</p>
            
            <div class="detail-box">
                <div class="detail-row"><span class="detail-label">Client Name:</span> {customer_name or 'N/A'}</div>
                <div class="detail-row"><span class="detail-label">Client Phone:</span> {customer_phone or 'N/A'}</div>
                <div class="detail-row"><span class="detail-label">Client Email:</span> {customer_email or 'N/A'}</div>
                <div class="detail-row"><span class="detail-label">Appointment:</span> {appointment_title}</div>
                <div class="detail-row"><span class="detail-label">Scheduled Time:</span> <strong>{start_formatted}</strong></div>
                {f'<div class="detail-row"><span class="detail-label">Notes:</span> {notes}</div>' if notes else ''}
            </div>

            <p style="font-size: 14px; color: #64748b;">You can view and manage all bookings in your HaviAI Dashboard under <strong>Appointments</strong>.</p>

            <div class="footer">
                Automated Notification • HaviAI Voice Platform
            </div>
        </div>
    </body>
    </html>
    """

    return _send_smtp_email(
        to_email=owner_email,
        subject=subject,
        html_body=html_body,
    )
