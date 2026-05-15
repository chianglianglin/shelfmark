import logging
import os
import secrets
import threading
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel as _BaseModel
from typing import List as _List, Optional as _Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
import uuid

from auth import get_current_user
from database import SessionLocal, get_db
from models import Transcription

router = APIRouter(prefix="/api/transcriptions", tags=["transcriptions"])
logger = logging.getLogger(__name__)

STORAGE_DIR = Path(__file__).parent.parent / "storage"

SUPPORTED_EXTENSIONS = {".mp3", ".mp4", ".wav", ".m4a", ".webm", ".ogg"}

AUDIO_MIME_TYPES = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
}

# Lazy-loaded Whisper model — imported and loaded only on first transcription request
_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        import whisper as _whisper
        model_name = os.environ.get("WHISPER_MODEL", "base")
        _whisper_model = _whisper.load_model(model_name)
    return _whisper_model


def _get_audio_duration(audio_path: str) -> float | None:
    """Return audio duration in seconds using mutagen, or None if unavailable."""
    try:
        import mutagen
        info = mutagen.File(audio_path)
        if info and hasattr(info, "info") and hasattr(info.info, "length"):
            return info.info.length
    except Exception:
        pass
    return None


async def _transcribe(trans_id: str, audio_path: str, db_factory):
    db = db_factory()
    stop_event = threading.Event()
    model_ready = threading.Event()

    def _set_progress(pct: int):
        db2 = db_factory()
        try:
            t = db2.query(Transcription).filter(Transcription.id == trans_id).first()
            if t and t.status == "processing":
                t.progress = pct
                db2.commit()
        except Exception:
            pass
        finally:
            db2.close()

    def _progress_thread(total_dur: float | None):
        # Phase 1 — model loading: hold at 5 %
        _set_progress(5)
        model_ready.wait(timeout=180)
        if stop_event.is_set():
            return
        # Phase 2 — transcribing: scale linearly from 10 → 95 over expected duration
        if total_dur and total_dur > 0:
            # Whisper runs at roughly 3× realtime on CPU (faster on GPU)
            expected = total_dur / 3.0
            t0 = time.time()
            while not stop_event.wait(timeout=2):
                elapsed = time.time() - t0
                pct = min(95, int(elapsed / expected * 85) + 10)
                _set_progress(pct)
        else:
            # No duration info — park at 50 % to show activity
            _set_progress(50)

    total_duration = await run_in_threadpool(_get_audio_duration, audio_path)
    pt = threading.Thread(
        target=_progress_thread, args=(total_duration,), daemon=True
    )
    pt.start()

    try:
        model = await run_in_threadpool(_get_whisper_model)
        model_ready.set()
        result = await run_in_threadpool(
            lambda: model.transcribe(audio_path, word_timestamps=True)
        )
        stop_event.set()

        words = []
        for segment in result.get("segments", []):
            for w in segment.get("words", []):
                words.append({"word": w["word"], "start": w["start"], "end": w["end"]})
        segments = result.get("segments", [])
        duration = segments[-1]["end"] if segments else None
        trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
        if trans:
            trans.status = "done"
            trans.progress = 100
            trans.full_text = result["text"]
            trans.language = result.get("language")
            trans.duration_seconds = duration
            trans.words = words
            # Auto-detect chapters from silence gaps > 3.0 seconds
            chapters = [{"id": str(uuid.uuid4()), "title": "Chapter 1", "start_time": 0.0, "word_index": 0}]
            for i in range(len(words) - 1):
                gap = words[i + 1]["start"] - words[i]["end"]
                if gap > 3.0:
                    chapters.append({
                        "id": str(uuid.uuid4()),
                        "title": f"Chapter {len(chapters) + 1}",
                        "start_time": words[i + 1]["start"],
                        "word_index": i + 1,
                    })
            trans.chapters = chapters
            db.commit()
    except Exception as exc:
        stop_event.set()
        logger.exception("Whisper transcription failed for %s", trans_id)
        db.rollback()
        trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
        if trans:
            trans.status = "error"
            trans.progress = 0
            trans.full_text = str(exc)
            db.commit()
    finally:
        db.close()


@router.post("/upload", status_code=202)
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )
    audio_bytes = await file.read()
    title = Path(filename).stem
    trans_id = str(uuid.uuid4())
    trans = Transcription(
        id=trans_id,
        title=title,
        filename=filename,
        status="processing",
        created_at=datetime.now(timezone.utc),
    )
    db.add(trans)
    db.commit()
    db.refresh(trans)

    # Save audio file to storage
    try:
        STORAGE_DIR.mkdir(exist_ok=True)
        (STORAGE_DIR / f"{trans_id}{ext}").write_bytes(audio_bytes)
    except Exception:
        logger.warning("Could not save audio file for transcription %s", trans_id)

    audio_path = str(STORAGE_DIR / f"{trans_id}{ext}")
    background_tasks.add_task(_transcribe, trans_id, audio_path, SessionLocal)
    return {"id": trans.id, "title": trans.title, "status": trans.status, "created_at": trans.created_at}


