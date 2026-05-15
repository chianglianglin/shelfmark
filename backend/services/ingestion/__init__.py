import asyncio
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
from models import Document
from services.ingestion.article import ingest_article
from services.ingestion.youtube import ingest_youtube
from services.ingestion.pdf import ingest_pdf
from services.ingestion.epub import ingest_epub

async def dispatch_ingestion(doc_id: str, db_factory):
    db: Session = db_factory()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return
        if doc.type == "article":
            result = ingest_article(doc.url, html=None)
        elif doc.type == "youtube":
            result = ingest_youtube(doc.url)
        elif doc.type == "pdf":
            result = ingest_pdf(doc.url)
        else:
            result = {"title": doc.url, "content_html": "", "content_text": ""}
        for key, val in result.items():
            if hasattr(doc, key) and val is not None:
                setattr(doc, key, val)
        doc.status = "unread"
        db.commit()
    except Exception:
        logger.exception("Ingestion failed for doc %s", doc_id)
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.status = "error"
            db.commit()
    finally:
        db.close()
