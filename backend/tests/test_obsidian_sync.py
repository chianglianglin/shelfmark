import os
import tempfile
from services.obsidian_sync import sanitize_filename, write_summary_note, write_atomic_note

def test_sanitize_filename_removes_illegal_chars():
    assert sanitize_filename('Hello: World?') == 'Hello- World-'

def test_sanitize_filename_caps_length():
    long_name = "a" * 150
    assert len(sanitize_filename(long_name)) <= 100

def test_write_summary_note_creates_file():
    with tempfile.TemporaryDirectory() as vault:
        doc = {
            "id": "doc1",
            "title": "Test Article",
            "url": "https://example.com",
            "type": "article",
            "author": "Jane",
            "published_date": None,
            "saved_at": "2026-03-20",
        }
        highlights = [{
            "text": "Key insight",
            "color": "yellow",
            "note": "Important",
        }]
        write_summary_note(vault, doc, highlights)
        path = os.path.join(vault, "readwise", "articles", "Test Article.md")
        assert os.path.exists(path)
        content = open(path).read()
        assert "Key insight" in content
        assert "Important" in content

def test_write_atomic_note_creates_file():
    with tempfile.TemporaryDirectory() as vault:
        write_atomic_note(vault, {
            "id": "hl1",
            "text": "A great quote",
            "color": "blue",
            "note": "My thought",
            "created_at": "2026-03-20",
            "document_title": "Test Article",
        })
        path = os.path.join(vault, "readwise", "highlights", "hl1.md")
        assert os.path.exists(path)
        content = open(path).read()
        assert "A great quote" in content
