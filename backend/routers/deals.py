from fastapi import APIRouter, HTTPException
from models.schemas import Deal
from mock_data.deals import DEALS

router = APIRouter()


@router.get("/deals/{deal_id}", response_model=Deal)
def get_deal(deal_id: str):
    deal = DEALS.get(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal
