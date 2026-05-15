import pytest
from unittest.mock import patch
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
    return TestClient(app), engine

def get_token(client):
    client.post("/api/auth/setup", json={"password": "pw"})
    resp = client.post("/api/auth/login", json={"password": "pw"})
    return resp.json()["access_token"]

def auth(token):
    return {"Authorization": f"Bearer {token}"}

def seed_transcription(client, token):
    with patch("routers.transcription._transcribe"):
        resp = client.post(
            "/api/transcriptions/upload",
            files={"file": ("talk.mp3", b"fake", "audio/mpeg")},
            headers=auth(token),
        )
    return resp.json()["id"]

def test_patch_chapters_replaces_chapters():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    chapters = [
        {"id": "c1", "title": "Chapter 1", "start_time": 0.0, "word_index": 0},
        {"id": "c2", "title": "Chapter 2", "start_time": 30.0, "word_index": 50},
    ]
    resp = client.patch(
        f"/api/transcriptions/{trans_id}/chapters",
        json={"chapters": chapters},
        headers=auth(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["chapters"]) == 2
    assert data["chapters"][0]["title"] == "Chapter 1"
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_patch_chapters_404_for_unknown():
    client, engine = make_client()
    token = get_token(client)
    resp = client.patch(
        "/api/transcriptions/nonexistent/chapters",
        json={"chapters": []},
        headers=auth(token),
    )
    assert resp.status_code == 404
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_get_transcription_includes_chapters():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    client.patch(
        f"/api/transcriptions/{trans_id}/chapters",
        json={"chapters": [{"id": "c1", "title": "Intro", "start_time": 0.0, "word_index": 0}]},
        headers=auth(token),
    )
    resp = client.get(f"/api/transcriptions/{trans_id}", headers=auth(token))
    assert resp.status_code == 200
    assert "chapters" in resp.json()
    assert resp.json()["chapters"][0]["title"] == "Intro"
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()
