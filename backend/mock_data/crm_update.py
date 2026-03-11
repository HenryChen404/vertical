UNSYNCED_RECORDINGS = [
    {
        "id": "ur1",
        "title": "Client Meeting: Acme Corp",
        "date": "Today, 10:00 AM",
        "duration": "1h 00m",
        "selected": True,
    },
    {
        "id": "ur2",
        "title": "Product Demo: TechStart Inc",
        "date": "Today, 2:00 PM",
        "duration": "1h 30m",
        "selected": False,
    },
    {
        "id": "ur3",
        "title": "Follow-up: DataFlow Systems",
        "date": "Yesterday, 3:00 PM",
        "duration": "45m",
        "selected": False,
    },
    {
        "id": "ur4",
        "title": "Internal Review: Q4 Pipeline",
        "date": "Yesterday, 11:00 AM",
        "duration": "30m",
        "selected": False,
    },
    {
        "id": "ur5",
        "title": "Discovery Call: NewCo",
        "date": "Oct 28, 9:00 AM",
        "duration": "55m",
        "selected": False,
    },
]

CRM_PROPOSAL = {
    "session_id": "session_001",
    "recording_title": "Discovery Call - TechStart",
    "sections": [
        {
            "category": "Opportunity",
            "fields": [
                {"field": "Stage", "old_value": "Discovery", "new_value": "Proposal"},
                {"field": "Amount", "old_value": "$45,000", "new_value": "$62,000"},
                {"field": "Close Date", "old_value": "2025-12-15", "new_value": "2025-11-30"},
            ],
            "confirmed": False,
        },
        {
            "category": "Contact",
            "fields": [
                {"field": "Title", "old_value": "Sales Manager", "new_value": "Head of Sales"},
                {"field": "Phone", "old_value": "(555) 123-4567", "new_value": "(555) 987-6543"},
            ],
            "confirmed": False,
        },
    ],
}
