import os
import re
from sqlalchemy.orm import Session
from models import Highlight, Document
from config import load_settings

ILLEGAL_CHARS = re.compile(r'[\\/:*?"<>|]')

def sanitize_filename(name: str) -> str:
    sanitized = ILLEGAL_CHARS.sub("-", name).strip()
    return sanitized[:100]

def write_summary_note(vault_path: str, doc: dict, highlights: list):
    folder = os.path.join(vault_path, "readwise", "articles")
    os.makedirs(folder, exist_ok=True)
    filename = sanitize_filename(doc["title"]) + ".md"
    path = os.path.join(folder, filename)
    lines = [
        "---",
        f'source: {doc.get("url", "")}',
        f'type: {doc.get("type", "article")}',
        f'author: {doc.get("author", "")}',
        f'published: {doc.get("published_date", "")}',
        f'saved: {str(doc.get("saved_at", ""))[:10]}',
        "---",
        "",
        "## Highlights",
        "",
    ]
    for hl in highlights:
        lines.append(f'- "{hl["text"]}" #{hl["color"]}')
        if hl.get("note"):
            lines.append(f'  > {hl["note"]}')
        lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def write_atomic_note(vault_path: str, hl: dict):
    folder = os.path.join(vault_path, "readwise", "highlights")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{hl["id"]}.md')
    lines = [
        "---",
        f'document: "[[{hl.get("document_title", "")}]]"',
        f'created: {str(hl.get("created_at", ""))[:10]}',
        f'color: {hl.get("color", "yellow")}',
        "---",
        "",
        f'"{hl["text"]}"',
    ]
    if hl.get("note"):
        lines += ["", f'> {hl["note"]}']
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def sync_highlight(hl_id: str, db: Session):
    settings = load_settings()
    vault_path = settings.get("vault_path", "")
    if not vault_path:
        return  # not configured yet

    hl = db.query(Highlight).filter(Highlight.id == hl_id).first()
    if not hl:
        return
    doc = db.query(Document).filter(Document.id == hl.document_id).first()
    if not doc:
        hl.sync_error = "Parent document not found"
        db.commit()
        return

    hl_dict = {
        "id": hl.id,
        "text": hl.text,
        "color": hl.color,
        "note": hl.note,
        "created_at": str(hl.created_at),
        "document_title": doc.title,
    }
    doc_dict = {
        "id": doc.id,
        "title": doc.title,
        "url": doc.url,
        "type": doc.type,
        "author": doc.author,
        "published_date": str(doc.published_date) if doc.published_date else "",
        "saved_at": str(doc.saved_at),
    }

    all_highlights = [
        {"text": h.text, "color": h.color, "note": h.note}
        for h in db.query(Highlight).filter(Highlight.document_id == hl.document_id).all()
    ]

    try:
        write_atomic_note(vault_path, hl_dict)
        write_summary_note(vault_path, doc_dict, all_highlights)
        hl.synced_to_obsidian = True
        hl.sync_error = None
        db.commit()
    except Exception as e:
        hl.synced_to_obsidian = False
        hl.sync_error = str(e)
        db.commit()
        raise

def retry_unsynced(db: Session):
    unsynced = db.query(Highlight).filter(Highlight.synced_to_obsidian == False).all()
    for hl in unsynced:
        try:
            sync_highlight(hl.id, db)
        except Exception:
            pass
