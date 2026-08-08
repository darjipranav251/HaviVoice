import asyncio
import httpx
from api.db import db_client
from api.db.models import UserModel
from api.utils.auth import create_jwt_token
from sqlalchemy import select

async def main():
    async with db_client.async_session() as s:
        u = (await s.execute(select(UserModel).where(UserModel.email == "havivoice@gmail.com"))).scalars().first()
        token = create_jwt_token(u.id, u.email)
        print("SUPERADMIN TOKEN GENERATED FOR ID", u.id)

    async with httpx.AsyncClient() as client:
        res = await client.get("http://localhost:8000/api/v1/superuser/tenants/billing", headers={"Authorization": f"Bearer {token}"})
        print("STATUS CODE:", res.status_code)
        if res.status_code == 200:
            print("TENANTS BILLING DATA:", res.json())
        else:
            print("ERROR RESPONSE:", res.text)

if __name__ == "__main__":
    asyncio.run(main())
