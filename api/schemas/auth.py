from pydantic import BaseModel, EmailStr, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None
    mobile_number: str | None = None
    business_name: str | None = None
    business_type: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_state: str | None = None
    address_zip: str | None = None
    address_country: str | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str | None
    name: str | None = None
    organization_id: int | None = None
    provider_id: str | None = None
    is_superuser: bool = False
    trial_ends_at: str | None = None
    current_plan: str | None = None
    stripe_subscription_status: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: UserResponse
