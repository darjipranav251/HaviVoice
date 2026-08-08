import asyncio
import httpx
from datetime import datetime, timedelta, timezone

async def test():
    test_key = "cal_live_dummy"
    headers_v2 = {
        "Authorization": f"Bearer {test_key}",
        "Content-Type": "application/json",
        "cal-api-version": "2024-08-13",
    }

    start_iso = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")

    v2_payload_correct = {
        "eventTypeId": 12345,
        "start": start_iso,
        "attendee": {
            "name": "Jane Customer",
            "email": "customer@gmail.com",
            "timeZone": "UTC",
        },
        "bookingFieldsResponses": {
            "name": "Jane Customer",
            "email": "customer@gmail.com",
            "notes": "HaviVoice Test",
        },
    }

    async with httpx.AsyncClient() as client:
        r2 = await client.post("https://api.cal.com/v2/bookings", headers=headers_v2, json=v2_payload_correct)
        print("CORRECT V2 POST STATUS:", r2.status_code, "BODY:", r2.text[:200])

if __name__ == "__main__":
    asyncio.run(test())
