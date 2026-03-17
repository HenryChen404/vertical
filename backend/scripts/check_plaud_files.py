"""Quick script to inspect raw PLAUD API responses."""

import httpx
import json

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbGllbnRfdXNlcl9kZjgwMjJiYi02YjA5LTRhZTAtYTdhZC1iNmNlNDkxMzQxZDkiLCJhdWQiOiIiLCJleHAiOjE3NzM4MTMzMDYsImlhdCI6MTc3MzcyNjkwNiwiY2xpZW50X2lkIjoiY2xpZW50X2NmNWI2YzdkLWU3MTctNDUyMi04N2JmLTZkOWVkNDYwMDliOCIsInR5cGUiOiJhY2Nlc3NfdG9rZW4ifQ.6uaBPDRiURhHydzIbaJz_UAHM1xm66Vo77zYX7zB5Z4"
BASE = "https://platform.plaud.ai/developer/api/open/third-party"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def main():
    with httpx.Client(timeout=30) as client:
        # 1. List files
        print("=" * 60)
        print("GET /files/")
        print("=" * 60)
        resp = client.get(f"{BASE}/files/", headers=HEADERS)
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))

        # 2. Get first file by ID
        # Try to extract a file ID from the list response
        items = data
        if isinstance(data, dict):
            items = data.get("data", data)
            if isinstance(items, dict):
                items = items.get("items") or items.get("files") or items.get("list") or []
        if not isinstance(items, list):
            items = []

        if items:
            first = items[0]
            file_id = first.get("id") or first.get("fileId") or first.get("file_id")
            print()
            print("=" * 60)
            print(f"GET /files/{file_id}")
            print("=" * 60)
            resp2 = client.get(f"{BASE}/files/{file_id}", headers=HEADERS)
            print(f"Status: {resp2.status_code}")
            print(json.dumps(resp2.json(), indent=2, ensure_ascii=False))
        else:
            print("\nNo files found in list response.")


if __name__ == "__main__":
    main()
