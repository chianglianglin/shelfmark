from unittest.mock import patch
from services.ingestion.pdf import ingest_pdf

def test_ingest_pdf_from_bytes():
    mock_text = "Page one content.\fPage two content."
    with patch("services.ingestion.pdf.extract_text") as mock_extract:
        mock_extract.return_value = mock_text
        result = ingest_pdf(pdf_bytes=b"fake-pdf-bytes", url="test.pdf")

    assert "Page one content" in result["content_text"]
    assert result["word_count"] > 0
    assert result["title"] == "test.pdf"
