import email
from email import policy
from bs4 import BeautifulSoup
from services.sanitize import sanitize_html

def ingest_email(raw_bytes: bytes) -> dict:
    msg = email.message_from_bytes(raw_bytes, policy=policy.default)
    subject = str(msg["subject"] or "Untitled Newsletter")
    sender = str(msg["from"] or "")

    html_body = ""
    text_body = ""
    for part in msg.walk():
        ct = part.get_content_type()
        if ct == "text/html":
            html_body = part.get_content()
        elif ct == "text/plain" and not html_body:
            text_body = part.get_content()

    # If no explicit text/html part, check whether the text/plain body is actually HTML
    if not html_body and text_body and text_body.lstrip().startswith("<"):
        html_body = text_body
        text_body = ""

    if html_body:
        clean_html = sanitize_html(html_body)
        text = BeautifulSoup(html_body, "html.parser").get_text(" ", strip=True)
    else:
        clean_html = f"<p>{text_body}</p>"
        text = text_body

    return {
        "title": subject,
        "author": sender,
        "content_html": clean_html,
        "content_text": text,
        "word_count": len(text.split()),
    }
