MEETINGS = {
    "m1": {
        "id": "m1",
        "title": "Client Meeting",
        "date": "October 30, 2025",
        "time_start": "10:00 AM",
        "time_end": "11:00 AM",
        "location": "Zoom - Meeting Room A",
        "account": {"name": "Acme Corporation", "sector": "Technology", "deal_id": "d1"},
        "opportunity": {
            "name": "Enterprise Deal",
            "amount": "$120,000",
            "stage": "Negotiation",
        },
        "attendees": [
            {"id": "a1", "name": "Sarah Chen", "title": "VP of Engineering", "company": "Acme Corp"},
            {"id": "a2", "name": "Michael Park", "title": "CTO", "company": "Acme Corp"},
            {"id": "a3", "name": "You", "title": "Account Executive", "company": "PLAUD"},
        ],
        "feedback": "Prepare pricing proposal and technical architecture overview",
        "linked_files": [
            {"id": "f1", "title": "Discovery Call Recording", "duration": "45m"},
            {"id": "f2", "title": "Technical Review Notes", "duration": "1h 12m"},
        ],
    },
    "m2": {
        "id": "m2",
        "title": "Product Demo",
        "date": "October 30, 2025",
        "time_start": "2:00 PM",
        "time_end": "3:30 PM",
        "location": "Google Meet",
        "account": {"name": "TechStart Inc", "sector": "SaaS"},
        "opportunity": {
            "name": "Pilot Program",
            "amount": "$45,000",
            "stage": "Discovery",
        },
        "attendees": [
            {"id": "a4", "name": "James Liu", "title": "Head of Sales", "company": "TechStart"},
            {"id": "a5", "name": "Anna Kim", "title": "Sales Manager", "company": "TechStart"},
        ],
        "feedback": "",
        "linked_files": [],
    },
    "m3": {
        "id": "m3",
        "title": "Follow-up Call",
        "date": "October 31, 2025",
        "time_start": "9:00 AM",
        "time_end": "10:00 AM",
        "location": "Phone Call",
        "account": {"name": "DataFlow Systems", "sector": "Data Analytics"},
        "opportunity": {
            "name": "Annual Renewal",
            "amount": "$78,000",
            "stage": "Renewal",
        },
        "attendees": [
            {"id": "a6", "name": "David Brown", "title": "IT Director", "company": "DataFlow"},
        ],
        "feedback": "Review usage metrics and discuss expansion",
        "linked_files": [
            {"id": "f3", "title": "Q3 Business Review", "duration": "38m"},
        ],
    },
}

TRANSCRIPT_LINES = [
    {"speaker": "Sarah Chen", "text": "Thanks for joining today. I wanted to discuss the enterprise rollout timeline.", "timestamp": "00:00"},
    {"speaker": "You", "text": "Absolutely. Based on our technical review, I've prepared a phased approach.", "timestamp": "00:12"},
    {"speaker": "Michael Park", "text": "That sounds good. What does the first phase look like?", "timestamp": "00:25"},
    {"speaker": "You", "text": "Phase one covers the core integration with your existing CRM. We're looking at about 3 weeks for setup and testing.", "timestamp": "00:38"},
    {"speaker": "Sarah Chen", "text": "And the pricing structure you mentioned - is that per user or per seat?", "timestamp": "00:55"},
    {"speaker": "You", "text": "It's per seat with volume discounts. For 50+ users, we offer a 20% discount on the annual plan.", "timestamp": "01:08"},
    {"speaker": "Michael Park", "text": "We'd need to get procurement involved for anything over $100K.", "timestamp": "01:25"},
    {"speaker": "You", "text": "Understood. I can prepare a detailed proposal with all the technical specs for your procurement team.", "timestamp": "01:40"},
    {"speaker": "Sarah Chen", "text": "That would be great. Can you also include the security compliance documentation?", "timestamp": "01:55"},
    {"speaker": "You", "text": "Of course. We have SOC 2 Type II and GDPR compliance reports ready to share.", "timestamp": "02:10"},
    {"speaker": "Michael Park", "text": "One more thing - what about data migration from our current system?", "timestamp": "02:28"},
    {"speaker": "You", "text": "We provide a dedicated migration specialist. Most clients are fully migrated within 2 weeks.", "timestamp": "02:42"},
    {"speaker": "Sarah Chen", "text": "Excellent. Let's plan to reconvene next week with the procurement team.", "timestamp": "03:00"},
    {"speaker": "You", "text": "Perfect. I'll send over the proposal and schedule a follow-up. Thank you both!", "timestamp": "03:15"},
]
