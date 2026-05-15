def test_setup_creates_user(client):
    resp = client.post("/api/auth/setup", json={"password": "secret123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()

def test_setup_only_once(client):
    client.post("/api/auth/setup", json={"password": "secret123"})
    resp = client.post("/api/auth/setup", json={"password": "other"})
    assert resp.status_code == 400

def test_login_returns_token(client):
    client.post("/api/auth/setup", json={"password": "secret123"})
    resp = client.post("/api/auth/login", json={"password": "secret123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()

def test_login_wrong_password(client):
    client.post("/api/auth/setup", json={"password": "secret123"})
    resp = client.post("/api/auth/login", json={"password": "wrong"})
    assert resp.status_code == 401

def test_protected_route_requires_token(client):
    resp = client.get("/api/documents")
    assert resp.status_code == 403  # no token
