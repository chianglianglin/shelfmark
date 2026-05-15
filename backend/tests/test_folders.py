"""Tests for the folder system — folder CRUD and moving documents/transcriptions."""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app

TEST_DB_URL = "sqlite://"


def make_client():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    client = TestClient(app)
    return client, engine


def get_token(client):
    client.post("/api/auth/setup", json={"password": "pw"})
    resp = client.post("/api/auth/login", json={"password": "pw"})
    return resp.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def teardown(engine):
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


# ── Folder CRUD ───────────────────────────────────────────────────────────────

def test_list_folders_empty():
    client, engine = make_client()
    token = get_token(client)
    resp = client.get("/api/folders?type=document", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json() == []
    teardown(engine)


def test_create_folder_document():
    client, engine = make_client()
    token = get_token(client)
    resp = client.post("/api/folders", json={"name": "Work", "folder_type": "document"}, headers=auth(token))
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Work"
    assert data["folder_type"] == "document"
    assert data["count"] == 0
    assert "id" in data
    teardown(engine)


def test_create_folder_transcription():
    client, engine = make_client()
    token = get_token(client)
    resp = client.post("/api/folders", json={"name": "Interviews", "folder_type": "transcription"}, headers=auth(token))
    assert resp.status_code == 201
    assert resp.json()["folder_type"] == "transcription"
    teardown(engine)


def test_create_folder_invalid_type():
    client, engine = make_client()
    token = get_token(client)
    resp = client.post("/api/folders", json={"name": "Bad", "folder_type": "other"}, headers=auth(token))
    assert resp.status_code == 400
    teardown(engine)


def test_list_folders_returns_only_matching_type():
    client, engine = make_client()
    token = get_token(client)
    client.post("/api/folders", json={"name": "DocFolder", "folder_type": "document"}, headers=auth(token))
    client.post("/api/folders", json={"name": "TransFolder", "folder_type": "transcription"}, headers=auth(token))
    doc_resp = client.get("/api/folders?type=document", headers=auth(token))
    trans_resp = client.get("/api/folders?type=transcription", headers=auth(token))
    doc_folders = doc_resp.json()
    trans_folders = trans_resp.json()
    assert len(doc_folders) == 1
    assert doc_folders[0]["name"] == "DocFolder"
    assert len(trans_folders) == 1
    assert trans_folders[0]["name"] == "TransFolder"
    teardown(engine)


def test_rename_folder():
    client, engine = make_client()
    token = get_token(client)
    create_resp = client.post("/api/folders", json={"name": "Old Name", "folder_type": "document"}, headers=auth(token))
    folder_id = create_resp.json()["id"]
    rename_resp = client.patch(f"/api/folders/{folder_id}", json={"name": "New Name"}, headers=auth(token))
    assert rename_resp.status_code == 200
    assert rename_resp.json()["name"] == "New Name"
    teardown(engine)


def test_rename_folder_404():
    client, engine = make_client()
    token = get_token(client)
    resp = client.patch("/api/folders/nonexistent", json={"name": "X"}, headers=auth(token))
    assert resp.status_code == 404
    teardown(engine)


def test_delete_folder():
    client, engine = make_client()
    token = get_token(client)
    create_resp = client.post("/api/folders", json={"name": "ToDelete", "folder_type": "document"}, headers=auth(token))
    folder_id = create_resp.json()["id"]
    del_resp = client.delete(f"/api/folders/{folder_id}", headers=auth(token))
    assert del_resp.status_code == 204
    list_resp = client.get("/api/folders?type=document", headers=auth(token))
    assert list_resp.json() == []
    teardown(engine)


def test_delete_folder_404():
    client, engine = make_client()
    token = get_token(client)
    resp = client.delete("/api/folders/nonexistent", headers=auth(token))
    assert resp.status_code == 404
    teardown(engine)


# ── Move document to folder ───────────────────────────────────────────────────

def _seed_document(client, token):
    resp = client.post("/api/documents", json={"url": "https://example.com/article"}, headers=auth(token))
    return resp.json()["id"]


def test_move_document_to_folder():
    client, engine = make_client()
    token = get_token(client)
    with patch("routers.documents.dispatch_ingestion"):
        doc_id = _seed_document(client, token)
    folder_resp = client.post("/api/folders", json={"name": "Reading", "folder_type": "document"}, headers=auth(token))
    folder_id = folder_resp.json()["id"]
    move_resp = client.patch(f"/api/documents/{doc_id}/folder", json={"folder_id": folder_id}, headers=auth(token))
    assert move_resp.status_code == 200
    assert move_resp.json()["folder_id"] == folder_id
    teardown(engine)


def test_remove_document_from_folder():
    client, engine = make_client()
    token = get_token(client)
    with patch("routers.documents.dispatch_ingestion"):
        doc_id = _seed_document(client, token)
    folder_resp = client.post("/api/folders", json={"name": "Reading", "folder_type": "document"}, headers=auth(token))
    folder_id = folder_resp.json()["id"]
    client.patch(f"/api/documents/{doc_id}/folder", json={"folder_id": folder_id}, headers=auth(token))
    remove_resp = client.patch(f"/api/documents/{doc_id}/folder", json={"folder_id": None}, headers=auth(token))
    assert remove_resp.status_code == 200
    assert remove_resp.json()["folder_id"] is None
    teardown(engine)


def test_delete_folder_nulls_document_folder_id():
    client, engine = make_client()
    token = get_token(client)
    with patch("routers.documents.dispatch_ingestion"):
        doc_id = _seed_document(client, token)
    folder_resp = client.post("/api/folders", json={"name": "Work", "folder_type": "document"}, headers=auth(token))
    folder_id = folder_resp.json()["id"]
    client.patch(f"/api/documents/{doc_id}/folder", json={"folder_id": folder_id}, headers=auth(token))
    client.delete(f"/api/folders/{folder_id}", headers=auth(token))
    doc_resp = client.get(f"/api/documents/{doc_id}", headers=auth(token))
    assert doc_resp.json()["folder_id"] is None
    teardown(engine)


def test_folder_count_reflects_documents():
    client, engine = make_client()
    token = get_token(client)
    folder_resp = client.post("/api/folders", json={"name": "Inbox", "folder_type": "document"}, headers=auth(token))
    folder_id = folder_resp.json()["id"]
    with patch("routers.documents.dispatch_ingestion"):
        doc_id = _seed_document(client, token)
    client.patch(f"/api/documents/{doc_id}/folder", json={"folder_id": folder_id}, headers=auth(token))
    list_resp = client.get("/api/folders?type=document", headers=auth(token))
    folder = list_resp.json()[0]
    assert folder["count"] == 1
    teardown(engine)


# ── Move transcription to folder ──────────────────────────────────────────────

def _seed_transcription(client, token):
    with patch("routers.transcription._transcribe"):
        resp = client.post(
            "/api/transcriptions/upload",
            files={"file": ("talk.mp3", b"fake-audio", "audio/mpeg")},
            headers=auth(token),
        )
    return resp.json()["id"]


def test_move_transcription_to_folder():
    client, engine = make_client()
    token = get_token(client)
    trans_id = _seed_transcription(client, token)
    folder_resp = client.post("/api/folders", json={"name": "Podcasts", "folder_type": "transcription"}, headers=auth(token))
    folder_id = folder_resp.json()["id"]
    move_resp = client.patch(f"/api/transcriptions/{trans_id}/folder", json={"folder_id": folder_id}, headers=auth(token))
    assert move_resp.status_code == 200
    assert move_resp.json()["folder_id"] == folder_id
    teardown(engine)


def test_transcription_list_includes_folder_id():
    client, engine = make_client()
    token = get_token(client)
    _seed_transcription(client, token)
    resp = client.get("/api/transcriptions", headers=auth(token))
    items = resp.json()
    assert "folder_id" in items[0]
    teardown(engine)


def test_delete_folder_nulls_transcription_folder_id():
    client, engine = make_client()
    token = get_token(client)
    trans_id = _seed_transcription(client, token)
    folder_resp = client.post("/api/folders", json={"name": "Archive", "folder_type": "transcription"}, headers=auth(token))
    folder_id = folder_resp.json()["id"]
    client.patch(f"/api/transcriptions/{trans_id}/folder", json={"folder_id": folder_id}, headers=auth(token))
    client.delete(f"/api/folders/{folder_id}", headers=auth(token))
    list_resp = client.get("/api/transcriptions", headers=auth(token))
    assert list_resp.json()[0]["folder_id"] is None
    teardown(engine)
