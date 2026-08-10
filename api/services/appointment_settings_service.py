"""
Appointment Settings & Conflict Prevention Service for HaviVoice.
Handles default appointment duration, buffer time between bookings,
and double-booking / overlap prevention logic per organization.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
from loguru import logger
from sqlalchemy import and_, or_, select

from api.db import db_client
from api.db.models import AppointmentModel, OrganizationConfigurationModel

APPOINTMENT_SETTINGS_KEY = "appointment_settings"

DEFAULT_SETTINGS = {
    "default_duration_minutes": 30,
    "buffer_minutes": 0,
    "allow_overlap": False,
    "auto_next_slot": True,
}


async def get_appointment_settings(organization_id: int) -> Dict[str, Any]:
    """Retrieve appointment settings for an organization."""
    async with db_client.async_session() as session:
        stmt = select(OrganizationConfigurationModel).where(
            OrganizationConfigurationModel.organization_id == organization_id,
            OrganizationConfigurationModel.key == APPOINTMENT_SETTINGS_KEY,
        )
        res = await session.execute(stmt)
        config_record = res.scalars().first()

        if not config_record or not config_record.value:
            return dict(DEFAULT_SETTINGS)

        val = dict(config_record.value)
        return {
            "default_duration_minutes": int(val.get("default_duration_minutes", DEFAULT_SETTINGS["default_duration_minutes"])),
            "buffer_minutes": int(val.get("buffer_minutes", DEFAULT_SETTINGS["buffer_minutes"])),
            "allow_overlap": bool(val.get("allow_overlap", DEFAULT_SETTINGS["allow_overlap"])),
            "auto_next_slot": bool(val.get("auto_next_slot", DEFAULT_SETTINGS["auto_next_slot"])),
        }


async def save_appointment_settings(
    organization_id: int,
    default_duration_minutes: Optional[int] = 30,
    buffer_minutes: Optional[int] = 0,
    allow_overlap: Optional[bool] = False,
    auto_next_slot: Optional[bool] = True,
) -> Dict[str, Any]:
    """Save or update appointment configuration settings for an organization."""
    duration = default_duration_minutes if default_duration_minutes in (15, 30, 45, 60, 90, 120) else 30
    buffer_t = buffer_minutes if buffer_minutes in (0, 5, 10, 15, 30) else 0

    config_val = {
        "default_duration_minutes": duration,
        "buffer_minutes": buffer_t,
        "allow_overlap": bool(allow_overlap),
        "auto_next_slot": bool(auto_next_slot),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    async with db_client.async_session() as session:
        stmt = select(OrganizationConfigurationModel).where(
            OrganizationConfigurationModel.organization_id == organization_id,
            OrganizationConfigurationModel.key == APPOINTMENT_SETTINGS_KEY,
        )
        res = await session.execute(stmt)
        config_record = res.scalars().first()

        if config_record:
            config_record.value = config_val
            config_record.updated_at = datetime.now(timezone.utc)
        else:
            config_record = OrganizationConfigurationModel(
                organization_id=organization_id,
                key=APPOINTMENT_SETTINGS_KEY,
                value=config_val,
            )
            session.add(config_record)

        await session.commit()
        return config_val


async def check_appointment_conflict(
    organization_id: int,
    start_time: datetime,
    end_time: datetime,
    buffer_minutes: int = 0,
    exclude_appointment_id: Optional[int] = None,
) -> Tuple[bool, Optional[AppointmentModel], Optional[datetime]]:
    """
    Check if a proposed appointment time conflicts with existing non-cancelled appointments.
    
    Conflict Condition:
    Existing Start < Proposed End + Buffer AND Existing End + Buffer > Proposed Start
    
    Returns: (has_conflict, conflicting_appointment, next_available_start_time)
    """
    # Ensure UTC timezone awareness
    start_utc = start_time if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc)
    end_utc = end_time if end_time.tzinfo else end_time.replace(tzinfo=timezone.utc)
    buf = timedelta(minutes=buffer_minutes)

    async with db_client.async_session() as session:
        # Query active appointments for org that overlap with proposed start/end range
        stmt = select(AppointmentModel).where(
            AppointmentModel.organization_id == organization_id,
            AppointmentModel.status.in_(["upcoming", "completed"]),
            and_(
                AppointmentModel.start_time < (end_utc + buf),
                AppointmentModel.end_time > (start_utc - buf),
            ),
        )

        if exclude_appointment_id:
            stmt = stmt.where(AppointmentModel.id != exclude_appointment_id)

        stmt = stmt.order_by(AppointmentModel.start_time.asc())
        res = await session.execute(stmt)
        conflicts = res.scalars().all()

        if not conflicts:
            return False, None, None

        conflicting_apt = conflicts[0]

        # Calculate next available conflict-free start time after conflicting appointment
        latest_end = max(apt.end_time for apt in conflicts)
        if not latest_end.tzinfo:
            latest_end = latest_end.replace(tzinfo=timezone.utc)
        next_available = latest_end + buf

        return True, conflicting_apt, next_available
