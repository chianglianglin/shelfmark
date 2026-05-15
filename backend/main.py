import asyncio
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from database import Base, engine, SessionLocal
import models  # noqa: F401 — registers ORM models with Base
from routers import auth as auth_router
from routers import documents as documents_router
from routers import highlights as highlights_router
from routers import settings as settings_router
from routers import transcription as transcription_router
from routers import transcription_annotations as transcription_annotations_router
from routers import folders as folders_router
from services.smtp_server import start_smtp_server
from services.obsidian_sync import retry_unsynced

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Readwise Reader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(documents_router.router)
app.include_router(highlights_router.router)
app.include_router(settings_router.router)
app.include_router(transcription_router.router)
app.include_router(transcription_annotations_router.router)
app.include_router(folders_router.router)

@app.get("/api/health")
def health():
    return {"status": "ok"}

_smtp_controller = None

async def _retry_loop():
    while True:
        await asyncio.sleep(60)
        db = SessionLocal()
        try:
            retry_unsynced(db)
        finally:
            db.close()

@app.on_event("startup")
def migrate_reading_position_columns():
    """Add reading-position columns to existing databases that predate this feature."""
    stmts = [
        "ALTER TABLE documents ADD COLUMN last_read_offset INTEGER",
        "ALTER TABLE documents ADD COLUMN last_read_page INTEGER",
        "ALTER TABLE documents ADD COLUMN last_read_at TIMESTAMP",
    ]
    with engine.connect() as conn:
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists — safe to ignore


@app.on_event("startup")
def startup_smtp():
    global _smtp_controller
    try:
        _smtp_controller = start_smtp_server()
    except Exception:
        logger.warning("SMTP server could not start (port 2525 may be in use). Email ingestion disabled.")

@app.on_event("startup")
async def start_retry_loop():
    asyncio.create_task(_retry_loop())

@app.on_event("startup")
def migrate_transcriptions_table():
    """Create transcriptions table on databases that predate this feature."""
    from sqlalchemy import inspect
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "transcriptions" not in inspector.get_table_names():
            Base.metadata.tables["transcriptions"].create(bind=engine)

@app.on_event("startup")
def migrate_transcription_annotations_table():
    """Create transcription_annotations table on databases that predate this feature."""
    from sqlalchemy import inspect
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "transcription_annotations" not in inspector.get_table_names():
            Base.metadata.tables["transcription_annotations"].create(bind=engine)

@app.on_event("startup")
def migrate_transcription_chapters_column():
    """Add chapters column to transcriptions table on older databases."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE transcriptions ADD COLUMN chapters JSON"))
            conn.commit()
        except Exception:
            pass  # already exists

@app.on_event("startup")
def migrate_transcription_progress_column():
    """Add progress column to transcriptions table on older databases."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE transcriptions ADD COLUMN progress INTEGER NOT NULL DEFAULT 0"))
            conn.commit()
        except Exception:
            pass  # already exists

@app.on_event("startup")
def migrate_transcription_share_columns():
    """Add share_token and share_expires_at columns to transcriptions table."""
    stmts = [
        "ALTER TABLE transcriptions ADD COLUMN share_token TEXT",
        "ALTER TABLE transcriptions ADD COLUMN share_expires_at TIMESTAMP",
    ]
    with engine.connect() as conn:
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # already exists


@app.on_event("startup")
def migrate_folders_table():
    """Create folders table and folder_id columns on databases that predate this feature."""
    from sqlalchemy import inspect
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "folders" not in inspector.get_table_names():
            Base.metadata.tables["folders"].create(bind=engine)
        for stmt in [
            "ALTER TABLE documents ADD COLUMN folder_id TEXT REFERENCES folders(id)",
            "ALTER TABLE transcriptions ADD COLUMN folder_id TEXT REFERENCES folders(id)",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists


@app.on_event("shutdown")
def shutdown_smtp():
    if _smtp_controller:
        _smtp_controller.stop()
