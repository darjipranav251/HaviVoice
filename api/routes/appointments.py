from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Date, and_, cast, func, or_, select

from api.db import db_client
from api.db.models import (
    AppointmentModel,
    OrganizationModel,
    UserModel,
    organization_users_association,
)
from api.services.auth.depends import get_user
from api.services.billing_guard import is_subscription_active_for_org

router = APIRouter(prefix="/appointments", tags=["appointments"])


class BookAppointmentRequest(BaseModel):
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    title: Optional[str] = "Appointment"
    start_time: datetime
    end_time: Optional[datetime] = None
    is_emergency: Optional[bool] = False
    notes: Optional[str] = None
    address: Optional[str] = None
    organization_id: Optional[int] = None


class UpdateAppointmentStatusRequest(BaseModel):
    status: Optional[str] = None  # upcoming, completed, no_show, cancelled
    is_emergency: Optional[bool] = None
    notes: Optional[str] = None
    address: Optional[str] = None


class AppointmentItemResponse(BaseModel):
    id: int
    organization_id: int
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    title: str
    start_time: str
    end_time: str
    status: str
    is_emergency: bool
    notes: Optional[str] = None
    address: Optional[str] = None
    booking_uid: Optional[str] = None
    organization_name: Optional[str] = None
    organization_email: Optional[str] = None
    created_at: str


class AppointmentsSummaryResponse(BaseModel):
    total_appointments: int
    upcoming_count: int
    completed_count: int
    no_show_count: int
    no_show_rate: float
    emergency_count: int
    period_7days_count: int
    period_15days_count: int
    period_monthly_count: int
    upcoming_appointments: List[AppointmentItemResponse]


def resolve_org_id(req_org_id: Optional[int], user: UserModel) -> int:
    if req_org_id:
        return req_org_id
    selected_org = getattr(user, "selected_organization_id", None)
    if selected_org:
        return selected_org
    return 1


@router.get("", response_model=List[AppointmentItemResponse])
async def get_appointments(
    status: Optional[str] = Query(None, description="Filter by status: upcoming, completed, no_show, cancelled"),
    time_range: Optional[str] = Query("all", description="Time range: 7days, 15days, monthly, all"),
    tenant_id: Optional[int] = Query(None, description="Superadmin filter for specific tenant ID"),
    search: Optional[str] = Query(None, description="Search by client name, email, or phone"),
    user: UserModel = Depends(get_user),
):
    """Get appointments list. Supports superadmin global view and tenant-scoped view."""
    is_superuser = getattr(user, "is_superuser", False)
    selected_org_id = resolve_org_id(tenant_id, user)

    async with db_client.async_session() as session:
        query = (
            select(AppointmentModel, UserModel.email)
            .outerjoin(
                organization_users_association,
                AppointmentModel.organization_id == organization_users_association.c.organization_id,
            )
            .outerjoin(UserModel, organization_users_association.c.user_id == UserModel.id)
        )

        # Scoping logic:
        if tenant_id:
            query = query.where(AppointmentModel.organization_id == tenant_id)
        elif is_superuser:
            user_selected_org = getattr(user, "selected_organization_id", None)
            if user_selected_org is not None:
                query = query.where(AppointmentModel.organization_id == user_selected_org)
            # Otherwise (global superuser mode), show all appointments across all tenants!
        else:
            query = query.where(AppointmentModel.organization_id == selected_org_id)

        # Apply status filter
        if status and status != "all":
            query = query.where(AppointmentModel.status == status)

        # Apply search filter
        if search:
            s = f"%{search.lower()}%"
            query = query.where(
                or_(
                    func.lower(AppointmentModel.client_name).like(s),
                    func.lower(AppointmentModel.client_email).like(s),
                    func.lower(AppointmentModel.client_phone).like(s),
                    func.lower(AppointmentModel.title).like(s),
                )
            )

        # Apply time range filter
        now = datetime.now(timezone.utc)
        if time_range == "7days":
            start_threshold = now - timedelta(days=7)
            query = query.where(AppointmentModel.start_time >= start_threshold)
        elif time_range == "15days":
            start_threshold = now - timedelta(days=15)
            query = query.where(AppointmentModel.start_time >= start_threshold)
        elif time_range == "monthly":
            start_threshold = now - timedelta(days=30)
            query = query.where(AppointmentModel.start_time >= start_threshold)

        query = query.order_by(AppointmentModel.start_time.asc())
        result = await session.execute(query)

        appointments: List[AppointmentItemResponse] = []
        for row in result.all():
            apt: AppointmentModel = row[0]
            org_email = row[1]
            org_name = org_email.split("@")[0] if org_email else f"Org {apt.organization_id}"

            appointments.append(
                AppointmentItemResponse(
                    id=apt.id,
                    organization_id=apt.organization_id,
                    client_name=apt.client_name,
                    client_email=apt.client_email,
                    client_phone=apt.client_phone,
                    title=apt.title or "Appointment",
                    start_time=apt.start_time.isoformat() if apt.start_time else "",
                    end_time=apt.end_time.isoformat() if apt.end_time else "",
                    status=apt.status,
                    is_emergency=apt.is_emergency or False,
                    notes=apt.notes,
                    address=apt.address,
                    booking_uid=apt.booking_uid,
                    organization_name=org_name,
                    organization_email=org_email,
                    created_at=apt.created_at.isoformat() if apt.created_at else "",
                )
            )

        return appointments


