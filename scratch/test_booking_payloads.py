import asyncio
import httpx
from datetime import datetime, timedelta, timezone

async def test():
    test_key = "cal_live_dummy"
    headers_v2 = {"Authorization": f"Bearer {test_key}", "Content-Type": "application/json", "cal-api-version": "2024-08-13"}
    headers_v1 = {"Authorization": f"Bearer {test_key}", "Content-Type": "application/json"}

    start_iso = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")

    v2_payload = {
        "eventTypeId": 12345,
        "start": start_iso,
        "attendee": {
            "name": "Jane Customer",
            "email": "customer@gmail.com",
            "timeZone": "UTC",
        },
        "responses": {
            "name": "Jane Customer",
            "email": "customer@gmail.com",
            "notes": "HaviVoice Test",
        },
    }

    v1_payload = {
        "eventTypeId": 12345,
        "start": start_iso,
        "name": "Jane Customer",
        "email": "customer@gmail.com",
        "timeZone": "UTC",
        "notes": "HaviVoice Test",
    }

    async with httpx.AsyncClient() as client:
        r2 = await client.post("https://api.cal.com/v2/bookings", headers=headers_v2, json=v2_payload)
        print("V2 POST STATUS:", r2.status_code, "BODY:", r2.text[:200])

        r1 = await client.post("https://api.cal.com/v1/bookings", headers=headers_v1, json=v1_payload)
        print("V1 POST STATUS:", r1.status_code, "BODY:", r1.text[:200])

if __name__ == "__main__":
    asyncio.run(test())
