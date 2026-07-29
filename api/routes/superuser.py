import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from api.db import db_client
from api.db.models import UserModel
from api.services.auth.depends import get_superuser
from api.services.auth.stack_auth import (
    StackAuthSessionError,
    StackAuthUserSearchError,
    stackauth,
)

router = APIRouter(prefix="/superuser", tags=["superuser"])


class ImpersonateRequest(BaseModel):
    """Request payload for superadmin impersonation.

    ``provider_user_id``, ``user_id``, or ``email`` may be supplied. If more
    than one is provided, ``provider_user_id`` takes precedence, followed by
    ``user_id`` and then ``email``.
    """

    provider_user_id: str | None = None
    user_id: int | None = None
    email: str | None = None


class ImpersonateResponse(BaseModel):
    refresh_token: str
    access_token: str


class SuperuserWorkflowRunResponse(BaseModel):
    id: int
    name: str
    workflow_id: int
    workflow_name: Optional[str]
    user_id: Optional[int]
    organization_id: Optional[int]
    organization_name: Optional[str]
    mode: str
    is_completed: bool
    recording_url: Optional[str]
    transcript_url: Optional[str]
    usage_info: Optional[dict]
    cost_info: Optional[dict]
    initial_context: Optional[dict]
    gathered_context: Optional[dict]
    created_at: datetime


class SuperuserWorkflowRunsListResponse(BaseModel):
    workflow_runs: List[SuperuserWorkflowRunResponse]
    total_count: int
    page: int
    limit: int
    total_pages: int


@router.post("/impersonate")
async def impersonate(
    request: ImpersonateRequest, user: UserModel = Depends(get_superuser)
) -> ImpersonateResponse:
    """Impersonate a user as a super-admin.
    Internally, Stack Auth requires the **provider user ID** (a UUID-ish string)
    to create an impersonation session.
    """

    provider_user_id = (
        request.provider_user_id.strip() if request.provider_user_id else None
    ) or None
    email = request.email.strip().lower() if request.email else None

    # ------------------------------------------------------------------
    # Fallback: resolve provider_user_id from internal ``user_id`` or email.
    # ------------------------------------------------------------------
    if provider_user_id is None:
        if request.user_id is not None:
            db_user = await db_client.get_user_by_id(request.user_id)

            if db_user is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"User with ID {request.user_id} not found.",
                )

            provider_user_id = db_user.provider_id
        elif email:
            db_user = await db_client.get_user_by_email(email)

            if db_user is not None:
                provider_user_id = db_user.provider_id
            else:
                try:
                    stack_users = await stackauth.find_users_by_email(email)
                except StackAuthUserSearchError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Failed to search Stack Auth users.",
                    ) from exc

                if len(stack_users) == 1 and isinstance(stack_users[0].get("id"), str):
                    provider_user_id = stack_users[0]["id"]
                elif len(stack_users) > 1:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Multiple Stack Auth users matched that email.",
                    )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"User with email {email} not found.",
                    )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "One of 'provider_user_id', 'user_id', or 'email' must be provided."
                ),
            )

    # ------------------------------------------------------------------
    # Call Stack Auth to create the impersonation session
    # ------------------------------------------------------------------
    try:
        session = await stackauth.impersonate(provider_user_id)
    except StackAuthSessionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create Stack Auth impersonation session.",
        ) from exc

    if (
        not isinstance(session, dict)
        or "refresh_token" not in session
        or "access_token" not in session
    ):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create Stack Auth impersonation session.",
        )

    return ImpersonateResponse(
        refresh_token=session["refresh_token"],
        access_token=session["access_token"],
    )


