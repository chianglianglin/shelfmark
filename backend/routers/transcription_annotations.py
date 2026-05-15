from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Literal, Optional
import uuid

from auth import get_current_user
from database import get_db
from models import TranscriptionAnnotation, Transcription

router = APIRouter(prefix="/api/transcription-annotations", tags=["transcription-annotations"])


class AnnotationCreate(BaseModel):
    transcription_id: str
    text: str
    color: Literal["yellow", "blue", "green", "pink"] = "yellow"
    note: Optional[str] = None
    position: dict


class AnnotationUpdate(BaseModel):
    note: Optional[str] = None
    color: Optional[Literal["yellow", "blue", "green", "pink"]] = None


def _serialize(ann: TranscriptionAnnotation) -> dict:
    return {
        "id": ann.id,
        "transcription_id": ann.transcription_id,
        "text": ann.text,
        "note": ann.note,
        "color": ann.color,
        "position": ann.position,
        "created_at": ann.created_at,
    }


@router.post("", status_code=201)
def create_annotation(
    body: AnnotationCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == body.transcription_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Transcription not found")
    ann = TranscriptionAnnotation(
        id=str(uuid.uuid4()),
        transcription_id=body.transcription_id,
        text=body.text,
        color=body.color,
        note=body.note,
        position=body.position,
        created_at=datetime.now(timezone.utc),
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _serialize(ann)


@router.get("")
def list_annotations(
    transcription_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    anns = (
        db.query(TranscriptionAnnotation)
        .filter(TranscriptionAnnotation.transcription_id == transcription_id)
        .order_by(TranscriptionAnnotation.created_at)
        .all()
    )
    return [_serialize(a) for a in anns]


@router.put("/{ann_id}")
def update_annotation(
    ann_id: str,
    body: AnnotationUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ann = db.query(TranscriptionAnnotation).filter(TranscriptionAnnotation.id == ann_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")
    if body.note is not None:
        ann.note = body.note
    if body.color is not None:
        ann.color = body.color
    db.commit()
    db.refresh(ann)
    return _serialize(ann)


@router.delete("/{ann_id}", status_code=204)
def delete_annotation(
    ann_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ann = db.query(TranscriptionAnnotation).filter(TranscriptionAnnotation.id == ann_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(ann)
    db.commit()
    return Response(status_code=204)
