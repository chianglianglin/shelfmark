from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Literal, Optional
import uuid
from database import get_db
from models import Highlight, Document
from auth import get_current_user

router = APIRouter(prefix="/api/highlights", tags=["highlights"])

def _try_sync(hl_id: str):
    from database import get_db
    db = next(get_db())
    try:
        from services.obsidian_sync import sync_highlight
        sync_highlight(hl_id, db)
    except Exception:
        pass
    finally:
        db.close()


class HighlightCreate(BaseModel):
    document_id: str
    text: str
    color: Literal["yellow", "blue", "green", "pink"] = "yellow"
    note: Optional[str] = None
    position: dict

class HighlightUpdate(BaseModel):
    note: Optional[str] = None
    color: Optional[Literal["yellow", "blue", "green", "pink"]] = None

@router.post("", status_code=201)
def create_highlight(
    body: HighlightCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),  # auth check — single-user app, no ownership filter needed
):
    doc = db.query(Document).filter(Document.id == body.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    hl = Highlight(
        id=str(uuid.uuid4()),
        document_id=body.document_id,
        text=body.text,
        color=body.color,
        note=body.note,
        position=body.position,
        synced_to_obsidian=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(hl)
    db.commit()
    db.refresh(hl)
    background_tasks.add_task(_try_sync, hl.id)
    return hl

@router.put("/{hl_id}")
def update_highlight(
    hl_id: str,
    body: HighlightUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),  # auth check — single-user app, no ownership filter needed
):
    hl = db.query(Highlight).filter(Highlight.id == hl_id).first()
    if not hl:
        raise HTTPException(status_code=404, detail="Not found")
    if body.note is not None:
        hl.note = body.note
    if body.color is not None:
        hl.color = body.color
    hl.synced_to_obsidian = False  # re-sync on edit
    db.commit()
    db.refresh(hl)
    background_tasks.add_task(_try_sync, hl.id)
    return hl

@router.delete("/{hl_id}", status_code=204)
def delete_highlight(
    hl_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),  # auth check — single-user app, no ownership filter needed
):
    hl = db.query(Highlight).filter(Highlight.id == hl_id).first()
    if not hl:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(hl)
    db.commit()
    return Response(status_code=204)
