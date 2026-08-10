"""
Google Calendar OAuth & Real-Time Sync Service for HaviVoice.
Provides 1-click Google OAuth authentication, background token refresh,
and real-time event creation/deletion with Google Calendar API v3.
"""

from datetime import datetime, timedelta, timezone
import os
from typing import Any, Dict, List, Optional
import httpx
from loguru import logger
from sqlalchemy import select

from api.db import db_client
from api.db.models import AppointmentModel, OrganizationConfigurationModel

GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

GOOGLE_CAL_CONFIG_KEY = "google_calendar_integration"

# Default Google OAuth Client Credentials (Can be overridden via .env or org config)
DEFAULT_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
DEFAULT_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")


async def get_google_calendar_config(organization_id: int) -> Dict[str, Any]:
    """Retrieve Google Calendar OAuth configuration for an organization."""
    async with db_client.async_session() as session:
        stmt = select(OrganizationConfigurationModel).where(
            OrganizationConfigurationModel.organization_id == organization_id,
            OrganizationConfigurationModel.key == GOOGLE_CAL_CONFIG_KEY,
        )
        res = await session.execute(stmt)
        config_record = res.scalars().first()

        if not config_record or not config_record.value:
            return {
                "client_id": DEFAULT_CLIENT_ID,
                "client_secret": DEFAULT_CLIENT_SECRET,
                "access_token": None,
                "refresh_token": None,
                "expires_at": None,
                "connected_email": None,
                "calendar_id": "primary",
                "is_enabled": False,
            }

        val = dict(config_record.value)
        if not val.get("client_id"):
            val["client_id"] = DEFAULT_CLIENT_ID
        if not val.get("client_secret"):
            val["client_secret"] = DEFAULT_CLIENT_SECRET
        return val


