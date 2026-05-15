import asyncio
import logging
from aiosmtpd.controller import Controller
from aiosmtpd.handlers import AsyncMessage
from database import SessionLocal
from models import Document
import uuid

logger = logging.getLogger(__name__)

class ReadwiseHandler(AsyncMessage):
    async def handle_message(self, message):
        try:
            from services.ingestion.email import ingest_email
            raw = message.as_bytes()
            result = ingest_email(raw)
            db = SessionLocal()
            try:
                doc = Document(
                    id=str(uuid.uuid4()),
                    type="email",
                    title=result["title"],
                    author=result.get("author"),
                    content_html=result.get("content_html", ""),
                    content_text=result.get("content_text", ""),
                    word_count=result.get("word_count"),
                    status="unread",
                )
                db.add(doc)
                db.commit()
            finally:
                db.close()
        except Exception:
            logger.exception("Failed to process incoming email")

def start_smtp_server():
    handler = ReadwiseHandler()
    controller = Controller(handler, hostname="127.0.0.1", port=2525)
    controller.start()
    return controller