from api.services.email_service import (
    is_smtp_configured,
    send_customer_appointment_confirmation,
    send_owner_booking_notification,
)


class TestEmailRequest(BaseModel):
    to_email: str


@router.post("/test-email")
async def send_test_appointment_email(
    req: TestEmailRequest,
    user: UserModel = Depends(get_user),
):
    """Test endpoint to verify SMTP configuration."""
    if not is_smtp_configured():
        raise HTTPException(
            status_code=400,
            detail="SMTP is not configured on server. Please set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in .env.",
        )
    
    success = send_customer_appointment_confirmation(
        customer_email=req.to_email,
        customer_name="Test Customer",
        appointment_title="Test Consultation",
        start_time=datetime.now(UTC) + timedelta(days=1),
        end_time=datetime.now(UTC) + timedelta(days=1, minutes=30),
        notes="This is a test email to verify your HaviAI SMTP settings.",
        org_name="HaviAI Voice System",
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send test email. Check server logs for details.")
    
    return {"message": f"Test email sent successfully to {req.to_email}"}


@router.post("/book", response_model=AppointmentItemResponse)
async def book_appointment(
    req: BookAppointmentRequest,
    background_tasks: BackgroundTasks,
    user: UserModel = Depends(get_user),
):
    """Book a new appointment. Called by AI voice call HTTP tool or UI."""
    org_id = resolve_org_id(req.organization_id, user)

    start_dt = req.start_time
    now = datetime.now(timezone.utc)
    check_dt = start_dt if start_dt.tzinfo else start_dt.replace(tzinfo=timezone.utc)
    if check_dt < (now - timedelta(minutes=5)):
        raise HTTPException(
            status_code=400,
            detail="Cannot schedule an appointment for a past date or time. Please select a future time slot.",
        )

    # 1. Fetch Organization Appointment Settings (duration, buffer, overlap rules)
    from api.services.appointment_settings_service import (
        check_appointment_conflict,
        get_appointment_settings,
    )
    settings = await get_appointment_settings(org_id)
    duration_mins = settings.get("default_duration_minutes", 30)
    buffer_mins = settings.get("buffer_minutes", 0)
    allow_overlap = settings.get("allow_overlap", False)

    if not req.end_time:
        end_dt = start_dt + timedelta(minutes=duration_mins)
    else:
        end_dt = req.end_time

    # 2. Strict Overlap / Double-Booking Conflict Prevention
    if not allow_overlap:
        has_conflict, conflicting_apt, next_available = await check_appointment_conflict(
            organization_id=org_id,
            start_time=start_dt,
            end_time=end_dt,
            buffer_minutes=buffer_mins,
        )
        if has_conflict:
            start_str = check_dt.strftime("%I:%M %p")
            next_str = next_available.strftime("%I:%M %p on %b %d") if next_available else "a later time"
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Slot conflict: An appointment ({conflicting_apt.title if conflicting_apt else 'Existing Booking'}) "
                    f"is already booked around {start_str}. "
                    f"Please select a slot at least {duration_mins} minutes apart (Next available: {next_str})."
                ),
            )

    async with db_client.async_session() as session:
        org = await session.get(OrganizationModel, org_id)
        org_notification_email = org.notification_email if org else None
        if org:
            is_active, inactive_reason = is_subscription_active_for_org(org, user=user)
            if not is_active:
                raise HTTPException(status_code=402, detail=inactive_reason)

        new_apt = AppointmentModel(
            organization_id=org_id,
            client_name=req.client_name,
            client_email=req.client_email,
            client_phone=req.client_phone,
            title=req.title or "Appointment",
            start_time=start_dt,
            end_time=end_dt,
            status="upcoming",
            is_emergency=req.is_emergency or False,
            notes=req.notes,
            address=req.address,
        )
        session.add(new_apt)
        await session.commit()
        await session.refresh(new_apt)

        org_stmt = (
            select(UserModel.email)
            .join(
                organization_users_association,
                UserModel.id == organization_users_association.c.user_id,
            )
            .where(organization_users_association.c.organization_id == org_id)
            .limit(1)
        )
        org_res = await session.execute(org_stmt)
        org_email = org_res.scalar_one_or_none()
        org_name = org_email.split("@")[0] if org_email else f"Org {org_id}"

        # Resolve owner notification email (org_notification_email > org_email)
        owner_target_email = org_notification_email or org_email

        # 1. Dispatch Customer Confirmation Email via Background Task
        if req.client_email:
            background_tasks.add_task(
                send_customer_appointment_confirmation,
                customer_email=req.client_email,
                customer_name=req.client_name,
                appointment_title=req.title or "Appointment",
                start_time=start_dt,
                end_time=end_dt,
                notes=req.notes,
                org_name=org_name,
                is_emergency=new_apt.is_emergency,
                address=req.address,
            )

        # 2. Dispatch Business Owner Alert Email via Background Task
        if owner_target_email:
            background_tasks.add_task(
                send_owner_booking_notification,
                owner_email=owner_target_email,
                customer_name=req.client_name,
                customer_email=req.client_email,
                customer_phone=req.client_phone,
                appointment_title=req.title or "Appointment",
                start_time=start_dt,
                notes=req.notes,
                org_name=org_name,
                is_emergency=new_apt.is_emergency,
                address=req.address,
            )

        # 3. Real-Time Google Calendar Sync via Background Task
        from api.services.google_calendar_service import create_google_calendar_event
        background_tasks.add_task(
            create_google_calendar_event,
            organization_id=org_id,
            client_name=req.client_name,
            client_email=req.client_email,
            client_phone=req.client_phone,
            title=req.title or "Appointment",
            start_time=start_dt,
            end_time=end_dt,
            is_emergency=req.is_emergency or False,
            notes=req.notes,
            address=req.address,
        )

        return AppointmentItemResponse(
            id=new_apt.id,
            organization_id=new_apt.organization_id,
            client_name=new_apt.client_name,
            client_email=new_apt.client_email,
            client_phone=new_apt.client_phone,
            title=new_apt.title,
            start_time=new_apt.start_time.isoformat(),
            end_time=new_apt.end_time.isoformat(),
            status=new_apt.status,
            is_emergency=new_apt.is_emergency,
            notes=new_apt.notes,
            address=new_apt.address,
            booking_uid=new_apt.booking_uid,
            organization_name=org_name,
            organization_email=org_email,
            created_at=new_apt.created_at.isoformat(),
        )


