from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Date, and_, cast, func, or_, select

from api.db import db_client
from api.db.models import AppointmentModel, OrganizationModel, UserModel
from api.services.auth.depends import get_user

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
    selected_org_id = user.selected_organization_id

    async with db_client.async_session() as session:
        query = select(AppointmentModel, OrganizationModel.name, OrganizationModel.email).outerjoin(
            OrganizationModel, AppointmentModel.organization_id == OrganizationModel.id
        )

        # Scoping logic
        if is_superuser and tenant_id:
            query = query.where(AppointmentModel.organization_id == tenant_id)
        elif not is_superuser:
            if not selected_org_id:
                raise HTTPException(status_code=400, detail="No organization selected")
            query = query.where(AppointmentModel.organization_id == selected_org_id)
        elif is_superuser and selected_org_id:
            # Check if active org is a shifted tenant or global
            all_orgs = (await session.execute(select(OrganizationModel.id))).scalars().all()
            if selected_org_id in all_orgs:
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
            org_name = row[1]
            org_email = row[2]
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


@router.post("/book", response_model=AppointmentItemResponse)
async def book_appointment(
    req: BookAppointmentRequest,
    user: UserModel = Depends(get_user),
):
    """Book a new appointment. Called by AI voice call HTTP tool or UI."""
    org_id = req.organization_id or user.selected_organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID is required")

    start_dt = req.start_time
    if not req.end_time:
        end_dt = start_dt + timedelta(minutes=30)
    else:
        end_dt = req.end_time

    async with db_client.async_session() as session:
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

        org_stmt = select(OrganizationModel.name, OrganizationModel.email).where(
            OrganizationModel.id == org_id
        )
        org_res = await session.execute(org_stmt)
        org_row = org_res.first()

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
            organization_name=org_row[0] if org_row else None,
            organization_email=org_row[1] if org_row else None,
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
            query = query.where(AppointmentModel.organization_id == user.selected_organization_id)

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

        org_stmt = select(OrganizationModel.name, OrganizationModel.email).where(
            OrganizationModel.id == apt.organization_id
        )
        org_row = (await session.execute(org_stmt)).first()

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
            organization_name=org_row[0] if org_row else None,
            organization_email=org_row[1] if org_row else None,
            created_at=apt.created_at.isoformat(),
        )


@router.get("/summary", response_model=AppointmentsSummaryResponse)
async def get_appointments_summary(user: UserModel = Depends(get_user)):
    """Get appointments summary stats for dashboard and header widgets."""
    is_superuser = getattr(user, "is_superuser", False)
    selected_org_id = user.selected_organization_id

    async with db_client.async_session() as session:
        base_query = select(AppointmentModel)
        if not is_superuser:
            if not selected_org_id:
                raise HTTPException(status_code=400, detail="No organization selected")
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
            org_stmt = select(OrganizationModel.name, OrganizationModel.email).where(
                OrganizationModel.id == apt.organization_id
            )
            org_row = (await session.execute(org_stmt)).first()
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
                    organization_name=org_row[0] if org_row else None,
                    organization_email=org_row[1] if org_row else None,
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
            query = query.where(AppointmentModel.organization_id == user.selected_organization_id)

        result = await session.execute(query)
        apt = result.scalar_one_or_none()
        if not apt:
            raise HTTPException(status_code=404, detail="Appointment not found")

        await session.delete(apt)
        await session.commit()
        return {"status": "success", "message": f"Appointment {appointment_id} deleted"}
