"""
Subscription status validation and billing guard utilities.
Enforces feature access rules: users with unpaid, inactive, past_due, or canceled subscriptions
(or expired trials) cannot make/receive calls, book appointments, or execute workflows unless superadmin.
"""

from datetime import datetime, timezone
from typing import Optional, Tuple
from loguru import logger
from api.db.models import OrganizationModel, UserModel

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
    if user and getattr(user, "is_superuser", False):
        return True, ""

    if not org:
        return False, "Organization not found"

    status = (org.stripe_subscription_status or "").lower()

    if status in INACTIVE_SUBSCRIPTION_STATUSES:
        formatted_status = status.replace("_", " ").title()
        return False, f"Subscription is {formatted_status}. Please update your subscription in Billing settings to access full features."

    # Handle trialing or un-set subscription status
    if status == "trialing" or not status:
        if org.trial_ends_at:
            now = datetime.now(timezone.utc)
            trial_end = org.trial_ends_at
            if trial_end.tzinfo is None:
                trial_end = trial_end.replace(tzinfo=timezone.utc)
            if now > trial_end:
                return False, "Free trial has expired. Please subscribe to a plan in Billing settings."

    return True, ""
