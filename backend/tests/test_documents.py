import pytest
from unittest.mock import patch

def get_token(client):
    client.post("/api/auth/setup", json={"password": "pw"})
    resp = client.post("/api/auth/login", json={"password": "pw"})
    return resp.json()["access_token"]

def auth(token):
    return {"Authorization": f"Bearer {token}"}

def test_save_url_returns_document_id(client):
    token = get_token(client)
    resp = client.post("/api/documents", json={"url": "https://example.com"}, headers=auth(token))
    assert resp.status_code == 202
    data = resp.json()
    assert "id" in data
    assert data["status"] == "processing"

def test_get_document_status(client):
    token = get_token(client)
    save_resp = client.post("/api/documents", json={"url": "https://example.com"}, headers=auth(token))
    doc_id = save_resp.json()["id"]
    status_resp = client.get(f"/api/documents/{doc_id}/status", headers=auth(token))
    assert status_resp.status_code == 200
    assert "status" in status_resp.json()

def test_list_documents(client):
    token = get_token(client)
    client.post("/api/documents", json={"url": "https://example.com"}, headers=auth(token))
    resp = client.get("/api/documents", headers=auth(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_upload_pdf_returns_document_id(client):
    token = get_token(client)
    pdf_bytes = b"%PDF-1.4 fake content"
    with patch("routers.documents._ingest_uploaded_pdf"):
        resp = client.post(
            "/api/documents/upload",
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
            headers=auth(token),
        )
    assert resp.status_code == 202
    data = resp.json()
    assert "id" in data
    assert data["status"] == "processing"

def test_upload_non_pdf_non_epub_rejected(client):
    token = get_token(client)
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers=auth(token),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Only PDF and EPUB files are supported"


def test_upload_epub_returns_document_id(client):
    token = get_token(client)
    epub_bytes = b"PK fake epub content"
    with patch("routers.documents._ingest_uploaded_epub"):
        resp = client.post(
            "/api/documents/upload",
            files={"file": ("book.epub", epub_bytes, "application/epub+zip")},
            headers=auth(token),
        )
    assert resp.status_code == 202
    data = resp.json()
    assert "id" in data
    assert data["status"] == "processing"


def test_upload_epub_creates_epub_type_doc(client):
    token = get_token(client)
    epub_bytes = b"PK fake epub content"
    with patch("routers.documents._ingest_uploaded_epub"):
        resp = client.post(
            "/api/documents/upload",
            files={"file": ("book.epub", epub_bytes, "application/epub+zip")},
            headers=auth(token),
        )
    doc_id = resp.json()["id"]
    doc_resp = client.get(f"/api/documents/{doc_id}", headers=auth(token))
    assert doc_resp.json()["type"] == "epub"


def test_get_epub_file_streams_bytes(client, tmp_path, monkeypatch):
    import routers.documents as docs_module
    monkeypatch.setattr(docs_module, "STORAGE_DIR", tmp_path)
    token = get_token(client)
    epub_bytes = b"PK fake epub content"
    with patch("routers.documents._ingest_uploaded_epub"):
        resp_upload = client.post(
            "/api/documents/upload",
            files={"file": ("book.epub", epub_bytes, "application/epub+zip")},
            headers=auth(token),
        )
    doc_id = resp_upload.json()["id"]
    (tmp_path / f"{doc_id}.epub").write_bytes(epub_bytes)
    resp = client.get(f"/api/documents/{doc_id}/file", headers=auth(token))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/epub+zip"


def test_get_epub_file_doc_exists_but_file_missing_on_disk(client, tmp_path, monkeypatch):
    import routers.documents as docs_module
    monkeypatch.setattr(docs_module, "STORAGE_DIR", tmp_path)
    token = get_token(client)
    epub_bytes = b"PK fake epub content"
    with patch("routers.documents._ingest_uploaded_epub"):
        resp_upload = client.post(
            "/api/documents/upload",
            files={"file": ("book.epub", epub_bytes, "application/epub+zip")},
            headers=auth(token),
        )
    doc_id = resp_upload.json()["id"]
    # Do NOT write the file to tmp_path
    resp = client.get(f"/api/documents/{doc_id}/file", headers=auth(token))
    assert resp.status_code == 404


def test_get_pdf_file_streams_bytes(client, tmp_path, monkeypatch):
    import routers.documents as docs_module
    monkeypatch.setattr(docs_module, "STORAGE_DIR", tmp_path)
    token = get_token(client)
    pdf_bytes = b"%PDF-1.4 fake"
    with patch("routers.documents._ingest_uploaded_pdf"):
        resp_upload = client.post(
            "/api/documents/upload",
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
            headers=auth(token),
        )
    doc_id = resp_upload.json()["id"]
    (tmp_path / f"{doc_id}.pdf").write_bytes(pdf_bytes)
    resp = client.get(f"/api/documents/{doc_id}/file", headers=auth(token))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


def test_get_pdf_file_not_found(client):
    token = get_token(client)
    resp = client.get("/api/documents/nonexistent-id/file", headers=auth(token))
    assert resp.status_code == 404


def test_get_pdf_file_wrong_type(client):
    token = get_token(client)
    resp_save = client.post(
        "/api/documents",
        json={"url": "https://example.com/article", "type": "article", "html": "<p>hi</p>"},
        headers=auth(token),
    )
    doc_id = resp_save.json()["id"]
    resp = client.get(f"/api/documents/{doc_id}/file", headers=auth(token))
    assert resp.status_code == 404


def test_get_pdf_file_doc_exists_but_file_missing_on_disk(client, tmp_path, monkeypatch):
    import routers.documents as docs_module
    monkeypatch.setattr(docs_module, "STORAGE_DIR", tmp_path)
    token = get_token(client)
    pdf_bytes = b"%PDF-1.4 fake"
    with patch("routers.documents._ingest_uploaded_pdf"):
        resp_upload = client.post(
            "/api/documents/upload",
            files={"file": ("missing.pdf", pdf_bytes, "application/pdf")},
            headers=auth(token),
        )
    doc_id = resp_upload.json()["id"]
    # Do NOT write the file to tmp_path
    resp = client.get(f"/api/documents/{doc_id}/file", headers=auth(token))
    assert resp.status_code == 404


def test_get_document_returns_reading_position_fields(client):
    """GET /documents/{id} returns last_read_offset, last_read_page, last_read_at (all null by default)."""
    token = get_token(client)
    resp = client.post("/api/documents", json={"url": "https://example.com"}, headers=auth(token))
    doc_id = resp.json()["id"]
    data = client.get(f"/api/documents/{doc_id}", headers=auth(token)).json()
    assert "last_read_offset" in data
    assert "last_read_page" in data
    assert "last_read_at" in data
    assert data["last_read_offset"] is None
    assert data["last_read_page"] is None
    assert data["last_read_at"] is None


def _create_doc(client, token):
    """Helper: create a document and return its id."""
    resp = client.post("/api/documents", json={"url": "https://example.com"}, headers=auth(token))
    return resp.json()["id"]


def test_patch_document_saves_last_read_offset(client):
    token = get_token(client)
    doc_id = _create_doc(client, token)
    resp = client.patch(
        f"/api/documents/{doc_id}",
        json={"last_read_offset": 12345, "last_read_at": "2026-03-30T14:22:00Z"},
        headers=auth(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["last_read_offset"] == 12345
    assert data["last_read_at"] is not None


def test_patch_document_saves_last_read_page(client):
    token = get_token(client)
    doc_id = _create_doc(client, token)
    resp = client.patch(
        f"/api/documents/{doc_id}",
        json={"last_read_page": 7, "last_read_at": "2026-03-30T14:22:00Z"},
        headers=auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["last_read_page"] == 7


def test_patch_document_persists_to_get(client):
    """Values saved via PATCH are returned in subsequent GET."""
    token = get_token(client)
    doc_id = _create_doc(client, token)
    client.patch(
        f"/api/documents/{doc_id}",
        json={"last_read_offset": 999},
        headers=auth(token),
    )
    data = client.get(f"/api/documents/{doc_id}", headers=auth(token)).json()
    assert data["last_read_offset"] == 999


def test_patch_document_not_found(client):
    token = get_token(client)
    resp = client.patch(
        "/api/documents/nonexistent-id",
        json={"last_read_offset": 1},
        headers=auth(token),
    )
    assert resp.status_code == 404


# ── DELETE /api/documents/{doc_id} ────────────────────────────────────────────

def test_delete_document_returns_204(client):
    token = get_token(client)
    doc_id = _create_doc(client, token)
    resp = client.delete(f"/api/documents/{doc_id}", headers=auth(token))
    assert resp.status_code == 204
    assert resp.content == b""


def test_delete_document_removes_from_list(client):
    token = get_token(client)
    doc_id = _create_doc(client, token)
    client.delete(f"/api/documents/{doc_id}", headers=auth(token))
    docs = client.get("/api/documents", headers=auth(token)).json()
    assert all(d["id"] != doc_id for d in docs)


def test_delete_document_not_found(client):
    token = get_token(client)
    resp = client.delete("/api/documents/nonexistent-id", headers=auth(token))
    assert resp.status_code == 404


def test_delete_document_requires_auth(client):
    token = get_token(client)
    doc_id = _create_doc(client, token)
    resp = client.delete(f"/api/documents/{doc_id}")
    assert resp.status_code == 403


def test_delete_document_removes_storage_file(client, tmp_path, monkeypatch):
    import routers.documents as docs_module
    monkeypatch.setattr(docs_module, "STORAGE_DIR", tmp_path)
    token = get_token(client)
    pdf_bytes = b"%PDF-1.4 fake"
    with patch("routers.documents._ingest_uploaded_pdf"):
        resp_upload = client.post(
            "/api/documents/upload",
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
            headers=auth(token),
        )
    doc_id = resp_upload.json()["id"]
    storage_file = tmp_path / f"{doc_id}.pdf"
    storage_file.write_bytes(pdf_bytes)
    assert storage_file.exists()
    client.delete(f"/api/documents/{doc_id}", headers=auth(token))
    assert not storage_file.exists()
