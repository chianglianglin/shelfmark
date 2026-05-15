from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
from auth import get_current_user
from config import load_settings, save_settings
from models import Highlight
from services.obsidian_sync import retry_unsynced

router = APIRouter(prefix="/api/settings", tags=["settings"])

class SettingsUpdate(BaseModel):
    vault_path: str

@router.get("")
def get_settings(user=Depends(get_current_user)):  # auth check
    return load_settings()

@router.put("")
def update_settings(body: SettingsUpdate, user=Depends(get_current_user)):  # auth check
    save_settings({"vault_path": body.vault_path})
    return {"vault_path": body.vault_path}

def _trigger_retry():
    db = SessionLocal()
    try:
        retry_unsynced(db)
    finally:
        db.close()

@router.post("/sync")
def trigger_sync(
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),  # auth check
):
    background_tasks.add_task(_trigger_retry)
    return {"message": "Sync started"}

@router.get("/sync-status")
def sync_status(db: Session = Depends(get_db), user=Depends(get_current_user)):  # auth check
    errored = db.query(Highlight).filter(Highlight.sync_error != None).all()
    unsynced_count = db.query(Highlight).filter(Highlight.synced_to_obsidian == False).count()
    return {
        "unsynced_count": unsynced_count,
        "errors": [{"id": h.id, "error": h.sync_error} for h in errored],
    }
