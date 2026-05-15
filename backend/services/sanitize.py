import bleach
from bs4 import BeautifulSoup

ALLOWED_TAGS = [
    "p", "br", "b", "strong", "i", "em", "u", "s", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "a", "img", "figure", "figcaption",
    "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    "hr", "div", "span",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "rel"],
    "img": ["src", "alt", "width", "height"],
    "*": ["class"],
}

def sanitize_html(html: str) -> str:
    if not html:
        return ""
    # Remove 1x1 tracking pixels before bleach pass
    soup = BeautifulSoup(html, "html.parser")
    for img in soup.find_all("img"):
        w = img.get("width", "")
        h = img.get("height", "")
        try:
            if int(w) <= 1 and int(h) <= 1:
                img.decompose()
        except (ValueError, TypeError):
            pass
    cleaned = str(soup)
    return bleach.clean(
        cleaned,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
    )
