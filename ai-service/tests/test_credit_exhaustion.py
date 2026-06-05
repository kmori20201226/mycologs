"""When the Anthropic *account* credit runs out, the service must surface a
distinct, recognisable signal (503 + insufficient_ai_credit) instead of
crashing to a generic 500 — that's what lets the gateway notify the admin and
refund the caller's credit.
"""
import pytest
from fastapi.testclient import TestClient

from mycologs_ai_service.app import app
from mycologs_ai_service.core import exceptions
from mycologs_ai_service.core.exceptions import is_insufficient_credit
from mycologs_ai_service.api.identification import agent as identification_agent
from mycologs_ai_service.api.moderation import agent as moderation_agent
from _fakes import FakeClient, credit_exhausted_error

client = TestClient(app)


def test_is_insufficient_credit_detects_credit_error():
    assert is_insufficient_credit(credit_exhausted_error()) is True


def test_is_insufficient_credit_ignores_other_errors():
    assert is_insufficient_credit(ValueError("no tool_use block")) is False


def test_insufficient_credit_maps_to_503():
    exc = exceptions.insufficient_credit()
    assert exc.status_code == 503
    assert exc.detail == exceptions.INSUFFICIENT_CREDIT_CODE


def test_identification_returns_503_on_credit_exhaustion(monkeypatch):
    monkeypatch.setattr(identification_agent, "client", FakeClient(credit_exhausted_error()))
    res = client.post(
        "/api/identification/evaluate",
        json={"images": [{"data": "base64data"}]},
    )
    assert res.status_code == 503
    assert res.json()["detail"] == exceptions.INSUFFICIENT_CREDIT_CODE


def test_moderation_returns_503_on_credit_exhaustion(monkeypatch):
    monkeypatch.setattr(moderation_agent, "client", FakeClient(credit_exhausted_error()))
    res = client.post("/api/moderation/evaluate", json={"post": "テスト投稿"})
    assert res.status_code == 503
    assert res.json()["detail"] == exceptions.INSUFFICIENT_CREDIT_CODE
