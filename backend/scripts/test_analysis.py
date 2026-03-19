"""Test script: run analysis on a synthetic meeting transcript.

Usage:
    cd backend && uv run python scripts/test_analysis.py
"""

import asyncio
import json
import os
import sys

# Ensure backend root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from skills.sales_analyst.agent import run_analysis


# --- Synthetic meeting transcript ---
# Context: Q1 Enterprise Deal meeting with Plaud.AI
# Participants: Harold Guo (AI Agent Engineer), Pany Pan (Mobile-End Engineer),
#               Sarah Chen (Sales Director, our side)
# Current state: Prospecting, $2M, close date 2026-08-31

TRANSCRIPT = """\
Sarah Chen: Alright, thanks everyone for joining. Harold, Pany, great to finally \
meet in person here in Beijing. I know we've been going back and forth over email, \
but I think it's time to really dig into what Plaud.AI needs from us and see if \
there's a real fit here.

Harold Guo: Yeah, absolutely. So as I mentioned, we're building out our AI agent \
infrastructure, and we've been evaluating several platforms. Your enterprise offering \
caught our attention because of the scalability features.

Sarah Chen: That's great to hear. Can you walk me through your current setup and \
where you see the gaps?

Harold Guo: Sure. Right now we're running everything on our own infrastructure. \
The main pain point is around multi-tenant orchestration — we need to support \
thousands of concurrent agent sessions, and our current system starts to degrade \
around 500. We need something that can handle at least 5,000 concurrent sessions \
with sub-200ms latency.

Pany Pan: And from the mobile side, we need reliable real-time streaming. Our \
PLAUD Note device captures audio and we process it through speech-to-text, then \
feed it into the agent pipeline. The end-to-end latency is critical for our user \
experience.

Sarah Chen: I understand. Our enterprise tier is definitely built for that scale. \
We've had clients running 10,000 plus concurrent sessions. Let me ask — what's \
your timeline looking like? When do you need this in production?

Harold Guo: We're targeting end of Q2 for the initial rollout. So ideally we'd \
want to start a proof of concept within the next two weeks and have a production \
deployment by June.

Sarah Chen: That's aggressive but doable. For the POC, we can get you set up on \
a dedicated staging environment within a week. Now, regarding pricing — the \
enterprise tier starts at 2 million annually, but given the scale you're describing \
and the multi-year potential, I think we can work with that number. Would a \
three-year commitment be something Plaud would consider?

Harold Guo: We're open to a multi-year deal if the pricing makes sense. Our \
budget for this initiative is around 1.5 to 2 million per year. If we do three \
years, we'd expect a meaningful discount — maybe 15 to 20 percent.

Sarah Chen: That's reasonable. Let me put together a formal proposal with a \
three-year structure. I can probably get you to around 1.7 million per year with \
that commitment level, which brings the total to about 5.1 million.

Pany Pan: One thing that's important for us — we need a dedicated support \
engineer during the integration phase. Our mobile team is small and we can't \
afford to be stuck waiting on support tickets.

Sarah Chen: Absolutely. The enterprise tier includes a dedicated technical \
account manager. For the integration phase, we'll assign a solutions engineer \
to work directly with your team. Harold, that would be your main point of contact.

Harold Guo: Perfect. So let me summarize where we are. We want to move forward \
with the POC. Sarah, you'll send us the staging environment access this week. \
Pany, you'll coordinate with their solutions engineer on the mobile SDK integration. \
And Sarah, you'll put together the three-year proposal by... when?

Sarah Chen: I'll have the formal proposal to you by next Friday, March 28th. \
It'll include the three-year pricing, the POC timeline, and the SLA details.

Harold Guo: Great. And we should schedule a follow-up call after the POC to \
review results and discuss the contract. Let's plan for mid-April.

Sarah Chen: Sounds good. I'll send a calendar invite for April 15th. Oh, and \
one more thing — Harold, could you send me the technical requirements document \
we discussed? I want to make sure our solutions architect reviews it before the POC.

Harold Guo: Will do. I'll send it over by end of day Monday.

Pany Pan: I also want to flag — we recently promoted Harold to VP of AI Engineering, \
so he'll be the final decision maker on the technical side going forward.

Sarah Chen: Congratulations, Harold! That's great to know. Well, I think we're \
in a really good position here. Let's make this happen.

Harold Guo: Agreed. Thanks, Sarah. Talk soon.
"""

# CRM context matching the screenshots
CRM_CONTEXT = {
    "event": {
        "id": "evt_001",
        "subject": "Q1 Enterprise Deal",
        "start_time": "2026-03-19T21:00:00+08:00",
        "end_time": "2026-03-20T00:00:00+08:00",
    },
    "opportunity": {
        "id": "006FAKE_OPP_ID",
        "name": "Q1 Enterprise Deal",
        "amount": 2000000,
        "stage": "Prospecting",
        "close_date": "2026-08-31",
    },
    "account": {
        "id": "001FAKE_ACCT_ID",
        "name": "Plaud.AI",
        "annual_revenue": 2000000000,
        "industry": "Technology",
    },
    "participants": [
        {"name": "Harold Guo", "email": "harold@plaud.ai", "status": "Accepted"},
        {"name": "Pany Pan", "email": "pany@plaud.ai", "status": "Accepted"},
        {"name": "Sarah Chen", "email": "sarah@ourcompany.com", "status": "Accepted"},
    ],
}


async def main():
    print("=" * 60)
    print("Running analysis on synthetic meeting transcript...")
    print(f"Transcript length: {len(TRANSCRIPT)} chars")
    print(f"CRM context: Opportunity={CRM_CONTEXT['opportunity']['name']}, "
          f"Stage={CRM_CONTEXT['opportunity']['stage']}")
    print("=" * 60)

    result = await run_analysis(TRANSCRIPT, CRM_CONTEXT)

    print(f"\nSummary: {result.summary}")
    print(f"\nProposed changes ({len(result.proposed_changes)}):")
    print("-" * 60)

    for change in result.proposed_changes:
        action_label = "NEW" if change.action == "create" else "UPDATE"
        name = change.object_name or ""
        print(f"\n[{action_label}] {change.object_type}: {name}")
        print(f"  record_id: {change.record_id or '(new)'}")
        print(f"  approved: {change.approved}")
        for diff in change.changes:
            old = diff.old or "—"
            print(f"  {diff.label}: {old} → {diff.new}")

    # Also dump full JSON for inspection
    print("\n" + "=" * 60)
    print("Full JSON output:")
    print(json.dumps(result.model_dump(), indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
