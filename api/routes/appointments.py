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
    organization_id: Optional[int] = None


class UpdateAppointmentStatusRequest(BaseModel):
    status: Optional[str] = None  # upcoming, completed, no_show, cancelled
    is_emergency: Optional[bool] = None
    notes: Optional[str] = None


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
    if not req.end_time:
        end_dt = start_dt + timedelta(minutes=30)
    else:
        end_dt = req.end_time

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
        return {"status": "success", "message": f"Appointment {appointment_id} deleted"}
