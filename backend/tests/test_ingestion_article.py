from unittest.mock import patch, MagicMock
from services.ingestion.article import ingest_article

def test_returns_title_and_text():
    mock_article = MagicMock()
    mock_article.title = "Test Article"
    mock_article.text = "Body text here."
    mock_article.authors = ["Jane Doe"]
    mock_article.publish_date = None
    mock_article.top_image = ""
    mock_article.article_html = "<p>Body text here.</p>"

    with patch("services.ingestion.article.Article") as MockArticle:
        MockArticle.return_value = mock_article
        mock_article.download = MagicMock()
        mock_article.parse = MagicMock()
        result = ingest_article("https://example.com", html=None)

    assert result["title"] == "Test Article"
    assert result["content_text"] == "Body text here."
    assert result["author"] == "Jane Doe"

def test_sanitizes_html():
    mock_article = MagicMock()
    mock_article.title = "Title"
    mock_article.text = "Text"
    mock_article.authors = []
    mock_article.publish_date = None
    mock_article.article_html = '<p>Clean</p><script>bad()</script>'
    mock_article.top_image = ""

    with patch("services.ingestion.article.Article") as MockArticle:
        MockArticle.return_value = mock_article
        mock_article.download = MagicMock()
        mock_article.parse = MagicMock()
        result = ingest_article("https://example.com", html=None)

    assert "<script>" not in result["content_html"]
    assert "Clean" in result["content_html"]
