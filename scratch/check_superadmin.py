import asyncio
from api.db import db_client
from api.db.models import UserModel
from sqlalchemy import select, update

async def check():
    async with db_client.async_session() as s:
        res = await s.execute(select(UserModel).where(UserModel.email == "havivoice@gmail.com"))
        u = res.scalars().first()
        if u:
            print("FOUND HAVIVOICE:", u.id, u.email, u.is_superuser)
            await s.execute(update(UserModel).where(UserModel.id == u.id).values(is_superuser=True))
            await s.commit()
            print("SET IS_SUPERUSER = TRUE SUCCESS")
        else:
            print("HAVIVOICE NOT FOUND IN DB")

if __name__ == "__main__":
    asyncio.run(check())
