UNSYNCED_RECORDINGS = [
    {
        "id": "ur1",
        "title": "Client Meeting - Acme Corp",
        "date": "10:00 AM",
        "duration": "45 min",
        "selected": False,
        "crm_tags": [
            {"label": "Acme Corp", "type": "account"},
            {"label": "Q1 Enterprise", "type": "opportunity"},
        ],
    },
    {
        "id": "ur2",
        "title": "Discovery Call - TechStart",
        "date": "2:00 PM",
        "duration": "30 min",
        "selected": True,
        "crm_tags": [
            {"label": "TechStart Inc", "type": "account"},
            {"label": "Q1 Expansion", "type": "opportunity"},
        ],
    },
    {
        "id": "ur3",
        "title": "Follow-up: DataFlow Systems",
        "date": "3:00 PM",
        "duration": "45 min",
        "selected": False,
        "crm_tags": [
            {"label": "DataFlow Systems", "type": "account"},
        ],
    },
    {
        "id": "ur4",
        "title": "Internal Review: Q4 Pipeline",
        "date": "11:00 AM",
        "duration": "30 min",
        "selected": False,
        "crm_tags": [],
    },
    {
        "id": "ur5",
        "title": "Discovery Call: NewCo",
        "date": "9:00 AM",
        "duration": "55 min",
        "selected": False,
        "crm_tags": [
            {"label": "NewCo", "type": "account"},
            {"label": "NewCo Deal", "type": "opportunity"},
        ],
    },
]

CRM_PROPOSAL = {
    "session_id": "session_001",
    "recording_title": "Discovery Call - TechStart",
    "sections": [
        {
            "category": "Opportunity",
            "name": "Q1 Deal",
            "fields": [
                {"field": "Stage", "old_value": "Discovery", "new_value": "Negotiation"},
                {"field": "Amount", "old_value": "$200,000", "new_value": "$350,000"},
                {"field": "Next Step", "old_value": "(empty)", "new_value": "Send proposal by Friday"},
            ],
            "confirmed": False,
        },
        {
            "category": "Account",
            "name": "TechStart Inc",
            "fields": [
                {"field": "Industry", "old_value": "Technology", "new_value": "SaaS"},
            ],
            "confirmed": False,
        },
        {
            "category": "Contact",
            "name": "Mike Johnson",
            "fields": [
                {"field": "Email", "old_value": "old@tech.com", "new_value": "mike@techstart.com"},
            ],
            "confirmed": False,
        },
    ],
}
