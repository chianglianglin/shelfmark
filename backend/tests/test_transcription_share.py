import pytest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
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

def test_create_share_link():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    resp = client.post(f"/api/transcriptions/{trans_id}/share", headers=auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "share_url" in data
    assert "expires_at" in data
    assert len(data["share_url"]) > 10
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_get_shared_transcription_by_token():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    share_resp = client.post(f"/api/transcriptions/{trans_id}/share", headers=auth(token))
    share_url = share_resp.json()["share_url"]
    share_token = share_url.split("/shared/")[-1]
    # Public endpoint — no auth
    resp = client.get(f"/api/transcriptions/shared/{share_token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == trans_id
    assert "user" not in str(data)  # no internal user data
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_shared_endpoint_404_for_invalid_token():
    client, engine = make_client()
    resp = client.get("/api/transcriptions/shared/invalidtoken123")
    assert resp.status_code == 404
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_revoke_share_link():
    client, engine = make_client()
    token = get_token(client)
    trans_id = seed_transcription(client, token)
    client.post(f"/api/transcriptions/{trans_id}/share", headers=auth(token))
    resp = client.delete(f"/api/transcriptions/{trans_id}/share", headers=auth(token))
    assert resp.status_code == 204
    # get_transcription should now show no share info
    r2 = client.get(f"/api/transcriptions/{trans_id}", headers=auth(token))
    assert r2.json().get("share_token") is None
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()
