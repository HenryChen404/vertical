"""Sales analyst skill — analyzes meeting transcripts and proposes CRM changes."""

from skills.sales_analyst.agent import chat_review, run_analysis
from skills.sales_analyst.schemas import AnalysisResult, FieldDiff, ProposedChange

__all__ = [
    "run_analysis",
    "chat_review",
    "AnalysisResult",
    "ProposedChange",
    "FieldDiff",
]