@router.patch("/{appointment_id}/status", response_model=AppointmentItemResponse)
async def update_appointment_status(
    appointment_id: int,
    req: UpdateAppointmentStatusRequest,
    user: UserModel = Depends(get_user),
):
    """Update appointment status (upcoming, completed, no_show, cancelled, emergency)."""
    async with db_client.async_session() as session:
        query = select(AppointmentModel).where(AppointmentModel.id == appointment_id)
        if not getattr(user, "is_superuser", False):
            org_id = resolve_org_id(None, user)
            query = query.where(AppointmentModel.organization_id == org_id)

        result = await session.execute(query)
        apt = result.scalar_one_or_none()
        if not apt:
            raise HTTPException(status_code=404, detail="Appointment not found")

        if req.status:
            apt.status = req.status
        if req.is_emergency is not None:
            apt.is_emergency = req.is_emergency
        if req.notes is not None:
            apt.notes = req.notes

        await session.commit()
        await session.refresh(apt)

        org_stmt = (
            select(UserModel.email)
            .join(
                organization_users_association,
                UserModel.id == organization_users_association.c.user_id,
            )
            .where(organization_users_association.c.organization_id == apt.organization_id)
            .limit(1)
        )
        org_res = await session.execute(org_stmt)
        org_email = org_res.scalar_one_or_none()
        org_name = org_email.split("@")[0] if org_email else f"Org {apt.organization_id}"

        return AppointmentItemResponse(
            id=apt.id,
            organization_id=apt.organization_id,
            client_name=apt.client_name,
            client_email=apt.client_email,
            client_phone=apt.client_phone,
            title=apt.title,
            start_time=apt.start_time.isoformat(),
            end_time=apt.end_time.isoformat(),
            status=apt.status,
            is_emergency=apt.is_emergency,
            notes=apt.notes,
            booking_uid=apt.booking_uid,
            organization_name=org_name,
            organization_email=org_email,
            created_at=apt.created_at.isoformat(),
        )


