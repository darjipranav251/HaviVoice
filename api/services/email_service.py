import logging
import smtplib
from datetime import datetime, timezone
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from typing import Optional
from zoneinfo import ZoneInfo

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

EASTERN_TZ = ZoneInfo("America/Toronto")


def format_eastern_datetime(dt: datetime) -> str:
    """Formats datetime strictly in Canadian Eastern Time (EST/EDT) without UTC."""
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    eastern_dt = dt.astimezone(EASTERN_TZ)
    return eastern_dt.strftime("%A, %B %d, %Y at %I:%M %p %Z")


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
    return ics_content.strip()


def _send_smtp_email(
    to_email: str,
    subject: str,
    html_body: str,
    ics_attachment: Optional[str] = None,
    attachment_filename: str = "appointment_confirmation.ics",
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
    is_emergency: bool = False,
    address: Optional[str] = None,
) -> bool:
    """Sends confirmation email with calendar invite to customer."""
    start_formatted = format_eastern_datetime(start_time)

    if is_emergency:
        subject = f"🚨 URGENT: Appointment Confirmed: {appointment_title} with {org_name}"
    else:
        subject = f"Appointment Confirmed: {appointment_title} with {org_name}"
    
    card_border = "#dc2626" if is_emergency else "#2563eb"
    badge_html = (
        '<div style="background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 700; margin-bottom: 20px;">🚨 EMERGENCY PRIORITY APPOINTMENT — Our team has been alerted for priority handling.</div>'
        if is_emergency
        else '<div class="badge">✓ Confirmed Appointment</div>'
    )

    start_iso = start_time.isoformat()
    end_iso = end_time.isoformat()

    schema_json_ld = f"""
    <script type="application/ld+json">
    {{
      "@context": "http://schema.org",
      "@type": "EventReservation",
      "reservationNumber": "APT-{int(start_time.timestamp())}",
      "reservationStatus": "http://schema.org/Confirmed",
      "underName": {{
        "@type": "Person",
        "name": "{customer_name or 'Valued Client'}"
      }},
      "reservationFor": {{
        "@type": "Event",
        "name": "{appointment_title}",
        "startDate": "{start_iso}",
        "endDate": "{end_iso}",
        "location": {{
          "@type": "Place",
          "name": "{org_name}",
          "address": "{address or 'Phone / Web Call'}"
        }}
      }}
    }}
    </script>
    """

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        {schema_json_ld}
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; color: #333; }}
            .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 6px solid {card_border}; }}
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
            
            {badge_html}

            <div class="detail-row">
                <span class="detail-label">Service / Event:</span> {appointment_title}
            </div>
            <div class="detail-row">
                <span class="detail-label">Date & Time:</span> <strong>{start_formatted}</strong>
            </div>
            <div class="detail-row">
                <span class="detail-label">Hosted By:</span> {org_name}
            </div>
            {f'<div class="detail-row"><span class="detail-label">Location / Address:</span> 📍 {address}</div>' if address else ''}
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
        title=f"{'🚨 EMERGENCY: ' if is_emergency else ''}{appointment_title} - {org_name}",
        description=f"Appointment with {org_name}. Priority: {'EMERGENCY' if is_emergency else 'Normal'}. Address: {address or 'N/A'}. Notes: {notes or 'N/A'}",
        start_dt=start_time,
        end_dt=end_time,
        location=address or "Phone / Web Call",
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
    is_emergency: bool = False,
    address: Optional[str] = None,
) -> bool:
    """Sends notification email to business owner when a new booking arrives."""
    start_formatted = format_eastern_datetime(start_time)

    if is_emergency:
        subject = f"🚨 URGENT EMERGENCY BOOKING: {customer_name or 'Client'} - {appointment_title}"
        card_border = "#dc2626"
        header_title = "🚨 URGENT EMERGENCY BOOKING!"
        emergency_banner = """
        <div style="background-color: #ef4444; color: #ffffff; padding: 14px 18px; border-radius: 8px; font-weight: bold; font-size: 16px; margin-bottom: 20px; text-align: center; letter-spacing: 0.5px; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3);">
            🚨 EMERGENCY APPOINTMENT — IMMEDIATE ACTION REQUIRED
        </div>
        """
        phone_html = f'<span style="color: #dc2626; font-weight: bold; font-size: 17px;">{customer_phone or "N/A"} 📞 (CALL CLIENT IMMEDIATELY)</span>'
    else:
        subject = f"🎉 New AI Booking: {customer_name or 'Client'} - {appointment_title}"
        card_border = "#16a34a"
        header_title = "🎉 New Appointment Booked!"
        emergency_banner = ""
        phone_html = f'<span>{customer_phone or "N/A"}</span>'

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }}
            .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 6px solid {card_border}; }}
            .header {{ font-size: 22px; font-weight: bold; color: {'#991b1b' if is_emergency else '#0f172a'}; margin-bottom: 12px; }}
            .detail-box {{ background: {'#fef2f2' if is_emergency else '#f1f5f9'}; border: {'1px solid #fca5a5' if is_emergency else '1px solid #e2e8f0'}; padding: 18px; border-radius: 8px; margin: 16px 0; }}
            .detail-row {{ margin: 10px 0; font-size: 15px; }}
            .detail-label {{ font-weight: 600; color: #475569; }}
            .footer {{ margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #94a3b8; }}
        </style>
    </head>
    <body>
        <div class="card">
            {emergency_banner}
            <div class="header">{header_title}</div>
            <p>Your AI assistant has just booked an appointment for <strong>{org_name}</strong>.</p>
            
            <div class="detail-box">
                <div class="detail-row"><span class="detail-label">Client Name:</span> <strong>{customer_name or 'N/A'}</strong></div>
                <div class="detail-row"><span class="detail-label">Client Phone:</span> {phone_html}</div>
                <div class="detail-row"><span class="detail-label">Client Email:</span> {customer_email or 'N/A'}</div>
                <div class="detail-row"><span class="detail-label">Appointment:</span> {appointment_title}</div>
                <div class="detail-row"><span class="detail-label">Scheduled Time:</span> <strong>{start_formatted}</strong></div>
                {f'<div class="detail-row"><span class="detail-label">Full Address:</span> 📍 {address}</div>' if address else ''}
                {f'<div class="detail-row"><span class="detail-label">Priority:</span> <span style="color: #dc2626; font-weight: bold;">🚨 EMERGENCY</span></div>' if is_emergency else ''}
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

