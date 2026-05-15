import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import uuid
from datetime import datetime, timezone
from database import get_db, SessionLocal
from models import Document, Highlight
from auth import get_current_user
from services.ingestion import dispatch_ingestion
from services.ingestion.pdf import ingest_pdf
from services.ingestion.epub import ingest_epub

router = APIRouter(prefix="/api/documents", tags=["documents"])

logger = logging.getLogger(__name__)

STORAGE_DIR = Path(__file__).parent.parent / "storage"

class SaveRequest(BaseModel):
    url: Optional[str] = None
    html: Optional[str] = None
    type: Optional[str] = None


class DocumentUpdate(BaseModel):
    last_read_offset: Optional[int] = None
    last_read_page:   Optional[int] = None
    last_read_at:     Optional[datetime] = None

async def _ingest_uploaded_pdf(doc_id: str, pdf_bytes: bytes, filename: str, db_factory):
    db = db_factory()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return
        result = ingest_pdf(url=filename, pdf_bytes=pdf_bytes)
        for key, val in result.items():
            if hasattr(doc, key) and val is not None:
                setattr(doc, key, val)
        doc.status = "unread"
        db.commit()
    except Exception:
        logger.exception("PDF upload ingestion failed for doc %s", doc_id)
        db.rollback()
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.status = "error"
            db.commit()
        return
    finally:
        db.close()

    # File write is outside the ingestion try/except — failure is non-fatal
    try:
        STORAGE_DIR.mkdir(exist_ok=True)
        (STORAGE_DIR / f"{doc_id}.pdf").write_bytes(pdf_bytes)
    except Exception:
        logger.warning("Could not save PDF file for doc %s", doc_id)

async def _ingest_uploaded_epub(doc_id: str, epub_bytes: bytes, filename: str, db_factory):
    db = db_factory()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return
        result = ingest_epub(epub_bytes=epub_bytes, filename=filename)
        for key, val in result.items():
            if hasattr(doc, key) and val is not None:
                setattr(doc, key, val)
        print(f"EPUB ingested: html={len(doc.content_html or '')} chars, text={len(doc.content_text or '')} chars")
        doc.status = "unread"
        db.commit()
    except Exception:
        logger.exception("EPUB upload ingestion failed for doc %s", doc_id)
        db.rollback()
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.status = "error"
            db.commit()
        return
    finally:
        db.close()

    # File write is outside the ingestion try/except — failure is non-fatal
    try:
        STORAGE_DIR.mkdir(exist_ok=True)
        (STORAGE_DIR / f"{doc_id}.epub").write_bytes(epub_bytes)
    except Exception:
        logger.warning("Could not save EPUB file for doc %s", doc_id)


@router.post("/upload", status_code=202)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    filename = (file.filename or "").lower()
    if filename.endswith(".pdf"):
        doc_type = "pdf"
    elif filename.endswith(".epub"):
        doc_type = "epub"
    else:
        raise HTTPException(status_code=400, detail="Only PDF and EPUB files are supported")
    file_bytes = await file.read()
    doc = Document(
        id=str(uuid.uuid4()),
        type=doc_type,
        title=file.filename or f"upload.{doc_type}",
        url=None,
        status="processing",
        saved_at=datetime.now(timezone.utc),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    if doc_type == "pdf":
        background_tasks.add_task(_ingest_uploaded_pdf, doc.id, file_bytes, file.filename or "upload.pdf", SessionLocal)
    elif doc_type == "epub":
        background_tasks.add_task(_ingest_uploaded_epub, doc.id, file_bytes, file.filename or "upload.epub", SessionLocal)
    return {"id": doc.id, "status": doc.status}

@router.post("", status_code=202)
async def save_document(
    body: SaveRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    doc_type = body.type or _detect_type(body.url)
    doc = Document(
        id=str(uuid.uuid4()),
        type=doc_type,
        title=body.url or "Untitled",
        url=body.url,
        status="processing",
        saved_at=datetime.now(timezone.utc),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    background_tasks.add_task(dispatch_ingestion, doc.id, SessionLocal)
    return {"id": doc.id, "status": doc.status}

@router.get("")
def list_documents(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Document).order_by(Document.saved_at.desc()).all()

@router.get("/{doc_id}/status")
def get_status(doc_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": doc.status, "error": None if doc.status != "error" else "Ingestion failed"}

@router.get("/{doc_id}/highlights")
def get_highlights(doc_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Highlight).filter(Highlight.document_id == doc_id).all()

@router.get("/{doc_id}/file")
def get_pdf_file(
    doc_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if doc and doc.type == "pdf":
        path = STORAGE_DIR / f"{doc.id}.pdf"
        media_type = "application/pdf"
    elif doc and doc.type == "epub":
        path = STORAGE_DIR / f"{doc.id}.epub"
        media_type = "application/epub+zip"
    else:
        raise HTTPException(status_code=404, detail="Not found")
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not available")
    return FileResponse(str(path), media_type=media_type, filename=doc.title)


@router.patch("/{doc_id}")
def patch_document(
    doc_id: str,
    update: DocumentUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)
    return doc


class FolderMove(BaseModel):
    folder_id: Optional[str] = None


@router.patch("/{doc_id}/folder")
def move_document_folder(
    doc_id: str,
    body: FolderMove,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.folder_id = body.folder_id
    db.commit()
    return {"id": doc.id, "folder_id": doc.folder_id}


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(doc)
    db.commit()
    for ext in ("pdf", "epub"):
        try:
            (STORAGE_DIR / f"{doc_id}.{ext}").unlink(missing_ok=True)
        except Exception:
            logger.warning("Could not remove storage file %s.%s", doc_id, ext)
    return None


@router.get("/{doc_id}")
def get_document(doc_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc

def _detect_type(url: str) -> str:
    if not url:
        return "article"
    if "youtube.com/watch" in url or "youtu.be/" in url:
        return "youtube"
    if url.lower().endswith(".pdf"):
        return "pdf"
    return "article"