@router.get("/summary", response_model=AppointmentsSummaryResponse)
async def get_appointments_summary(user: UserModel = Depends(get_user)):
    """Get appointments summary stats for dashboard and header widgets."""
    is_superuser = getattr(user, "is_superuser", False)
    selected_org_id = resolve_org_id(None, user)

    async with db_client.async_session() as session:
        base_query = select(AppointmentModel)
        if is_superuser:
            user_selected_org = getattr(user, "selected_organization_id", None)
            if user_selected_org is not None:
                base_query = base_query.where(AppointmentModel.organization_id == user_selected_org)
        else:
            base_query = base_query.where(AppointmentModel.organization_id == selected_org_id)

        apts = (await session.execute(base_query)).scalars().all()

        now = datetime.now(timezone.utc)
        d7 = now - timedelta(days=7)
        d15 = now - timedelta(days=15)
        d30 = now - timedelta(days=30)

        total_cnt = len(apts)
        upcoming_cnt = sum(1 for a in apts if a.status == "upcoming" and a.start_time >= now)
        completed_cnt = sum(1 for a in apts if a.status == "completed")
        no_show_cnt = sum(1 for a in apts if a.status == "no_show")
        emergency_cnt = sum(1 for a in apts if a.is_emergency)

        p7_cnt = sum(1 for a in apts if a.start_time >= d7)
        p15_cnt = sum(1 for a in apts if a.start_time >= d15)
        p30_cnt = sum(1 for a in apts if a.start_time >= d30)

        no_show_rate = round((no_show_cnt / max(1, completed_cnt + no_show_cnt)) * 100.0, 1)

        # Get top 5 upcoming appointments
        upcoming_list = [a for a in apts if a.status == "upcoming" or a.is_emergency]
        upcoming_list.sort(key=lambda x: (not x.is_emergency, x.start_time))
        upcoming_top5 = upcoming_list[:5]

        upcoming_responses: List[AppointmentItemResponse] = []
        for apt in upcoming_top5:
            org_stmt = (
                select(UserModel.email)
                .join(
                    organization_users_association,
                    UserModel.id == organization_users_association.c.user_id,
                )
                .where(organization_users_association.c.organization_id == apt.organization_id)
                .limit(1)
            )
            org_res = await session.execute(org_stmt)
            org_email = org_res.scalar_one_or_none()
            org_name = org_email.split("@")[0] if org_email else f"Org {apt.organization_id}"

            upcoming_responses.append(
                AppointmentItemResponse(
                    id=apt.id,
                    organization_id=apt.organization_id,
                    client_name=apt.client_name,
                    client_email=apt.client_email,
                    client_phone=apt.client_phone,
                    title=apt.title,
                    start_time=apt.start_time.isoformat(),
                    end_time=apt.end_time.isoformat(),
                    status=apt.status,
                    is_emergency=apt.is_emergency,
                    notes=apt.notes,
                    booking_uid=apt.booking_uid,
                    organization_name=org_name,
                    organization_email=org_email,
                    created_at=apt.created_at.isoformat(),
                )
            )

        return AppointmentsSummaryResponse(
            total_appointments=total_cnt,
            upcoming_count=upcoming_cnt,
            completed_count=completed_cnt,
            no_show_count=no_show_cnt,
            no_show_rate=no_show_rate,
            emergency_count=emergency_cnt,
            period_7days_count=p7_cnt,
            period_15days_count=p15_cnt,
            period_monthly_count=p30_cnt,
            upcoming_appointments=upcoming_responses,
        )


