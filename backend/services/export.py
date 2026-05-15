"""
Export service — generates EPUB files from document content_html.
Pure Python (zipfile), no extra dependencies.
CSS mirrors the Reader text-view style (Georgia serif, cream palette).
"""
import html
import io
import re
import uuid
import zipfile

# ── CSS matching the Reader text view ──────────────────────────────────────────

EBOOK_CSS = """\
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.85;
  color: #2c2416;
  padding: 0 1.2em;
}
h1 { font-size: 2em;   font-weight: bold; margin: 1em 0 0.4em; }
h2 { font-size: 1.5em; font-weight: bold; margin: 0.9em 0 0.35em; }
h3 { font-size: 1.2em; font-weight: bold; margin: 0.8em 0 0.3em; }
p  { margin: 0 0 0.7em; }
.toc-section {
  border-left: 3px solid #c4622d;
  padding: 0.4em 1em;
  margin: 1em 0;
}
"""

# ── EPUB building blocks ────────────────────────────────────────────────────────

CONTAINER_XML = """\
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""


def _content_opf(title: str, author: str, uid: str, n_chapters: int) -> str:
    author_elem = f"<dc:creator>{html.escape(author)}</dc:creator>" if author else ""
    manifest = "\n    ".join(
        f'<item id="c{i}" href="chapter{i}.xhtml" '
        f'media-type="application/xhtml+xml"/>'
        for i in range(n_chapters)
    )
    spine = "\n    ".join(f'<itemref idref="c{i}"/>' for i in range(n_chapters))
    return f"""\
<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf"
         unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">{uid}</dc:identifier>
    <dc:title>{html.escape(title)}</dc:title>
    {author_elem}
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml"
          media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    {manifest}
  </manifest>
  <spine>
    <itemref idref="nav"/>
    {spine}
  </spine>
</package>"""


def _nav_xhtml(title: str, chapters: list[tuple[str, str]]) -> str:
    items = "\n      ".join(
        f'<li><a href="chapter{i}.xhtml">{html.escape(ch_title)}</a></li>'
        for i, (ch_title, _) in enumerate(chapters)
    )
    return f"""\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>{html.escape(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  <nav epub:type="toc">
    <h1>{html.escape(title)}</h1>
    <ol>
      {items}
    </ol>
  </nav>
</body>
</html>"""


def _chapter_xhtml(title: str, body_html: str) -> str:
    # Make self-closing void elements valid for XHTML
    body_html = re.sub(r'<br\s*/?>', '<br/>', body_html)
    body_html = re.sub(r'<hr\s*/?>', '<hr/>', body_html)
    body_html = re.sub(r'<img([^>]*?)(?<!/)>', r'<img\1/>', body_html)
    return f"""\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>{html.escape(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
{body_html}
</body>
</html>"""


def _split_chapters(content_html: str, title: str) -> list[tuple[str, str]]:
    """Split pdf-page divs into chapters; fall back to a single chapter."""
    pages = re.findall(
        r'<div[^>]*class=["\']pdf-page["\'][^>]*>(.*?)</div>',
        content_html,
        re.DOTALL,
    )
    if not pages:
        return [(title, content_html)]
    if len(pages) == 1:
        return [(title, pages[0].strip())]
    return [(f"Section {i + 1}", p.strip()) for i, p in enumerate(pages)]


# ── Public API ──────────────────────────────────────────────────────────────────

def generate_epub(title: str, content_html: str, author: str = "") -> bytes:
    """Return raw EPUB bytes for the given content."""
    chapters = _split_chapters(content_html, title)
    uid = str(uuid.uuid4())

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # mimetype must be the first entry and stored uncompressed
        zf.writestr(
            zipfile.ZipInfo("mimetype"),
            "application/epub+zip",
            compress_type=zipfile.ZIP_STORED,
        )
        zf.writestr("META-INF/container.xml", CONTAINER_XML)
        zf.writestr("OEBPS/style.css", EBOOK_CSS)
        zf.writestr(
            "OEBPS/content.opf",
            _content_opf(title, author, uid, len(chapters)),
        )
        zf.writestr("OEBPS/nav.xhtml", _nav_xhtml(title, chapters))
        for i, (ch_title, ch_html) in enumerate(chapters):
            zf.writestr(
                f"OEBPS/chapter{i}.xhtml",
                _chapter_xhtml(ch_title, ch_html),
            )
    return buf.getvalue()


