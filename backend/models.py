import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, Boolean, DateTime, Date,
    ForeignKey, Enum, JSON, func, Float
)
from sqlalchemy.orm import relationship
from database import Base


def new_uuid():
    return str(uuid.uuid4())


class Folder(Base):
    __tablename__ = "folders"
    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    folder_type = Column(String, nullable=False)  # "document" or "transcription"
    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc))


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, default=1)
    password_hash = Column(String, nullable=False)
    setup_complete = Column(Boolean, default=False, nullable=False)


class Document(Base):
    __tablename__ = "documents"
    id = Column(String, primary_key=True, default=new_uuid)
    type = Column(Enum("article", "pdf", "epub", "youtube", "email", name="doc_type"), nullable=False)
    title = Column(Text, nullable=False)
    url = Column(Text, nullable=True)
    author = Column(Text, nullable=True)
    published_date = Column(Date, nullable=True)
    word_count = Column(Integer, nullable=True)
    content_html = Column(Text, nullable=True)
    content_text = Column(Text, nullable=True)
    status = Column(
        Enum("unread", "reading", "processing", "error", "finished", name="doc_status"),
        default="processing",
        nullable=False,
    )
    saved_at = Column(DateTime(timezone=True), nullable=False,
                      default=lambda: datetime.now(timezone.utc),
                      server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    last_read_offset = Column(Integer, nullable=True)
    last_read_page   = Column(Integer, nullable=True)
    last_read_at     = Column(DateTime(timezone=True), nullable=True)
    folder_id = Column(String, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    highlights = relationship("Highlight", back_populates="document", cascade="all, delete-orphan")
    document_tags = relationship("DocumentTag", back_populates="document", cascade="all, delete-orphan")


class Highlight(Base):
    __tablename__ = "highlights"
    id = Column(String, primary_key=True, default=new_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    text = Column(Text, nullable=False)
    note = Column(Text, nullable=True)
    color = Column(Enum("yellow", "blue", "green", "pink", name="highlight_color"), default="yellow")
    position = Column(JSON, nullable=False)  # {"type": "text_range"|"pdf_range"|"transcript_range", "start_offset": int, "end_offset": int, "page": int (pdf only)}
    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc),
                        server_default=func.now())
    synced_to_obsidian = Column(Boolean, default=False, nullable=False)
    sync_error = Column(Text, nullable=True)
    document = relationship("Document", back_populates="highlights")


class Tag(Base):
    __tablename__ = "tags"
    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, unique=True, nullable=False)


class DocumentTag(Base):
    __tablename__ = "document_tags"
    document_id = Column(String, ForeignKey("documents.id"), primary_key=True)
    tag_id = Column(String, ForeignKey("tags.id"), primary_key=True)
    document = relationship("Document", back_populates="document_tags")
    tag = relationship("Tag")


class Transcription(Base):
    __tablename__ = "transcriptions"
    id = Column(String, primary_key=True, default=new_uuid)
    title = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    language = Column(String, nullable=True)
    full_text = Column(Text, nullable=True)
    words = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="processing")
    duration_seconds = Column(Float, nullable=True)
    chapters = Column(JSON, nullable=True)
    progress = Column(Integer, default=0, nullable=False)
    share_token = Column(String, nullable=True, unique=True, index=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)
    folder_id = Column(String, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc),
                        server_default=func.now())
    annotations = relationship("TranscriptionAnnotation", cascade="all, delete-orphan")


class TranscriptionAnnotation(Base):
    __tablename__ = "transcription_annotations"
    id = Column(String, primary_key=True, default=new_uuid)
    transcription_id = Column(String, ForeignKey("transcriptions.id"), nullable=False)
    text = Column(Text, nullable=False)
    note = Column(Text, nullable=True)
    color = Column(Enum("yellow", "blue", "green", "pink", name="ta_color"), default="yellow")
    position = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc),
                        server_default=func.now())
