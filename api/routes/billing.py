import os
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from loguru import logger
from pydantic import BaseModel
from sqlalchemy.future import select

from api.db import db_client
from api.db.models import OrganizationModel, UserModel
from api.services.auth.depends import get_user

router = APIRouter(prefix="/billing")

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_dummy")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "whsec_dummy")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3010")


class CheckoutRequest(BaseModel):
    price_id: str
    is_signup: bool = False


@router.post("/checkout")
async def create_checkout_session(
    request: CheckoutRequest,
    user: UserModel = Depends(get_user),
):
    if not user.selected_organization_id:
        raise HTTPException(status_code=400, detail="No organization selected")

    async with db_client.async_session() as session:
        org = await session.get(OrganizationModel, user.selected_organization_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        try:
            # Create or use existing Stripe customer
            customer_id = org.stripe_customer_id
            if not customer_id:
                customer = stripe.Customer.create(
                    metadata={"organization_id": str(org.id)}
                )
                customer_id = customer.id
                org.stripe_customer_id = customer_id
                session.add(org)
                await session.commit()

            session_params = {
                "customer": customer_id,
                "payment_method_types": ["card"],
                "line_items": [{"price": request.price_id, "quantity": 1}],
                "mode": "subscription",
                "success_url": f"{FRONTEND_URL}/billing?success=true",
                "cancel_url": f"{FRONTEND_URL}/billing?canceled=true",
                "client_reference_id": str(org.id),
            }

            if request.is_signup:
                session_params["subscription_data"] = {"trial_period_days": 14}
                session_params["success_url"] = f"{FRONTEND_URL}/after-sign-in"
                session_params["cancel_url"] = f"{FRONTEND_URL}/auth/select-plan"

            checkout_session = stripe.checkout.Session.create(**session_params)
            return {"url": checkout_session.url}
        except Exception as e:
            logger.error(f"Error creating checkout session: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/portal")
async def create_portal_session(
    user: UserModel = Depends(get_user),
):
    if not user.selected_organization_id:
        raise HTTPException(status_code=400, detail="No organization selected")

    async with db_client.async_session() as session:
        org = await session.get(OrganizationModel, user.selected_organization_id)
        if not org or not org.stripe_customer_id:
            raise HTTPException(status_code=400, detail="No active billing account")

        try:
            portal_session = stripe.billing_portal.Session.create(
                customer=org.stripe_customer_id,
                return_url=f"{FRONTEND_URL}/billing",
            )
            return {"url": portal_session.url}
        except Exception as e:
            logger.error(f"Error creating portal session: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session_obj = event["data"]["object"]
        org_id = session_obj.get("client_reference_id")
        sub_id = session_obj.get("subscription")

        if org_id and sub_id:
            async with db_client.async_session() as session:
                org = await session.get(OrganizationModel, int(org_id))
                if org:
                    subscription = stripe.Subscription.retrieve(sub_id)
                    org.stripe_subscription_id = sub_id
                    org.stripe_subscription_status = subscription.status
                    # Set current_plan based on the price
                    if hasattr(subscription, "items") and subscription["items"].get("data"):
                        price_id = subscription["items"]["data"][0].get("price", {}).get("id", "")
                        org.current_plan = price_id
                    # Set trial end from Stripe
                    if getattr(subscription, "trial_end", None):
                        org.trial_ends_at = datetime.fromtimestamp(
                            subscription.trial_end, tz=timezone.utc
                        )
                    session.add(org)
                    await session.commit()

    elif event["type"] in ["customer.subscription.updated", "customer.subscription.deleted"]:
        subscription = event["data"]["object"]
        async with db_client.async_session() as session:
            result = await session.execute(
                select(OrganizationModel).where(
                    OrganizationModel.stripe_subscription_id == subscription.id
                )
            )
            org = result.scalar_one_or_none()
            if org:
                org.stripe_subscription_status = subscription.status
                session.add(org)
                await session.commit()

    return {"status": "success"}
