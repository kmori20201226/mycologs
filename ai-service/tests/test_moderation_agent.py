from mycologs_ai_service.api.moderation import agent
from _fakes import FakeClient, text_message


def run(monkeypatch, raw_text, post="きれいなキノコを見つけました"):
    client = FakeClient(text_message(raw_text))
    monkeypatch.setattr(agent, "client", client)
    return agent.evaluate(post)


def test_pass(monkeypatch):
    result = run(monkeypatch, '{"category":"PASS","confidence":0.9,"comment":"問題ありません。"}')
    assert result.category == "PASS"
    assert result.point == 0
    assert result.allowed is True


def test_offensive_sexual_blocks(monkeypatch):
    result = run(monkeypatch, '{"category":"OFFENSIVE_SEXUAL","confidence":0.99,"comment":"不適切です。"}')
    assert result.point == -5
    assert result.allowed is False


def test_unknown_category_falls_back_to_pass(monkeypatch):
    result = run(monkeypatch, '{"category":"BOGUS","confidence":0.5,"comment":"?"}')
    assert result.category == "PASS"
    assert result.point == 0
    assert result.allowed is True


def test_strips_markdown_fences(monkeypatch):
    raw = '```json\n{"category":"OFF_TOPIC_IMAGE","confidence":0.7,"comment":"無関係です。"}\n```'
    result = run(monkeypatch, raw)
    assert result.category == "OFF_TOPIC_IMAGE"
    assert result.point == -1
    assert result.allowed is True


def test_defaults_when_fields_missing(monkeypatch):
    result = run(monkeypatch, '{"category":"PASS"}')
    assert result.confidence == 1.0
    assert result.comment == ""
