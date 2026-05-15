from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Document, Folder, Transcription

router = APIRouter(prefix="/api/folders", tags=["folders"])


class FolderCreate(BaseModel):
    name: str
    folder_type: str  # "document" or "transcription"


class FolderRename(BaseModel):
    name: str


def _folder_count(db: Session, folder: Folder) -> int:
    if folder.folder_type == "document":
        return db.query(Document).filter(Document.folder_id == folder.id).count()
    return db.query(Transcription).filter(Transcription.folder_id == folder.id).count()


def _folder_dict(folder: Folder, count: int) -> dict:
    return {
        "id": folder.id,
        "name": folder.name,
        "folder_type": folder.folder_type,
        "count": count,
        "created_at": folder.created_at,
    }


@router.get("")
def list_folders(
    type: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if type not in ("document", "transcription"):
        raise HTTPException(status_code=400, detail="type must be 'document' or 'transcription'")
    folders = (
        db.query(Folder)
        .filter(Folder.folder_type == type)
        .order_by(Folder.created_at)
        .all()
    )
    return [_folder_dict(f, _folder_count(db, f)) for f in folders]


@router.post("", status_code=201)
def create_folder(
    body: FolderCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if body.folder_type not in ("document", "transcription"):
        raise HTTPException(status_code=400, detail="folder_type must be 'document' or 'transcription'")
    folder = Folder(
        name=body.name,
        folder_type=body.folder_type,
        created_at=datetime.now(timezone.utc),
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _folder_dict(folder, 0)


@router.patch("/{folder_id}")
def rename_folder(
    folder_id: str,
    body: FolderRename,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Not found")
    folder.name = body.name
    db.commit()
    db.refresh(folder)
    return _folder_dict(folder, _folder_count(db, folder))


@router.delete("/{folder_id}", status_code=204)
def delete_folder(
    folder_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Not found")
    # Explicitly null out references (SQLite may not enforce ON DELETE SET NULL)
    if folder.folder_type == "document":
        db.query(Document).filter(Document.folder_id == folder_id).update({"folder_id": None})
    else:
        db.query(Transcription).filter(Transcription.folder_id == folder_id).update({"folder_id": None})
    db.delete(folder)
    db.commit()
    return Response(status_code=204)
