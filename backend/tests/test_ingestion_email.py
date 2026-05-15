from services.ingestion.email import ingest_email

RAW_EMAIL = b"""From: sender@example.com
To: read@localhost
Subject: Newsletter Title

<html><body><p>Newsletter content here.</p><script>bad()</script></body></html>
"""

def test_ingest_email_extracts_html():
    result = ingest_email(RAW_EMAIL)
    assert result["title"] == "Newsletter Title"
    assert "Newsletter content here" in result["content_text"]
    assert "<script>" not in result["content_html"]
    assert result["author"] == "sender@example.com"