@router.delete("/{appointment_id}")
async def delete_appointment(
    appointment_id: int,
    user: UserModel = Depends(get_user),
):
    """Delete an appointment."""
    async with db_client.async_session() as session:
        query = select(AppointmentModel).where(AppointmentModel.id == appointment_id)
        if not getattr(user, "is_superuser", False):
            org_id = resolve_org_id(None, user)
            query = query.where(AppointmentModel.organization_id == org_id)

        result = await session.execute(query)
        apt = result.scalar_one_or_none()
        if not apt:
            raise HTTPException(status_code=404, detail="Appointment not found")

        await session.delete(apt)
        await session.commit()

        # Delete from Google Calendar if connected
        if apt.booking_uid:
            from api.services.google_calendar_service import delete_google_calendar_event
            background_tasks.add_task(delete_google_calendar_event, apt.organization_id, apt.booking_uid)

        return {"status": "success", "message": f"Appointment {appointment_id} deleted"}


class ExchangeGoogleCodeRequest(BaseModel):
    code: str
    redirect_uri: str
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


@router.get("/google/status")
async def get_google_calendar_status_endpoint(user: UserModel = Depends(get_user)):
    """Get Google Calendar 1-click sync connection status for organization."""
    org_id = resolve_org_id(None, user)
    from api.services.google_calendar_service import get_google_calendar_config
    config = await get_google_calendar_config(org_id)
    return {
        "is_connected": bool(config.get("is_enabled")),
        "connected_email": config.get("connected_email"),
        "calendar_id": config.get("calendar_id", "primary"),
        "client_id": config.get("client_id"),
    }


@router.post("/google/exchange-code")
async def exchange_google_code_endpoint(
    req: ExchangeGoogleCodeRequest,
    user: UserModel = Depends(get_user),
):
    """Exchange 1-click Google OAuth authorization code for tokens and connected email."""
    org_id = resolve_org_id(None, user)
    from api.services.google_calendar_service import exchange_oauth_code
    res = await exchange_oauth_code(
        organization_id=org_id,
        code=req.code,
        redirect_uri=req.redirect_uri,
        client_id=req.client_id,
        client_secret=req.client_secret,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "OAuth failed"))
    return res


@router.post("/google/disconnect")
async def disconnect_google_calendar_endpoint(user: UserModel = Depends(get_user)):
    """Disconnect Google Calendar 1-click sync for organization."""
    org_id = resolve_org_id(None, user)
    from api.services.google_calendar_service import disconnect_google_calendar
    success = await disconnect_google_calendar(org_id)
    return {"success": success, "message": "Google Calendar disconnected"}


class SaveAppointmentSettingsRequest(BaseModel):
    default_duration_minutes: Optional[int] = 30
    buffer_minutes: Optional[int] = 0
    allow_overlap: Optional[bool] = False
    auto_next_slot: Optional[bool] = True
    tenant_id: Optional[int] = None


@router.get("/settings")
async def get_appointment_settings_endpoint(
    tenant_id: Optional[int] = Query(None, description="Superadmin filter for specific tenant ID"),
    user: UserModel = Depends(get_user),
):
    """Get appointment duration and overlap settings for organization."""
    org_id = resolve_org_id(tenant_id, user)
    from api.services.appointment_settings_service import get_appointment_settings
    return await get_appointment_settings(org_id)


@router.post("/settings")
async def save_appointment_settings_endpoint(
    req: SaveAppointmentSettingsRequest,
    user: UserModel = Depends(get_user),
):
    """Save/update appointment duration, buffer time, and overlap settings."""
    org_id = resolve_org_id(req.tenant_id, user)
    from api.services.appointment_settings_service import save_appointment_settings
    return await save_appointment_settings(
        organization_id=org_id,
        default_duration_minutes=req.default_duration_minutes,
        buffer_minutes=req.buffer_minutes,
        allow_overlap=req.allow_overlap,
        auto_next_slot=req.auto_next_slot,
    )




