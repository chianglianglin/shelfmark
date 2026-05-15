from unittest.mock import patch, MagicMock
from services.ingestion.youtube import ingest_youtube

def test_ingest_youtube_video():
    mock_info = {
        "title": "Great Video",
        "uploader": "Channel Name",
        "upload_date": "20240101",
        "thumbnail": "http://img.com/thumb.jpg",
    }
    mock_transcript = [
        {"text": "Hello world", "start": 0.0},
        {"text": "This is great", "start": 3.5},
    ]
    with patch("services.ingestion.youtube.yt_dlp.YoutubeDL") as MockYDL, \
         patch("services.ingestion.youtube.YouTubeTranscriptApi.get_transcript") as mock_transcript_api:
        instance = MagicMock()
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)
        instance.extract_info = MagicMock(return_value=mock_info)
        MockYDL.return_value = instance
        mock_transcript_api.return_value = mock_transcript

        result = ingest_youtube("https://youtube.com/watch?v=abc123")

    assert result["title"] == "Great Video"
    assert "Hello world" in result["content_text"]
    assert result["author"] == "Channel Name"
