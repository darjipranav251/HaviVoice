import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Add the project root to the python path so we can import api modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import update
from sqlalchemy.future import select

from api.db.database import get_session
from api.db.models import OrganizationModel

async def main():
    print("Backfilling trial ends at for all organizations without one...")
    async with get_session() as session:
        # Find orgs with no trial_ends_at
        result = await session.execute(
            select(OrganizationModel).where(OrganizationModel.trial_ends_at == None)
        )
        orgs = result.scalars().all()
        print(f"Found {len(orgs)} organizations to backfill.")
        
        for org in orgs:
            # Set trial to 14 days from their created_at date, or from now if it would be over?
            # Wait, the user said "default", meaning standard 14 days from NOW for existing users,
            # so they get a fair chance to try it out.
            trial_end = datetime.now(timezone.utc) + timedelta(days=14)
            org.trial_ends_at = trial_end
            
        await session.commit()
        print("Successfully backfilled.")

if __name__ == "__main__":
    asyncio.run(main())
