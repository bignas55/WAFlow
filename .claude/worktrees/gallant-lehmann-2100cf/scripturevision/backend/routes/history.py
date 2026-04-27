from fastapi import APIRouter, HTTPException
from services.storage_service import get_history, get_content

router = APIRouter()

@router.get("/history")
async def fetch_history():
    return get_history()

@router.get("/content/{gen_id}")
async def fetch_content(gen_id: str):
    content = get_content(gen_id)
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    return content