async def save_google_calendar_config(
    organization_id: int,
    access_token: Optional[str] = None,
    refresh_token: Optional[str] = None,
    expires_in: Optional[int] = 3600,
    connected_email: Optional[str] = None,
    calendar_id: str = "primary",
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
    is_enabled: bool = True,
) -> Dict[str, Any]:
    """Save or update Google Calendar OAuth settings for an organization."""
    existing = await get_google_calendar_config(organization_id)

    new_access_token = access_token or existing.get("access_token")
    new_refresh_token = refresh_token or existing.get("refresh_token")
    new_email = connected_email or existing.get("connected_email")
    new_client_id = client_id or existing.get("client_id") or DEFAULT_CLIENT_ID
    new_client_secret = client_secret or existing.get("client_secret") or DEFAULT_CLIENT_SECRET

    expires_at = None
    if expires_in:
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)).isoformat()

    config_val = {
        "client_id": new_client_id,
        "client_secret": new_client_secret,
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "expires_at": expires_at or existing.get("expires_at"),
        "connected_email": new_email,
        "calendar_id": calendar_id,
        "is_enabled": is_enabled and bool(new_access_token or new_refresh_token),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    async with db_client.async_session() as session:
        stmt = select(OrganizationConfigurationModel).where(
            OrganizationConfigurationModel.organization_id == organization_id,
            OrganizationConfigurationModel.key == GOOGLE_CAL_CONFIG_KEY,
        )
        res = await session.execute(stmt)
        config_record = res.scalars().first()

        if config_record:
            config_record.value = config_val
            config_record.updated_at = datetime.now(timezone.utc)
        else:
            config_record = OrganizationConfigurationModel(
                organization_id=organization_id,
                key=GOOGLE_CAL_CONFIG_KEY,
                value=config_val,
            )
            session.add(config_record)

        await session.commit()
        return config_val


async def disconnect_google_calendar(organization_id: int) -> bool:
    """Disconnect Google Calendar integration for an organization."""
    async with db_client.async_session() as session:
        stmt = select(OrganizationConfigurationModel).where(
            OrganizationConfigurationModel.organization_id == organization_id,
            OrganizationConfigurationModel.key == GOOGLE_CAL_CONFIG_KEY,
        )
        res = await session.execute(stmt)
        config_record = res.scalars().first()
        if config_record:
            await session.delete(config_record)
            await session.commit()
            return True
    return False


async def get_valid_access_token(organization_id: int) -> Optional[str]:
    """Retrieve a valid Google access token, automatically refreshing if expired."""
    config = await get_google_calendar_config(organization_id)
    if not config.get("is_enabled"):
        return None

    access_token = config.get("access_token")
    refresh_token = config.get("refresh_token")
    expires_at_str = config.get("expires_at")
    client_id = config.get("client_id") or DEFAULT_CLIENT_ID
    client_secret = config.get("client_secret") or DEFAULT_CLIENT_SECRET

    # Check if access token is still valid (with 2 min safety margin)
    if access_token and expires_at_str:
        try:
            exp_dt = datetime.fromisoformat(expires_at_str)
            if datetime.now(timezone.utc) < exp_dt:
                return access_token
        except Exception:
            pass

    # Token expired or missing, try refreshing using refresh_token
    if not refresh_token or not client_id or not client_secret:
        logger.warning(f"Google Calendar OAuth refresh token missing for org {organization_id}")
        return access_token

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                GOOGLE_OAUTH_TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            if res.status_code == 200:
                token_data = res.json()
                new_access_token = token_data.get("access_token")
                expires_in = token_data.get("expires_in", 3600)

                await save_google_calendar_config(
                    organization_id=organization_id,
                    access_token=new_access_token,
                    expires_in=expires_in,
                )
                return new_access_token
            else:
                logger.error(f"Failed to refresh Google access token: {res.status_code} {res.text}")
    except Exception as e:
        logger.error(f"Error refreshing Google access token for org {organization_id}: {e}")

    return access_token


async def exchange_oauth_code(
    organization_id: int,
    code: str,
    redirect_uri: str,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Exchange OAuth authorization code for tokens and user profile."""
    config = await get_google_calendar_config(organization_id)
    c_id = client_id or config.get("client_id") or DEFAULT_CLIENT_ID
    c_secret = client_secret or config.get("client_secret") or DEFAULT_CLIENT_SECRET

    if not c_id or not c_secret:
        return {"success": False, "message": "Google OAuth Client ID & Client Secret are required"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Exchange Code for Tokens
            token_res = await client.post(
                GOOGLE_OAUTH_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": c_id,
                    "client_secret": c_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            if token_res.status_code != 200:
                return {
                    "success": False,
                    "message": f"Token exchange failed: {token_res.text}",
                }

            token_data = token_res.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)

            # 2. Fetch User Email Profile
            user_res = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            connected_email = None
            if user_res.status_code == 200:
                connected_email = user_res.json().get("email")

            # 3. Save Configuration
            updated_config = await save_google_calendar_config(
                organization_id=organization_id,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=expires_in,
                connected_email=connected_email,
                client_id=c_id,
                client_secret=c_secret,
                is_enabled=True,
            )

            return {
                "success": True,
                "message": f"Successfully connected Google Calendar ({connected_email or 'Connected'})",
                "connected_email": connected_email,
                "config": updated_config,
            }
    except Exception as e:
        logger.error(f"Error exchanging OAuth code for org {organization_id}: {e}")
        return {"success": False, "message": f"OAuth Error: {str(e)}"}


async def create_google_calendar_event(
    organization_id: int,
    client_name: str,
    client_email: Optional[str],
    client_phone: Optional[str],
    title: str,
    start_time: datetime,
    end_time: Optional[datetime] = None,
    is_emergency: bool = False,
    notes: Optional[str] = None,
    address: Optional[str] = None,
) -> AppointmentModel:
    """
    Creates an appointment in HaviVoice DB, and posts to Google Calendar in real-time if connected.
    """
    if not end_time:
        end_time = start_time + timedelta(minutes=30)

    # Format ISO UTC timestamps for Google Calendar API
    if start_time.tzinfo:
        start_utc = start_time.astimezone(timezone.utc)
    else:
        start_utc = start_time.replace(tzinfo=timezone.utc)

    if end_time.tzinfo:
        end_utc = end_time.astimezone(timezone.utc)
    else:
        end_utc = end_time.replace(tzinfo=timezone.utc)

    start_iso = start_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_iso = end_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    google_event_id = None
    access_token = await get_valid_access_token(organization_id)

    if access_token:
        try:
            config = await get_google_calendar_config(organization_id)
            calendar_id = config.get("calendar_id", "primary")

            summary_title = f"{'🚨 ' if is_emergency else ''}{title} - {client_name}"
            description_text = (
                f"Booked via HaviVoice AI Voice Agent\n\n"
                f"Client Name: {client_name}\n"
                f"Phone: {client_phone or 'N/A'}\n"
                f"Email: {client_email or 'N/A'}\n"
                f"Emergency Priority: {'YES' if is_emergency else 'No'}\n"
                f"Notes: {notes or 'None'}\n"
                f"Address: {address or 'N/A'}"
            )

            event_body: Dict[str, Any] = {
                "summary": summary_title,
                "description": description_text,
                "start": {"dateTime": start_iso},
                "end": {"dateTime": end_iso},
            }

            if address:
                event_body["location"] = address

            # Only add attendee if client_email is a valid public email address
            if client_email and "@" in client_email and not client_email.endswith(".internal"):
                event_body["attendees"] = [{"email": client_email.strip()}]

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{GOOGLE_CALENDAR_API_BASE}/calendars/{calendar_id}/events",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json=event_body,
                )

                if res.status_code in (200, 201):
                    event_data = res.json()
                    google_event_id = event_data.get("id")
                    logger.info(f"Google Calendar event created successfully for org {organization_id}: {google_event_id}")
                else:
                    logger.error(f"Google Calendar API returned error {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Failed to post event to Google Calendar: {e}")

    # Store appointment in HaviVoice DB
    async with db_client.async_session() as session:
        appointment = AppointmentModel(
            organization_id=organization_id,
            client_name=client_name,
            client_email=client_email,
            client_phone=client_phone,
            title=title or "Appointment",
            start_time=start_time,
            end_time=end_time,
            status="upcoming",
            is_emergency=is_emergency,
            notes=notes,
            address=address,
            booking_uid=google_event_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(appointment)
        await session.commit()
        await session.refresh(appointment)
        return appointment


async def delete_google_calendar_event(organization_id: int, google_event_id: str) -> bool:
    """Delete event from Google Calendar when appointment is deleted in HaviVoice."""
    if not google_event_id:
        return False

    access_token = await get_valid_access_token(organization_id)
    if not access_token:
        return False

    try:
        config = await get_google_calendar_config(organization_id)
        calendar_id = config.get("calendar_id", "primary")

        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.delete(
                f"{GOOGLE_CALENDAR_API_BASE}/calendars/{calendar_id}/events/{google_event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if res.status_code in (200, 204):
                logger.info(f"Deleted Google Calendar event {google_event_id} for org {organization_id}")
                return True
    except Exception as e:
        logger.error(f"Error deleting Google Calendar event {google_event_id}: {e}")

    return False
