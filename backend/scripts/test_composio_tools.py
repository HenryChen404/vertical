"""Test Composio Salesforce tools — list available actions and test create/update.

Usage:
    cd backend && uv run python scripts/test_composio_tools.py
"""

import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from composio import Composio


def main():
    client = Composio(api_key=os.getenv("COMPOSIO_API_KEY"))

    # List all Salesforce tools
    print("=" * 60)
    print("Available Salesforce tools:")
    print("=" * 60)

    tools = client.tools.get(toolkit_slugs=["salesforce"])

    # Filter for create/update/record related tools
    relevant = []
    for tool in tools:
        slug = tool.slug if hasattr(tool, 'slug') else str(tool)
        name = tool.name if hasattr(tool, 'name') else slug
        relevant.append(slug)

    # Sort and print
    for slug in sorted(relevant):
        if any(kw in slug.upper() for kw in ["CREATE", "UPDATE", "RECORD", "OBJECT", "TASK"]):
            print(f"  *** {slug}")
        else:
            print(f"      {slug}")

    print(f"\nTotal: {len(relevant)} tools")

    # Check specific tools we need
    print("\n" + "=" * 60)
    print("Checking specific tools:")
    print("=" * 60)

    check_slugs = [
        "SALESFORCE_UPDATE_RECORD",
        "SALESFORCE_UPDATE_S_OBJECT_RECORD",
        "SALESFORCE_CREATE_RECORD",
        "SALESFORCE_CREATE_S_OBJECT_RECORD",
        "SALESFORCE_CREATE_TASK",
        "SALESFORCE_CREATE_A_RECORD",
    ]

    found = set(s.upper() for s in relevant)
    for slug in check_slugs:
        status = "FOUND" if slug in found else "NOT FOUND"
        print(f"  {slug}: {status}")


if __name__ == "__main__":
    main()
