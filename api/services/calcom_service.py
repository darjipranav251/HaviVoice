"""
Cal.com Integration Service for HaviVoice.
Provides seamless availability slot queries, booking creation, cancellation,
and sync between Cal.com REST API (v2 and v1 fallback) and HaviVoice Appointments DB.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import httpx
from loguru import logger
from sqlalchemy import select

from api.db import db_client
from api.db.models import AppointmentModel, OrganizationConfigurationModel

CALCOM_API_V1_BASE = "https://api.cal.com/v1"
CALCOM_API_V2_BASE = "https://api.cal.com/v2"

CALCOM_CONFIG_KEY = "calcom_integration"


async def get_calcom_config(organization_id: int) -> Dict[str, Any]:
    """Retrieve Cal.com integration settings for an organization."""
    async with db_client.async_session() as session:
        stmt = select(OrganizationConfigurationModel).where(
            OrganizationConfigurationModel.organization_id == organization_id,
            OrganizationConfigurationModel.key == CALCOM_CONFIG_KEY,
        )
        res = await session.execute(stmt)
        config_record = res.scalars().first()

        if not config_record or not config_record.value:
            return {
                "api_key": None,
                "event_type_id": None,
                "username": None,
                "booking_slug": None,
                "is_enabled": False,
                "auto_sync": True,
            }

        return config_record.value


async def save_calcom_config(
    organization_id: int,
    api_key: Optional[str] = None,
    event_type_id: Optional[str] = None,
    username: Optional[str] = None,
    booking_slug: Optional[str] = None,
    is_enabled: bool = True,
) -> Dict[str, Any]:
    """Save or update Cal.com integration settings for an organization."""
    async with db_client.async_session() as session:
        stmt = select(OrganizationConfigurationModel).where(
            OrganizationConfigurationModel.organization_id == organization_id,
            OrganizationConfigurationModel.key == CALCOM_CONFIG_KEY,
        )
        res = await session.execute(stmt)
        config_record = res.scalars().first()

        config_val = {
            "api_key": api_key.strip() if api_key else None,
            "event_type_id": event_type_id.strip() if event_type_id else None,
            "username": username.strip() if username else None,
            "booking_slug": booking_slug.strip() if booking_slug else None,
            "is_enabled": is_enabled,
            "auto_sync": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if config_record:
            config_record.value = config_val
            config_record.updated_at = datetime.now(timezone.utc)
        else:
            config_record = OrganizationConfigurationModel(
                organization_id=organization_id,
                key=CALCOM_CONFIG_KEY,
                value=config_val,
            )
            session.add(config_record)

        await session.commit()
        return config_val


def _get_auth_headers(api_key: str) -> Dict[str, str]:
    """Format Bearer authorization header for Cal.com API v2 and v1."""
    clean_key = api_key.strip()
    if clean_key.startswith("Bearer "):
        clean_key = clean_key.replace("Bearer ", "").strip()
    return {
        "Authorization": f"Bearer {clean_key}",
        "Content-Type": "application/json",
    }


async def test_calcom_connection(api_key: str) -> Dict[str, Any]:
    """Test connection to Cal.com API using API key."""
    if not api_key:
        return {"success": False, "message": "API Key is required"}

    headers = _get_auth_headers(api_key)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # 1. Try v2/me first
            res = await client.get(f"{CALCOM_API_V2_BASE}/me", headers=headers)
            if res.status_code == 200:
                data = res.json().get("data", res.json())
                user_info = data.get("user", data)
                return {
                    "success": True,
                    "message": "Successfully connected to Cal.com (API v2)",
                    "username": user_info.get("username"),
                    "email": user_info.get("email"),
                    "name": user_info.get("name"),
                }

            # 2. Fallback to v1/me with Bearer header
            res_v1 = await client.get(f"{CALCOM_API_V1_BASE}/me", headers=headers)
            if res_v1.status_code == 200:
                data = res_v1.json()
                user_info = data.get("user", {})
                return {
                    "success": True,
                    "message": "Successfully connected to Cal.com (API v1)",
                    "username": user_info.get("username"),
                    "email": user_info.get("email"),
                    "name": user_info.get("name"),
                }

            # If both returned error status
            err_msg = res.json().get("error", {}).get("message") or f"HTTP Status {res.status_code}"
            return {
                "success": False,
                "message": f"Cal.com connection failed: {err_msg}",
            }
    except Exception as e:
        logger.error(f"Error testing Cal.com connection: {e}")
        return {"success": False, "message": f"Connection error: {str(e)}"}


async def fetch_calcom_event_types(api_key: str) -> List[Dict[str, Any]]:
    """Fetch all event types from Cal.com API for a user."""
    if not api_key:
        return []

    headers = _get_auth_headers(api_key)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # Try v2 event types or v1
            res = await client.get(f"{CALCOM_API_V2_BASE}/event-types", headers=headers)
            if res.status_code != 200:
                res = await client.get(f"{CALCOM_API_V1_BASE}/event-types", headers=headers)

            if res.status_code == 200:
                data = res.json()
                event_types = data.get("data", {}).get("eventTypeGroups", [])
                if not event_types:
                    event_types = data.get("event_types", data.get("data", []))

                result = []
                for et in event_types:
                    if isinstance(et, dict):
                        result.append({
                            "id": et.get("id"),
                            "title": et.get("title") or et.get("name") or "Event Type",
                            "slug": et.get("slug"),
                            "length": et.get("length") or 30,
                        })
                return result
    except Exception as e:
        logger.error(f"Error fetching Cal.com event types: {e}")
    return []


async def fetch_available_slots(
    organization_id: int,
    start_date: str,  # YYYY-MM-DD
    end_date: str,    # YYYY-MM-DD
) -> List[Dict[str, Any]]:
    """
    Fetch available booking slots for date range.
    Uses Cal.com API if configured and enabled, or generates standard business slots.
    """
    config = await get_calcom_config(organization_id)
    api_key = config.get("api_key")
    event_type_id = config.get("event_type_id")

    if config.get("is_enabled") and api_key and event_type_id:
        headers = _get_auth_headers(api_key)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. Try v2 slots
                res = await client.get(
                    f"{CALCOM_API_V2_BASE}/slots/available",
                    params={
                        "eventTypeId": event_type_id,
                        "startTime": f"{start_date}T00:00:00Z",
                        "endTime": f"{end_date}T23:59:59Z",
                    },
                    headers=headers,
                )
                if res.status_code != 200:
                    # Fallback to v1 slots
                    res = await client.get(
                        f"{CALCOM_API_V1_BASE}/slots",
                        params={
                            "eventTypeId": event_type_id,
                            "startTime": f"{start_date}T00:00:00Z",
                            "endTime": f"{end_date}T23:59:59Z",
                        },
                        headers=headers,
                    )

                if res.status_code == 200:
                    data = res.json()
                    raw_slots = data.get("data", {}).get("slots", data.get("slots", {}))
                    formatted_slots = []

                    if isinstance(raw_slots, dict):
                        for date_str, slots_list in raw_slots.items():
                            for slot in slots_list:
                                slot_time = slot.get("time") if isinstance(slot, dict) else slot
                                if slot_time:
                                    dt = datetime.fromisoformat(str(slot_time).replace("Z", "+00:00"))
                                    formatted_slots.append({
                                        "time": slot_time,
                                        "formatted": dt.strftime("%I:%M %p"),
                                        "date": date_str,
                                        "source": "calcom",
                                    })
                    return formatted_slots
        except Exception as err:
            logger.warning(f"Cal.com slots fetch failed, falling back to local slots: {err}")

    # Fallback / Default Local Business Slot Generator (9 AM - 5 PM, 30 min slots)
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    current_dt = start_dt

    slots = []
    while current_dt <= end_dt:
        if current_dt.weekday() != 6:
            date_str = current_dt.strftime("%Y-%m-%d")
            for hour in [9, 10, 11, 13, 14, 15, 16]:
                for minute in [0, 30]:
                    slot_dt = datetime(
                        current_dt.year, current_dt.month, current_dt.day, hour, minute, tzinfo=timezone.utc
                    )
                    slots.append({
                        "time": slot_dt.isoformat(),
                        "formatted": slot_dt.strftime("%I:%M %p"),
                        "date": date_str,
                        "source": "havivoice",
                    })
        current_dt += timedelta(days=1)

    return slots


async def create_appointment_with_calcom(
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
    Creates an appointment in HaviVoice DB, and posts to Cal.com if configured.
    """
    if not end_time:
        end_time = start_time + timedelta(minutes=30)

    config = await get_calcom_config(organization_id)
    booking_uid = None

    if config.get("is_enabled") and config.get("api_key") and config.get("event_type_id"):
        headers = _get_auth_headers(config["api_key"])
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload = {
                    "eventTypeId": int(config["event_type_id"]),
                    "start": start_time.isoformat(),
                    "responses": {
                        "name": client_name,
                        "email": client_email or f"client_{int(start_time.timestamp())}@havivoice.internal",
                        "notes": notes or "Booked via HaviVoice AI Voice Agent",
                        "phone": client_phone or "",
                    },
                    "timeZone": "UTC",
                    "language": "en",
                }
                res = await client.post(
                    f"{CALCOM_API_V2_BASE}/bookings",
                    headers=headers,
                    json=payload,
                )
                if res.status_code not in (200, 201):
                    res = await client.post(
                        f"{CALCOM_API_V1_BASE}/bookings",
                        headers=headers,
                        json=payload,
                    )

                if res.status_code in (200, 201):
                    booking_data = res.json().get("data", res.json().get("booking", {}))
                    booking_uid = str(booking_data.get("uid") or booking_data.get("id") or "")
                    logger.info(f"Cal.com booking created successfully: {booking_uid}")
        except Exception as e:
            logger.error(f"Failed to post booking to Cal.com: {e}")

    # Store appointment record in HaviVoice DB
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
            booking_uid=booking_uid,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(appointment)
        await session.commit()
        await session.refresh(appointment)
        return appointment