@router.get("")
def list_transcriptions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    records = db.query(Transcription).order_by(Transcription.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "filename": t.filename,
            "status": t.status,
            "language": t.language,
            "duration_seconds": t.duration_seconds,
            "created_at": t.created_at,
            "folder_id": t.folder_id,
        }
        for t in records
    ]


@router.get("/{trans_id}/audio")
def get_audio(
    trans_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found")
    ext = Path(trans.filename).suffix.lower()
    path = STORAGE_DIR / f"{trans_id}{ext}"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not available")
    media_type = AUDIO_MIME_TYPES.get(ext, "application/octet-stream")
    return FileResponse(str(path), media_type=media_type)


def _is_expired(expires_at) -> bool:
    """Compare expiry datetime against now, handling naive/aware mismatch from SQLite."""
    if expires_at is None:
        return False
    now = datetime.now(timezone.utc)
    # SQLite may return a naive datetime; treat it as UTC
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at < now


@router.get("/shared/{token}")
def get_shared_transcription(token: str, db: Session = Depends(get_db)):
    """Public endpoint — no auth required."""
    trans = db.query(Transcription).filter(Transcription.share_token == token).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found or expired")
    if _is_expired(trans.share_expires_at):
        raise HTTPException(status_code=404, detail="Share link has expired")
    return {
        "id": trans.id,
        "title": trans.title,
        "full_text": trans.full_text,
        "words": trans.words,
        "duration_seconds": trans.duration_seconds,
        "chapters": trans.chapters,
        "language": trans.language,
        "status": trans.status,
        "share_expires_at": trans.share_expires_at.isoformat() if trans.share_expires_at else None,
    }


@router.get("/shared/{token}/audio")
def get_shared_audio(token: str, db: Session = Depends(get_db)):
    """Public endpoint — no auth required."""
    trans = db.query(Transcription).filter(Transcription.share_token == token).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found or expired")
    if _is_expired(trans.share_expires_at):
        raise HTTPException(status_code=404, detail="Share link has expired")
    ext = Path(trans.filename).suffix.lower()
    path = STORAGE_DIR / f"{trans.id}{ext}"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not available")
    media_type = AUDIO_MIME_TYPES.get(ext, "application/octet-stream")
    return FileResponse(str(path), media_type=media_type)


@router.post("/{trans_id}/share")
def create_share_link(
    trans_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found")
    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    trans.share_token = token
    trans.share_expires_at = expires_at
    db.commit()
    return {
        "share_url": f"/shared/{token}",
        "expires_at": expires_at.isoformat(),
    }


@router.delete("/{trans_id}/share", status_code=204)
def revoke_share_link(
    trans_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found")
    trans.share_token = None
    trans.share_expires_at = None
    db.commit()
    return Response(status_code=204)


@router.get("/{trans_id}")
def get_transcription(
    trans_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": trans.id,
        "title": trans.title,
        "filename": trans.filename,
        "status": trans.status,
        "progress": trans.progress,
        "language": trans.language,
        "full_text": trans.full_text,
        "words": trans.words,
        "duration_seconds": trans.duration_seconds,
        "created_at": trans.created_at,
        "chapters": trans.chapters,
        "share_token": trans.share_token,
        "share_expires_at": trans.share_expires_at.isoformat() if trans.share_expires_at else None,
    }


@router.delete("/{trans_id}", status_code=204)
def delete_transcription(
    trans_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found")
    ext = Path(trans.filename).suffix.lower()
    db.delete(trans)
    db.commit()
    try:
        (STORAGE_DIR / f"{trans_id}{ext}").unlink(missing_ok=True)
    except Exception:
        logger.warning("Could not remove audio file %s%s", trans_id, ext)
    return Response(status_code=204)


class FolderMove(_BaseModel):
    folder_id: _Optional[str] = None


@router.patch("/{trans_id}/folder")
def move_transcription_folder(
    trans_id: str,
    body: FolderMove,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found")
    trans.folder_id = body.folder_id
    db.commit()
    return {"id": trans.id, "folder_id": trans.folder_id}


class ChapterItem(_BaseModel):
    id: str
    title: str
    start_time: float
    word_index: int

class ChaptersUpdate(_BaseModel):
    chapters: _List[ChapterItem]


@router.patch("/{trans_id}/chapters")
def update_chapters(
    trans_id: str,
    body: ChaptersUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trans = db.query(Transcription).filter(Transcription.id == trans_id).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Not found")
    trans.chapters = [c.dict() for c in body.chapters]
    db.commit()
    db.refresh(trans)
    return {
        "id": trans.id,
        "chapters": trans.chapters,
    }
