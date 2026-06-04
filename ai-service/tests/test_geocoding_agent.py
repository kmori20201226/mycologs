from mycologs_ai_service.api.geocoding import agent
from mycologs_ai_service.api.geocoding.schemas import GeocodingRequest
from _fakes import FakeClient, text_message


def run(monkeypatch, raw_text, place="東京"):
    client = FakeClient(text_message(raw_text))
    monkeypatch.setattr(agent, "client", client)
    return agent.evaluate(GeocodingRequest(place=place))


def test_parses_candidates(monkeypatch):
    raw = '{"candidates":[{"name":"東京都","longitude":139.69,"latitude":35.69}]}'
    result = run(monkeypatch, raw)
    assert len(result.candidates) == 1
    assert result.candidates[0].name == "東京都"
    assert result.candidates[0].longitude == 139.69
    assert result.candidates[0].latitude == 35.69


def test_empty_candidates(monkeypatch):
    result = run(monkeypatch, '{"candidates":[]}')
    assert result.candidates == []


def test_strips_fences(monkeypatch):
    raw = '```json\n{"candidates":[{"name":"X","longitude":1.0,"latitude":2.0}]}\n```'
    result = run(monkeypatch, raw)
    assert len(result.candidates) == 1
    assert result.candidates[0].name == "X"