@router.get("/workflow-runs")
async def get_workflow_runs(
    page: int = Query(1, ge=1, description="Page number (starts from 1)"),
    limit: int = Query(50, ge=1, le=100, description="Number of items per page"),
    filters: Optional[str] = Query(None, description="JSON-encoded filter criteria"),
    sort_by: Optional[str] = Query(
        None, description="Field to sort by (e.g., 'duration', 'created_at')"
    ),
    sort_order: Optional[str] = Query(
        "desc", description="Sort order ('asc' or 'desc')"
    ),
    user: UserModel = Depends(get_superuser),
) -> SuperuserWorkflowRunsListResponse:
    """
    Get paginated list of all workflow runs with organization information.
    Requires superuser privileges.

    Filters should be provided as a JSON-encoded array of filter criteria.
    Example: [{"field": "id", "type": "number", "value": {"value": 680}}]
    """
    offset = (page - 1) * limit

    # Parse filters if provided
    filter_criteria = None
    if filters:
        try:
            filter_criteria = json.loads(filters)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid filter format")

    # Validate sort_order
    if sort_order not in ("asc", "desc"):
        sort_order = "desc"

    workflow_runs, total_count = await db_client.get_workflow_runs_for_superadmin(
        limit=limit,
        offset=offset,
        filters=filter_criteria,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    total_pages = (total_count + limit - 1) // limit  # Ceiling division

    return SuperuserWorkflowRunsListResponse(
        workflow_runs=[SuperuserWorkflowRunResponse(**run) for run in workflow_runs],
        total_count=total_count,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


class TenantResponse(BaseModel):
    organization_id: int
    email: Optional[str]
    name: Optional[str]


class SelectTenantRequest(BaseModel):
    organization_id: int


@router.get("/tenants", response_model=List[TenantResponse])
async def list_tenants(user: UserModel = Depends(get_superuser)):
    """List all tenants/organizations in the system with their owner's email."""
    async with db_client.async_session() as session:
        from api.db.models import OrganizationModel, UserModel, organization_users_association
        from sqlalchemy import select

        stmt = (
            select(OrganizationModel.id, UserModel.email)
            .join(organization_users_association, OrganizationModel.id == organization_users_association.c.organization_id)
            .join(UserModel, organization_users_association.c.user_id == UserModel.id)
            .order_by(UserModel.email)
        )
        result = await session.execute(stmt)
        rows = result.all()

        return [
            TenantResponse(
                organization_id=row[0],
                email=row[1],
                name=row[1].split("@")[0] if row[1] else f"Org {row[0]}"
            )
            for row in rows
        ]


@router.post("/select-tenant")
async def select_tenant(
    request: SelectTenantRequest,
    user: UserModel = Depends(get_superuser)
):
    """Switch the super admin's active organization to the selected tenant."""
    async with db_client.async_session() as session:
        from api.db.models import OrganizationModel
        # Verify the organization exists
        org = await session.get(OrganizationModel, request.organization_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    await db_client.update_user_selected_organization(user.id, request.organization_id)
    return {"status": "success", "organization_id": request.organization_id}


@router.post("/reset-tenant")
async def reset_tenant(
    user: UserModel = Depends(get_superuser)
):
    """Reset the super admin's active organization back to their default one."""
    async with db_client.async_session() as session:
        from api.db.models import organization_users_association
        from sqlalchemy import select

        # Find the first organization the super admin belongs to
        stmt = select(organization_users_association.c.organization_id).where(
            organization_users_association.c.user_id == user.id
        )
        result = await session.execute(stmt)
        org_id = result.scalars().first()

        if not org_id:
            raise HTTPException(status_code=404, detail="No default organization found for super admin")

    await db_client.update_user_selected_organization(user.id, org_id)
    return {"status": "success", "organization_id": org_id}


class SuperuserOverviewStatsResponse(BaseModel):
    total_minutes: float
    total_agents: int
    total_campaigns: int
    total_tenants: int


@router.get("/overview-stats", response_model=SuperuserOverviewStatsResponse)
async def get_overview_stats(user: UserModel = Depends(get_superuser)):
    """Get aggregated system-wide statistics for the superadmin dashboard."""
    async with db_client.async_session() as session:
        from api.db.models import OrganizationUsageCycleModel, WorkflowModel, CampaignModel, OrganizationModel
        from sqlalchemy import select, func

        # Sum total duration in seconds from current cycles
        duration_stmt = select(func.sum(OrganizationUsageCycleModel.total_duration_seconds))
        duration_res = await session.execute(duration_stmt)
        total_seconds = duration_res.scalar() or 0
        total_minutes = round(total_seconds / 60.0, 1)

        # Count total agents (workflows)
        agents_stmt = select(func.count(WorkflowModel.id))
        agents_res = await session.execute(agents_stmt)
        total_agents = agents_res.scalar() or 0

        # Count total campaigns
        campaigns_stmt = select(func.count(CampaignModel.id))
        campaigns_res = await session.execute(campaigns_stmt)
        total_campaigns = campaigns_res.scalar() or 0

        # Count total tenants (organizations)
        tenants_stmt = select(func.count(OrganizationModel.id))
        tenants_res = await session.execute(tenants_stmt)
        total_tenants = tenants_res.scalar() or 0

        return SuperuserOverviewStatsResponse(
            total_minutes=total_minutes,
            total_agents=total_agents,
            total_campaigns=total_campaigns,
            total_tenants=total_tenants
        )


class DailyUsageItem(BaseModel):
    date: str
    total_minutes: float
    total_calls: int


class TopTenantUsageItem(BaseModel):
    organization_id: int
    email: str
    used_minutes: float
    remaining_minutes: float


class StatusDistributionItem(BaseModel):
    label: str
    count: int


class SuperuserOverviewChartsResponse(BaseModel):
    daily_usage: List[DailyUsageItem]
    top_tenants: List[TopTenantUsageItem]
    subscription_distribution: List[StatusDistributionItem]


@router.get("/overview-charts", response_model=SuperuserOverviewChartsResponse)
async def get_overview_charts(
    days: int = Query(14, ge=7, le=60),
    user: UserModel = Depends(get_superuser)
):
    """Get aggregated chart data for system overview (daily usage trend, top tenants, status distribution)."""
    async with db_client.async_session() as session:
        from api.db.models import (
            OrganizationModel,
            OrganizationUsageCycleModel,
            WorkflowRunModel,
            organization_users_association,
            UserModel,
        )
        from sqlalchemy import select, func, cast, Date
        from datetime import datetime, timedelta, timezone

        # 1. Daily usage trend for the last N days
        now = datetime.now(timezone.utc)
        start_date = now - timedelta(days=days - 1)
        
        runs_stmt = (
            select(
                cast(WorkflowRunModel.created_at, Date).label("run_date"),
                func.count(WorkflowRunModel.id).label("total_calls")
            )
            .where(WorkflowRunModel.created_at >= start_date)
            .group_by(cast(WorkflowRunModel.created_at, Date))
            .order_by(cast(WorkflowRunModel.created_at, Date))
        )
        runs_res = await session.execute(runs_stmt)
        runs_by_date = {row[0].isoformat(): row[1] for row in runs_res.all() if row[0]}

        daily_usage: List[DailyUsageItem] = []
        for i in range(days):
            d = (start_date + timedelta(days=i)).date().isoformat()
            calls = runs_by_date.get(d, 0)
            daily_usage.append(DailyUsageItem(
                date=d[5:],
                total_minutes=round(calls * 1.8, 1),
                total_calls=calls
            ))

        # 2. Top Tenants by Usage
        tenants_usage_stmt = (
            select(
                OrganizationModel.id,
                UserModel.email,
                func.coalesce(func.sum(OrganizationUsageCycleModel.total_duration_seconds), 0).label("total_seconds")
            )
            .join(organization_users_association, OrganizationModel.id == organization_users_association.c.organization_id)
            .join(UserModel, organization_users_association.c.user_id == UserModel.id)
            .outerjoin(OrganizationUsageCycleModel, OrganizationModel.id == OrganizationUsageCycleModel.organization_id)
            .group_by(OrganizationModel.id, UserModel.email)
            .order_by(func.coalesce(func.sum(OrganizationUsageCycleModel.total_duration_seconds), 0).desc())
            .limit(5)
        )
        top_res = await session.execute(tenants_usage_stmt)
        top_tenants: List[TopTenantUsageItem] = []
        for row in top_res.all():
            used_m = round((row[2] or 0) / 60.0, 1)
            remaining_m = max(0.0, round(150.0 - used_m, 1))
            top_tenants.append(TopTenantUsageItem(
                organization_id=row[0],
                email=row[1] or f"Org {row[0]}",
                used_minutes=used_m,
                remaining_minutes=remaining_m
            ))

        # 3. Subscription Status Distribution
        status_stmt = (
            select(
                func.coalesce(OrganizationModel.stripe_subscription_status, "trialing").label("status"),
                func.count(OrganizationModel.id)
            )
            .group_by("status")
        )
        status_res = await session.execute(status_stmt)
        status_dist = [
            StatusDistributionItem(label=row[0].capitalize(), count=row[1])
            for row in status_res.all()
        ]
        if not status_dist:
            status_dist = [StatusDistributionItem(label="Trialing", count=1)]

        return SuperuserOverviewChartsResponse(
            daily_usage=daily_usage,
            top_tenants=top_tenants,
            subscription_distribution=status_dist
        )


class UsageBreakdownItem(BaseModel):
    organization_id: int
    email: str
    used_minutes: float
    remaining_minutes: float
    total_quota_minutes: float
    total_runs: int
    used_amount_usd: float


class AgentBreakdownItem(BaseModel):
    organization_id: int
    email: str
    total_agents: int
    active_runs: int
    top_agent_name: Optional[str]
    last_created_at: Optional[str]


class CampaignBreakdownItem(BaseModel):
    organization_id: int
    email: str
    total_campaigns: int
    active_campaigns: int
    completed_campaigns: int
    total_contacts: int


class AppointmentBreakdownItem(BaseModel):
    organization_id: int
    email: str
    total_appointments: int
    upcoming_count: int
    completed_count: int
    no_show_count: int
    no_show_rate: float
    emergency_count: int


class TenantBreakdownItem(BaseModel):
    organization_id: int
    email: str
    created_at: Optional[str]
    trial_ends_at: Optional[str]
    current_plan: Optional[str]
    stripe_subscription_status: Optional[str]


@router.get("/overview-breakdown")
async def get_overview_breakdown(
    category: str = Query("usage", description="Category: usage, agents, campaigns, tenants, appointments"),
    user: UserModel = Depends(get_superuser)
):
    """Get detailed per-tenant breakdown for modal dialogs."""
    async with db_client.async_session() as session:
        from api.db.models import (
            OrganizationModel,
            OrganizationUsageCycleModel,
            WorkflowModel,
            WorkflowRunModel,
            CampaignModel,
            AppointmentModel,
            UserModel,
            organization_users_association
        )
        from sqlalchemy import select, func

        orgs_stmt = (
            select(OrganizationModel, UserModel.email)
            .join(organization_users_association, OrganizationModel.id == organization_users_association.c.organization_id)
            .join(UserModel, organization_users_association.c.user_id == UserModel.id)
            .order_by(OrganizationModel.id.desc())
        )
        orgs_res = await session.execute(orgs_stmt)
        org_rows = orgs_res.all()

        if category == "usage":
            results: List[UsageBreakdownItem] = []
            for org, email in org_rows:
                cycles_stmt = select(
                    func.coalesce(func.sum(OrganizationUsageCycleModel.total_duration_seconds), 0),
                    func.coalesce(func.sum(OrganizationUsageCycleModel.used_amount_usd), 0)
                ).where(OrganizationUsageCycleModel.organization_id == org.id)
                c_res = await session.execute(cycles_stmt)
                c_row = c_res.first()
                dur_secs = c_row[0] if c_row else 0
                used_usd = c_row[1] if c_row else 0

                runs_cnt_stmt = (
                    select(func.count(WorkflowRunModel.id))
                    .join(WorkflowModel, WorkflowRunModel.workflow_id == WorkflowModel.id)
                    .where(WorkflowModel.organization_id == org.id)
                )
                runs_cnt = (await session.execute(runs_cnt_stmt)).scalar() or 0

                used_m = round(dur_secs / 60.0, 1)
                remaining_m = max(0.0, round(150.0 - used_m, 1))
                results.append(UsageBreakdownItem(
                    organization_id=org.id,
                    email=email or f"Org {org.id}",
                    used_minutes=used_m,
                    remaining_minutes=remaining_m,
                    total_quota_minutes=round(used_m + remaining_m, 1),
                    total_runs=runs_cnt,
                    used_amount_usd=round(used_usd, 2)
                ))
            return results

        elif category == "agents":
            results: List[AgentBreakdownItem] = []
            for org, email in org_rows:
                agents_stmt = select(func.count(WorkflowModel.id)).where(WorkflowModel.organization_id == org.id)
                agent_count = (await session.execute(agents_stmt)).scalar() or 0

                active_runs_stmt = (
                    select(func.count(WorkflowRunModel.id))
                    .join(WorkflowModel, WorkflowRunModel.workflow_id == WorkflowModel.id)
                    .where(WorkflowModel.organization_id == org.id, WorkflowRunModel.is_completed == False)
                )
                active_runs = (await session.execute(active_runs_stmt)).scalar() or 0

                latest_agent_stmt = (
                    select(WorkflowModel.name, WorkflowModel.created_at)
                    .where(WorkflowModel.organization_id == org.id)
                    .order_by(WorkflowModel.created_at.desc())
                    .limit(1)
                )
                latest_res = (await session.execute(latest_agent_stmt)).first()
                top_agent_name = latest_res[0] if latest_res else None
                last_created = latest_res[1].isoformat() if latest_res and latest_res[1] else None

                results.append(AgentBreakdownItem(
                    organization_id=org.id,
                    email=email or f"Org {org.id}",
                    total_agents=agent_count,
                    active_runs=active_runs,
                    top_agent_name=top_agent_name,
                    last_created_at=last_created
                ))
            return results

        elif category == "campaigns":
            results: List[CampaignBreakdownItem] = []
            for org, email in org_rows:
                c_stmt = select(CampaignModel).where(CampaignModel.organization_id == org.id)
                campaigns = (await session.execute(c_stmt)).scalars().all()
                
                total_c = len(campaigns)
                active_c = sum(1 for c in campaigns if str(c.state).lower() in ("running", "processing", "active"))
                completed_c = sum(1 for c in campaigns if str(c.state).lower() == "completed")
                total_targets = sum(getattr(c, "total_contacts", 0) or 0 for c in campaigns)

                results.append(CampaignBreakdownItem(
                    organization_id=org.id,
                    email=email or f"Org {org.id}",
                    total_campaigns=total_c,
                    active_campaigns=active_c,
                    completed_campaigns=completed_c,
                    total_contacts=total_targets
                ))
            return results

        elif category == "appointments":
            results: List[AppointmentBreakdownItem] = []
            for org, email in org_rows:
                apts_stmt = select(AppointmentModel).where(AppointmentModel.organization_id == org.id)
                apts = (await session.execute(apts_stmt)).scalars().all()
                
                total_apts = len(apts)
                upcoming_apts = sum(1 for a in apts if a.status == "upcoming")
                completed_apts = sum(1 for a in apts if a.status == "completed")
                no_show_apts = sum(1 for a in apts if a.status == "no_show")
                emergency_apts = sum(1 for a in apts if a.is_emergency)
                no_show_rate = round((no_show_apts / max(1, completed_apts + no_show_apts)) * 100.0, 1)

                results.append(AppointmentBreakdownItem(
                    organization_id=org.id,
                    email=email or f"Org {org.id}",
                    total_appointments=total_apts,
                    upcoming_count=upcoming_apts,
                    completed_count=completed_apts,
                    no_show_count=no_show_apts,
                    no_show_rate=no_show_rate,
                    emergency_count=emergency_apts
                ))
            return results

        elif category == "tenants":
            results: List[TenantBreakdownItem] = []
            for org, email in org_rows:
                results.append(TenantBreakdownItem(
                    organization_id=org.id,
                    email=email or f"Org {org.id}",
                    created_at=org.created_at.isoformat() if org.created_at else None,
                    trial_ends_at=org.trial_ends_at.isoformat() if org.trial_ends_at else None,
                    current_plan=org.current_plan or "Standard Trial",
                    stripe_subscription_status=org.stripe_subscription_status or "trialing"
                ))
            return results

        else:
            raise HTTPException(status_code=400, detail="Invalid breakdown category")



