def get_auth(client):
    client.post("/api/auth/setup", json={"password": "pw"})
    token = client.post("/api/auth/login", json={"password": "pw"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def create_doc(client, headers):
    resp = client.post("/api/documents", json={"url": "https://example.com"}, headers=headers)
    return resp.json()["id"]

def test_create_highlight(client):
    h = get_auth(client)
    doc_id = create_doc(client, h)
    resp = client.post("/api/highlights", json={
        "document_id": doc_id,
        "text": "Great insight",
        "color": "yellow",
        "position": {"type": "text_range", "start_offset": 0, "end_offset": 12},
    }, headers=h)
    assert resp.status_code == 201
    data = resp.json()
    assert data["text"] == "Great insight"
    assert data["synced_to_obsidian"] == False

def test_update_highlight_note(client):
    h = get_auth(client)
    doc_id = create_doc(client, h)
    create_resp = client.post("/api/highlights", json={
        "document_id": doc_id, "text": "Text", "color": "blue",
        "position": {"type": "text_range", "start_offset": 0, "end_offset": 4},
    }, headers=h)
    hl_id = create_resp.json()["id"]
    update_resp = client.put(f"/api/highlights/{hl_id}", json={"note": "My note"}, headers=h)
    assert update_resp.status_code == 200
    assert update_resp.json()["note"] == "My note"

def test_delete_highlight(client):
    h = get_auth(client)
    doc_id = create_doc(client, h)
    create_resp = client.post("/api/highlights", json={
        "document_id": doc_id, "text": "Text", "color": "green",
        "position": {"type": "text_range", "start_offset": 0, "end_offset": 4},
    }, headers=h)
    hl_id = create_resp.json()["id"]
    del_resp = client.delete(f"/api/highlights/{hl_id}", headers=h)
    assert del_resp.status_code == 204
