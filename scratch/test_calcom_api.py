import asyncio
import httpx

async def test():
    # We will test both header auth and query auth across v1 and v2 endpoints
    test_key = "cal_live_dummy"  # We will test request structures
    headers = {"Authorization": f"Bearer {test_key}"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        endpoints = [
            ("v1 me query", "GET", "https://api.cal.com/v1/me", {"apiKey": test_key}, None),
            ("v1 me header", "GET", "https://api.cal.com/v1/me", None, headers),
            ("v2 me header", "GET", "https://api.cal.com/v2/me", None, headers),
            ("v1 event-types query", "GET", "https://api.cal.com/v1/event-types", {"apiKey": test_key}, None),
            ("v1 event-types header", "GET", "https://api.cal.com/v1/event-types", None, headers),
            ("v2 event-types header", "GET", "https://api.cal.com/v2/event-types", None, headers),
            ("v2 slots header", "GET", "https://api.cal.com/v2/slots/available", {"startTime": "2026-08-10T00:00:00Z", "endTime": "2026-08-10T23:59:59Z"}, headers),
        ]

        for name, method, url, params, h in endpoints:
            try:
                res = await client.request(method, url, params=params, headers=h)
                print(f"[{name}] {url} -> Status: {res.status_code}, Body: {res.text[:150]}")
            except Exception as e:
                print(f"[{name}] Exception: {e}")

if __name__ == "__main__":
    asyncio.run(test())
