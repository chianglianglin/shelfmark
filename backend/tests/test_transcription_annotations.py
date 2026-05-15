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

def test_create_annotation():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    resp = client.post(
        "/api/transcription-annotations",
        json={
            "transcription_id": trans_id,
            "text": "hello world",
            "color": "yellow",
            "position": {
                "type": "transcription_range",
                "transcription_id": trans_id,
                "start_word_index": 0,
                "end_word_index": 1,
                "start_time": 0.0,
                "end_time": 1.0,
            },
        },
        headers=auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["text"] == "hello world"
    assert data["color"] == "yellow"
    assert "id" in data
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_list_annotations():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    client.post(
        "/api/transcription-annotations",
        json={
            "transcription_id": trans_id,
            "text": "hello",
            "color": "green",
            "position": {"type": "transcription_range", "transcription_id": trans_id,
                         "start_word_index": 0, "end_word_index": 0, "start_time": 0.0, "end_time": 0.5},
        },
        headers=auth(token),
    )
    resp = client.get(f"/api/transcription-annotations?transcription_id={trans_id}", headers=auth(token))
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["text"] == "hello"
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_update_annotation_note():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    r = client.post(
        "/api/transcription-annotations",
        json={
            "transcription_id": trans_id,
            "text": "hello",
            "color": "yellow",
            "position": {"type": "transcription_range", "transcription_id": trans_id,
                         "start_word_index": 0, "end_word_index": 0, "start_time": 0.0, "end_time": 0.5},
        },
        headers=auth(token),
    )
    ann_id = r.json()["id"]
    resp = client.put(f"/api/transcription-annotations/{ann_id}", json={"note": "great point"},
                      headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["note"] == "great point"
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_delete_annotation():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    r = client.post(
        "/api/transcription-annotations",
        json={
            "transcription_id": trans_id,
            "text": "hello",
            "color": "yellow",
            "position": {"type": "transcription_range", "transcription_id": trans_id,
                         "start_word_index": 0, "end_word_index": 0, "start_time": 0.0, "end_time": 0.5},
        },
        headers=auth(token),
    )
    ann_id = r.json()["id"]
    resp = client.delete(f"/api/transcription-annotations/{ann_id}", headers=auth(token))
    assert resp.status_code == 204
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()
