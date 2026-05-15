"""
EPUB ingestion — extracts title, author, and structured HTML from an EPUB file.
EPUB is a ZIP archive; no extra dependencies beyond the stdlib + beautifulsoup4.
"""
import base64
import io
import posixpath
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

from bs4 import BeautifulSoup


_IMG_MIME: dict[str, str] = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "gif":  "image/gif",
    "webp": "image/webp",
    "svg":  "image/svg+xml",
}


def ingest_epub(epub_bytes: bytes, filename: str = "book.epub") -> dict:
    try:
        return _extract(epub_bytes, filename)
    except Exception:
        return {
            "title": filename.removesuffix(".epub") or "Book",
            "content_html": "",
            "content_text": "",
            "word_count": 0,
        }


# ── internals ──────────────────────────────────────────────────────────────────

def _extract(epub_bytes: bytes, filename: str) -> dict:
    with zipfile.ZipFile(io.BytesIO(epub_bytes)) as zf:
        names = set(zf.namelist())

        # 1. Locate OPF via META-INF/container.xml
        container = zf.read("META-INF/container.xml").decode("utf-8", errors="replace")
        opf_path = _opf_path(container)

        # 2. Parse OPF → title, author, spine hrefs
        opf_xml = zf.read(opf_path).decode("utf-8", errors="replace")
        opf_dir = str(PurePosixPath(opf_path).parent).rstrip("/")
        title, author, spine_hrefs = _parse_opf(opf_xml, opf_dir)

        # 3. Extract body HTML from each spine document
        parts = []
        for href in spine_hrefs:
            # Resolve href relative to OPF directory
            full = f"{opf_dir}/{href}".lstrip("/") if opf_dir else href
            full = str(PurePosixPath(full))   # normalise .. etc.
            if full not in names:
                continue
            raw = zf.read(full).decode("utf-8", errors="replace")
            body = _body_html(raw)
            if body.strip():
                doc_dir = str(PurePosixPath(full).parent)
                body = _inline_images(body, doc_dir, zf, names)
                body = _fix_links(body)
                parts.append(body)

    content_html = "\n".join(parts)
    content_text = BeautifulSoup(content_html, "html.parser").get_text(" ", strip=True)
    word_count = len(content_text.split())

    return {
        "title": title or filename.removesuffix(".epub") or "Book",
        "author": author or None,
        "content_html": content_html,
        "content_text": content_text,
        "word_count": word_count,
    }


def _inline_images(html: str, doc_dir: str, zf: zipfile.ZipFile, names: set) -> str:
    """Replace <img src="..."> and SVG <image xlink:href="..."> with base64 data URIs."""
    print(f"ZIP names sample: {list(names)[:10]}")
    soup = BeautifulSoup(html, "html.parser")
    for img in soup.find_all("img"):
        src = img.get("src", "")
        if not src or src.startswith("data:"):
            continue
        # Resolve the src relative to the document's directory inside the zip
        raw_path = f"{doc_dir}/{src}" if doc_dir and doc_dir != "." else src
        resolved = posixpath.normpath(raw_path)
        print(f"FOUND IMG: src={src!r}")
        print(f"  doc_dir={doc_dir!r}")
        print(f"  raw_path={raw_path!r}")
        print(f"  resolved={resolved!r}")
        print(f"  in_names={resolved in names}")
        if resolved in names:
            ext = posixpath.splitext(src)[1].lstrip(".").lower()
            mime = _IMG_MIME.get(ext, "image/jpeg")
            img_bytes = zf.read(resolved)
            b64 = base64.b64encode(img_bytes).decode()
            img["src"] = f"data:{mime};base64,{b64}"
        else:
            img.decompose()

    for tag in soup.find_all("image"):
        src = tag.get("xlink:href") or tag.get("href")
        if not src or src.startswith("data:"):
            continue
        # Resolve relative to the document's directory inside the zip
        raw_path = f"{doc_dir}/{src}" if doc_dir and doc_dir != "." else src
        resolved = posixpath.normpath(raw_path)
        print(f"FOUND IMG: src={src!r}")
        print(f"  doc_dir={doc_dir!r}")
        print(f"  raw_path={raw_path!r}")
        print(f"  resolved={resolved!r}")
        print(f"  in_names={resolved in names}")
        # Basename fallback: search by filename only if full path not found
        if resolved not in names:
            basename = posixpath.basename(src)
            fallback = next((n for n in names if posixpath.basename(n) == basename), None)
            print(f"  trying basename={basename!r}")
            print(f"  basename_match={fallback!r}")
            resolved = fallback
        if resolved and resolved in names:
            ext = posixpath.splitext(src)[1].lstrip(".").lower()
            mime = _IMG_MIME.get(ext, "image/jpeg")
            img_bytes = zf.read(resolved)
            b64 = base64.b64encode(img_bytes).decode()
            data_uri = f"data:{mime};base64,{b64}"
            print(f"SVG IMG xlink:href={src!r} resolved={resolved!r}")
            tag["xlink:href"] = data_uri
            tag["href"] = data_uri
        else:
            tag.decompose()

    return str(soup)


def _fix_links(html: str) -> str:
    """Convert internal EPUB links to inert text; add target=_blank to external URLs."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a"):
        href = a.get("href", "")
        if not href:
            continue
        if href.startswith("http://") or href.startswith("https://"):
            a["target"] = "_blank"
        else:
            # Internal EPUB chapter link or fragment — de-link it
            del a["href"]
            a["style"] = "cursor:default;color:inherit;text-decoration:none"
    return str(soup)


def _opf_path(container_xml: str) -> str:
    try:
        ns = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
        root = ET.fromstring(container_xml)
        rf = root.find(".//c:rootfile", ns)
        if rf is not None:
            return rf.get("full-path", "OEBPS/content.opf")
    except ET.ParseError:
        pass
    return "OEBPS/content.opf"


def _parse_opf(opf_xml: str, opf_dir: str) -> tuple:
    """Returns (title, author, [hrefs in spine order])."""
    try:
        root = ET.fromstring(opf_xml)
    except ET.ParseError:
        return ("", "", [])

    ns_opf = "http://www.idpf.org/2007/opf"
    ns_dc  = "http://purl.org/dc/elements/1.1/"

    title  = root.findtext(f".//{{{ns_dc}}}title")  or ""
    author = root.findtext(f".//{{{ns_dc}}}creator") or ""

    # Build id → href map from manifest (xhtml/html items only)
    manifest: dict[str, str] = {}
    for item in root.findall(f".//{{{ns_opf}}}item"):
        mt = item.get("media-type", "")
        if mt in ("application/xhtml+xml", "text/html"):
            iid = item.get("id")
            href = item.get("href", "")
            if iid and href:
                manifest[iid] = href

    # Walk spine in order; skip nav documents
    hrefs = []
    for ref in root.findall(f".//{{{ns_opf}}}itemref"):
        idref = ref.get("idref", "")
        if idref in manifest:
            hrefs.append(manifest[idref])

    return title.strip(), author.strip(), hrefs


def _body_html(html: str) -> str:
    """Return cleaned inner HTML of <body>, stripping scripts/styles/nav."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove navigation elements (EPUB ToC pages)
    for tag in soup.find_all(True, attrs={"epub:type": True}):
        if "toc" in (tag.get("epub:type") or ""):
            tag.decompose()
    for tag in soup.find_all(["script", "style", "nav"]):
        tag.decompose()

    body = soup.find("body")
    if not body:
        return ""
    return body.decode_contents()
