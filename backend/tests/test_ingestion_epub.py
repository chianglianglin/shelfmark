"""Tests for EPUB ingestion — image inlining and link fixing."""
import base64
import io
import zipfile

from services.ingestion.epub import ingest_epub


# ── minimal EPUB factory ───────────────────────────────────────────────────────

def _make_epub(body_html: str, images: dict | None = None) -> bytes:
    """Build a minimal valid EPUB zip in memory.

    body_html — inner content of <body> in the single spine document
    images    — {zip_path: bytes} extra files to add to the archive
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("META-INF/container.xml", """\
<?xml version="1.0"?>
<container version="1.0"
           xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>""")

        zf.writestr("OEBPS/content.opf", """\
<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>""")

        zf.writestr("OEBPS/chapter1.xhtml", f"""\
<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>{body_html}</body>
</html>""")

        if images:
            for path, data in images.items():
                zf.writestr(path, data)

    return buf.getvalue()


# ── image tests ────────────────────────────────────────────────────────────────

def test_image_is_inlined_as_base64_data_uri():
    """<img src="images/cover.png"> whose file exists in the zip becomes a data URI."""
    fake_png = b"\x89PNG\r\n\x1a\n"  # PNG magic bytes
    epub = _make_epub(
        '<p><img src="images/cover.png" alt="cover"/></p>',
        images={"OEBPS/images/cover.png": fake_png},
    )
    result = ingest_epub(epub_bytes=epub)
    expected = f"data:image/png;base64,{base64.b64encode(fake_png).decode()}"
    assert expected in result["content_html"]
    assert 'src="images/cover.png"' not in result["content_html"]


def test_image_with_dotdot_path_is_inlined():
    """<img src="../images/cover.jpg"> resolves the .. traversal and inlines."""
    fake_jpg = b"\xff\xd8\xff"  # JPEG magic bytes
    epub = _make_epub(
        '<p><img src="../images/cover.jpg" alt="cover"/></p>',
        images={"images/cover.jpg": fake_jpg},  # one level above OEBPS/
    )
    result = ingest_epub(epub_bytes=epub)
    expected = f"data:image/jpeg;base64,{base64.b64encode(fake_jpg).decode()}"
    assert expected in result["content_html"]


def test_missing_image_is_removed_entirely():
    """<img> whose src is absent from the zip is removed — no broken-image icon."""
    epub = _make_epub('<p>before<img src="images/missing.png" alt="x"/>after</p>')
    result = ingest_epub(epub_bytes=epub)
    assert "<img" not in result["content_html"]
    # surrounding text must survive
    assert "before" in result["content_html"]
    assert "after" in result["content_html"]


# ── SVG image tests ────────────────────────────────────────────────────────────

def test_svg_image_xlink_href_is_inlined():
    """SVG <image xlink:href="cover.jpeg"> is inlined as a base64 data URI on both attrs."""
    fake_jpg = b"\xff\xd8\xff"
    epub = _make_epub(
        '<svg><image width="1030" height="610" xlink:href="images/cover.jpeg"/></svg>',
        images={"OEBPS/images/cover.jpeg": fake_jpg},
    )
    result = ingest_epub(epub_bytes=epub)
    expected = f"data:image/jpeg;base64,{base64.b64encode(fake_jpg).decode()}"
    assert expected in result["content_html"]
    assert 'xlink:href="images/cover.jpeg"' not in result["content_html"]


def test_svg_image_href_fallback_is_inlined():
    """SVG <image href="..."> (no xlink:href) is also inlined."""
    fake_png = b"\x89PNG\r\n\x1a\n"
    epub = _make_epub(
        '<svg><image width="800" height="600" href="images/fig.png"/></svg>',
        images={"OEBPS/images/fig.png": fake_png},
    )
    result = ingest_epub(epub_bytes=epub)
    expected = f"data:image/png;base64,{base64.b64encode(fake_png).decode()}"
    assert expected in result["content_html"]


def test_svg_image_basename_fallback_is_inlined():
    """SVG <image xlink:href="cover.jpeg"> resolves via basename when full path mismatches."""
    fake_jpg = b"\xff\xd8\xff"
    epub = _make_epub(
        '<svg><image xlink:href="cover.jpeg"/></svg>',
        images={"OEBPS/images/cover.jpeg": fake_jpg},  # stored under images/ subdir
    )
    result = ingest_epub(epub_bytes=epub)
    expected = f"data:image/jpeg;base64,{base64.b64encode(fake_jpg).decode()}"
    assert expected in result["content_html"]


def test_svg_image_missing_is_removed():
    """SVG <image> whose href can't be resolved is removed entirely."""
    epub = _make_epub('<svg><image xlink:href="missing.png"/></svg>')
    result = ingest_epub(epub_bytes=epub)
    assert "<image" not in result["content_html"]


# ── link tests ─────────────────────────────────────────────────────────────────

def test_internal_xhtml_link_is_delinked():
    """<a href="chapter2.xhtml"> becomes inert styled text — no broken navigation."""
    epub = _make_epub('<a href="chapter2.xhtml">Next Chapter</a>')
    result = ingest_epub(epub_bytes=epub)
    assert 'href="chapter2.xhtml"' not in result["content_html"]
    assert "cursor:default" in result["content_html"]
    assert "Next Chapter" in result["content_html"]


def test_internal_link_with_fragment_is_delinked():
    """<a href="chapter2.xhtml#sec1"> is also converted to inert text."""
    epub = _make_epub('<a href="chapter2.xhtml#sec1">Section</a>')
    result = ingest_epub(epub_bytes=epub)
    assert 'href="chapter2.xhtml#sec1"' not in result["content_html"]
    assert "cursor:default" in result["content_html"]


def test_external_https_link_is_kept_with_target_blank():
    """<a href="https://..."> keeps its href and gains target="_blank"."""
    epub = _make_epub('<a href="https://example.com">Visit</a>')
    result = ingest_epub(epub_bytes=epub)
    assert 'href="https://example.com"' in result["content_html"]
    assert 'target="_blank"' in result["content_html"]


def test_external_http_link_is_kept_with_target_blank():
    """<a href="http://..."> also keeps href and gains target="_blank"."""
    epub = _make_epub('<a href="http://example.com">Visit</a>')
    result = ingest_epub(epub_bytes=epub)
    assert 'href="http://example.com"' in result["content_html"]
    assert 'target="_blank"' in result["content_html"]
