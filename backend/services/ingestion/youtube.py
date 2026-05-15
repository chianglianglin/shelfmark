import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from datetime import date
import re
from services.sanitize import sanitize_html

def _extract_video_id(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    return match.group(1) if match else ""

def ingest_youtube(url: str) -> dict:
    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    video_id = _extract_video_id(url)
    try:
        transcript_entries = YouTubeTranscriptApi.get_transcript(video_id)
        transcript_text = " ".join(e["text"] for e in transcript_entries)
    except Exception:
        transcript_text = "[Transcript not available]"

    upload_date = info.get("upload_date", "")
    published = None
    if upload_date and len(upload_date) == 8:
        published = date(int(upload_date[:4]), int(upload_date[4:6]), int(upload_date[6:8]))

    content_html = sanitize_html(f'<p>{transcript_text}</p>')

    return {
        "title": info.get("title", url),
        "author": info.get("uploader"),
        "published_date": published,
        "content_html": content_html,
        "content_text": transcript_text,
        "word_count": len(transcript_text.split()),
    }
