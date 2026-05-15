import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from database import Base
from models import Transcription
from datetime import datetime, timezone

TEST_URL = "sqlite://"

@pytest.fixture
def db():
    engine = create_engine(TEST_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)

def test_transcription_model_fields(db):
    t = Transcription(
        title="Interview",
        filename="interview.mp3",
        status="processing",
        created_at=datetime.now(timezone.utc),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    assert t.id is not None
    assert t.title == "Interview"
    assert t.filename == "interview.mp3"
    assert t.status == "processing"
    assert t.language is None
    assert t.full_text is None
    assert t.words is None
    assert t.duration_seconds is None

from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
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

def test_upload_audio_returns_202():
    client, engine = make_client()
    token = get_token(client)
    with patch("routers.transcription._transcribe"):
        resp = client.post(
            "/api/transcriptions/upload",
            files={"file": ("talk.mp3", b"fake-audio", "audio/mpeg")},
            headers=auth(token),
        )
    assert resp.status_code == 202
    data = resp.json()
    assert "id" in data
    assert data["status"] == "processing"
    assert data["title"] == "talk"
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_upload_unsupported_format_rejected():
    client, engine = make_client()
    token = get_token(client)
    resp = client.post(
        "/api/transcriptions/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers=auth(token),
    )
    assert resp.status_code == 400
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def _seed_transcription(client, token):
    """Upload a fake audio file and return the transcription id."""
    with patch("routers.transcription._transcribe"):
        resp = client.post(
            "/api/transcriptions/upload",
            files={"file": ("talk.mp3", b"fake-audio", "audio/mpeg")},
            headers=auth(token),
        )
    return resp.json()["id"]

def test_list_transcriptions_returns_list():
    client, engine = make_client()
    token = get_token(client)
    _seed_transcription(client, token)
    resp = client.get("/api/transcriptions", headers=auth(token))
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list)
    assert len(items) == 1
    assert "id" in items[0]
    assert "words" not in items[0]  # words excluded from list view
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_get_transcription_returns_full_record():
    client, engine = make_client()
    token = get_token(client)
    trans_id = _seed_transcription(client, token)
    resp = client.get(f"/api/transcriptions/{trans_id}", headers=auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == trans_id
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_get_transcription_404():
    client, engine = make_client()
    token = get_token(client)
    resp = client.get("/api/transcriptions/nonexistent", headers=auth(token))
    assert resp.status_code == 404
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_delete_transcription_returns_204():
    client, engine = make_client()
    token = get_token(client)
    trans_id = _seed_transcription(client, token)
    resp = client.delete(f"/api/transcriptions/{trans_id}", headers=auth(token))
    assert resp.status_code == 204
    # Confirm it's gone
    resp2 = client.get(f"/api/transcriptions/{trans_id}", headers=auth(token))
    assert resp2.status_code == 404
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

def test_audio_endpoint_returns_file(tmp_path):
    client, engine = make_client()
    token = get_token(client)
    # Seed a transcription with a real audio file in STORAGE_DIR
    from routers.transcription import STORAGE_DIR
    with patch("routers.transcription._transcribe"):
        resp = client.post(
            "/api/transcriptions/upload",
            files={"file": ("talk.mp3", b"fake-audio-bytes", "audio/mpeg")},
            headers=auth(token),
        )
    trans_id = resp.json()["id"]
    # Ensure file was written
    audio_path = STORAGE_DIR / f"{trans_id}.mp3"
    assert audio_path.exists()
    resp2 = client.get(f"/api/transcriptions/{trans_id}/audio", headers=auth(token))
    assert resp2.status_code == 200
    assert resp2.headers["content-type"].startswith("audio/")
    # Clean up
    audio_path.unlink(missing_ok=True)
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()
