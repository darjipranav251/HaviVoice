from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from api.constants import ENABLE_SIGNUP
from api.db import db_client
from api.db.models import UserModel
from api.enums import OrganizationConfigurationKey, PostHogEvent
from api.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserResponse
from api.services.auth.depends import (
    create_user_configuration_with_mps_key,
    get_user,
    require_local_auth,
)
from api.services.configuration.ai_model_configuration import (
    convert_legacy_ai_model_configuration_to_v2,
)
from api.services.posthog_client import capture_event
from api.utils.auth import create_jwt_token, hash_password, verify_password

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


@router.post(
    "/signup",
    response_model=AuthResponse,
    dependencies=[Depends(require_local_auth)],
)
async def signup(request: SignupRequest):
    if not ENABLE_SIGNUP:
        raise HTTPException(status_code=403, detail="Signup is disabled")

    # Check if email is already taken
    existing_user = await db_client.get_user_by_email(request.email)
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Hash password and create user
    hashed = hash_password(request.password)
    user = await db_client.create_user_with_email(
        email=request.email,
        password_hash=hashed,
        name=request.name,
        mobile_number=request.mobile_number,
    )

    # Create organization for the user
    org_provider_id = f"org_{user.provider_id}"
    organization, _ = await db_client.get_or_create_organization_by_provider_id(
        org_provider_id=org_provider_id,
        user_id=user.id,
        name=request.business_name,
        business_type=request.business_type,
        address_street=request.address_street,
        address_city=request.address_city,
        address_state=request.address_state,
        address_zip=request.address_zip,
        address_country=request.address_country,
    )

    # Link user to organization
    await db_client.add_user_to_organization(user.id, organization.id)
    await db_client.update_user_selected_organization(user.id, organization.id)

    # Create default service configuration
    try:
        mps_config = await create_user_configuration_with_mps_key(
            user.id, organization.id, user.provider_id
        )
        if mps_config:
            await db_client.update_user_configuration(user.id, mps_config)
            model_config_v2 = convert_legacy_ai_model_configuration_to_v2(mps_config)
            await db_client.upsert_configuration(
                organization.id,
                OrganizationConfigurationKey.MODEL_CONFIGURATION_V2.value,
                model_config_v2.model_dump(mode="json", exclude_none=True),
            )
    except Exception:
        logger.warning(
            "Failed to create default configuration for OSS user", exc_info=True
        )

    # Create JWT token
    token = create_jwt_token(user.id, request.email)

    capture_event(
        distinct_id=str(user.provider_id),
        event=PostHogEvent.SIGNED_UP,
        properties={
            "organization_id": organization.id,
            "auth_provider": "local",
        },
    )

    from api.constants import SUPERADMIN_EMAIL
    is_super = user.is_superuser or (user.email and user.email.lower() == SUPERADMIN_EMAIL)
    trial_ends = organization.trial_ends_at.isoformat() if organization.trial_ends_at else None

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=request.name,
            organization_id=organization.id,
            provider_id=user.provider_id,
            is_superuser=is_super,
            trial_ends_at=trial_ends,
            current_plan="Superadmin Plan" if is_super else (organization.current_plan or "Standard Trial"),
            stripe_subscription_status="active" if is_super else (organization.stripe_subscription_status or "trialing"),
        ),
    )


@router.post(
    "/login",
    response_model=AuthResponse,
    dependencies=[Depends(require_local_auth)],
)
async def login(request: LoginRequest):
    # Look up user by email
    user = await db_client.get_user_by_email(request.email)
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Verify password
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    from api.constants import SUPERADMIN_EMAIL
    is_super = user.is_superuser or (user.email and user.email.lower() == SUPERADMIN_EMAIL)

    trial_ends = None
    curr_plan = "Superadmin Plan" if is_super else "Standard Trial"
    sub_status = "active" if is_super else "trialing"

    if user.selected_organization_id:
        org = await db_client.get_organization_by_id(user.selected_organization_id)
        if org:
            trial_ends = org.trial_ends_at.isoformat() if org.trial_ends_at else None
            curr_plan = "Superadmin Plan" if is_super else (org.current_plan or "Standard Trial")
            sub_status = "active" if is_super else (org.stripe_subscription_status or "trialing")

    # Create JWT token
    token = create_jwt_token(user.id, user.email)

    capture_event(
        distinct_id=str(user.provider_id),
        event=PostHogEvent.SIGNED_IN,
        properties={
            "organization_id": user.selected_organization_id,
            "auth_provider": "local",
        },
    )

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            organization_id=user.selected_organization_id,
            provider_id=user.provider_id,
            is_superuser=is_super,
            trial_ends_at=trial_ends,
            current_plan=curr_plan,
            stripe_subscription_status=sub_status,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(user: UserModel = Depends(get_user)):
    from api.constants import SUPERADMIN_EMAIL
    is_super = user.is_superuser or (user.email and user.email.lower() == SUPERADMIN_EMAIL)

    trial_ends = None
    curr_plan = "Superadmin Plan" if is_super else "Standard Trial"
    sub_status = "active" if is_super else "trialing"

    if user.selected_organization_id:
        org = await db_client.get_organization_by_id(user.selected_organization_id)
        if org:
            trial_ends = org.trial_ends_at.isoformat() if org.trial_ends_at else None
            curr_plan = "Superadmin Plan" if is_super else (org.current_plan or "Standard Trial")
            sub_status = "active" if is_super else (org.stripe_subscription_status or "trialing")

    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        organization_id=user.selected_organization_id,
        provider_id=user.provider_id,
        is_superuser=is_super,
        trial_ends_at=trial_ends,
        current_plan=curr_plan,
        stripe_subscription_status=sub_status,
    )
