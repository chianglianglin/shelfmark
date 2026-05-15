from services.sanitize import sanitize_html

def test_strips_script_tags():
    dirty = '<p>Hello</p><script>alert("xss")</script>'
    result = sanitize_html(dirty)
    assert "<script>" not in result
    assert "Hello" in result

def test_strips_iframes():
    dirty = '<p>Text</p><iframe src="evil.com"></iframe>'
    result = sanitize_html(dirty)
    assert "<iframe" not in result
    assert "Text" in result

def test_allows_basic_formatting():
    html = "<p>Hello <strong>world</strong></p>"
    result = sanitize_html(html)
    assert "<strong>" in result

def test_strips_tracking_pixels():
    dirty = '<img src="track.com/pixel.gif" width="1" height="1"><p>Content</p>'
    result = sanitize_html(dirty)
    assert "Content" in result
    assert "track.com/pixel.gif" not in result
