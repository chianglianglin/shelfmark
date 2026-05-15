from newspaper import Article
from services.sanitize import sanitize_html
from typing import Optional

def ingest_article(url: str, html: Optional[str]) -> dict:
    article = Article(url)
    if html:
        article.set_html(html)
        article.parse()
    else:
        article.download()
        article.parse()

    raw_html = getattr(article, "article_html", "") or html or ""
    return {
        "title": article.title or url,
        "author": article.authors[0] if article.authors else None,
        "published_date": article.publish_date.date() if article.publish_date else None,
        "content_html": sanitize_html(raw_html),
        "content_text": article.text,
        "word_count": len(article.text.split()) if article.text else 0,
    }
