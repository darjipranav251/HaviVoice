"""
Subscription status validation and billing guard utilities.
Enforces feature access rules: users with unpaid, inactive, past_due, or canceled subscriptions
(or expired trials) cannot make/receive calls, book appointments, or execute workflows unless superadmin.
"""

from datetime import datetime, timezone
from typing import Optional, Tuple
from fastapi import Depends, HTTPException, status as status_code
from loguru import logger

from api.db.models import OrganizationModel, UserModel
from api.services.auth.depends import get_user

INACTIVE_SUBSCRIPTION_STATUSES = {
    "unpaid",
    "inactive",
    "past_due",
    "canceled",
    "cancelled",
    "expired",
}

def is_subscription_active_for_org(
    org: Optional[OrganizationModel],
    user: Optional[UserModel] = None,
) -> Tuple[bool, str]:
    """
    Checks if the organization has an active/valid subscription or if the user is a superadmin.

    Returns:
        (is_active: bool, reason_if_inactive: str)
    """
    from api.constants import SUPERADMIN_EMAIL
    if user and (getattr(user, "is_superuser", False) or (user.email and user.email.lower() == SUPERADMIN_EMAIL)):
        return True, ""

    if not org:
        return False, "Organization not found"

    status = (org.stripe_subscription_status or "").lower()

    if status in INACTIVE_SUBSCRIPTION_STATUSES:
        formatted_status = status.replace("_", " ").title()
        return False, f"Subscription is {formatted_status}. Please update your subscription in Billing settings to access full features."

    # Handle trialing or un-set subscription status
    if status == "trialing" or not status:
        if not org.trial_ends_at:
            return True, ""  # Default trial active

        now = datetime.now(timezone.utc)
        trial_end = org.trial_ends_at
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        if now > trial_end:
            return False, "Free trial has expired. Please subscribe to a plan in Billing settings."
        return True, ""

    if status in ("active", "manual"):
        return True, ""

    return False, "Active subscription required. Please update your plan in Billing settings."


async def check_billing_guard(user: UserModel = Depends(get_user)) -> UserModel:
    """
    FastAPI dependency to enforce active subscription or trial.
    Raises HTTP 402 Payment Required if trial has expired or subscription is inactive.
    """
    from api.constants import SUPERADMIN_EMAIL
    if getattr(user, "is_superuser", False) or (user.email and user.email.lower() == SUPERADMIN_EMAIL):
        return user

    if not user.selected_organization_id:
        return user

    from api.db import db_client
    org = await db_client.get_organization_by_id(user.selected_organization_id)
    is_active, reason = is_subscription_active_for_org(org, user)
    if not is_active:
        raise HTTPException(
            status_code=status_code.HTTP_402_PAYMENT_REQUIRED,
            detail=reason or "Free trial has expired. Please subscribe to a plan in Billing settings."
        )
    return user
