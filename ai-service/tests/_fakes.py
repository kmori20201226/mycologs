"""Fakes for the Anthropic client so agent logic can be tested offline.

Each agent does `from ...core.anthropic_client import client` and calls
`client.messages.create(...)`. Tests swap that client for a FakeClient via
`monkeypatch.setattr(<agent module>, "client", FakeClient(...))`.
"""
from types import SimpleNamespace

import anthropic
import httpx


def credit_exhausted_error() -> anthropic.BadRequestError:
    """A real Anthropic 400 error mimicking an exhausted account credit balance."""
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(400, request=request)
    return anthropic.BadRequestError(
        "Error code: 400 - {'type': 'error', 'error': {'type': "
        "'invalid_request_error', 'message': 'Your credit balance is too low "
        "to access the Anthropic API.'}}",
        response=response,
        body=None,
    )


def text_message(text: str):
    """A response whose first content block is text (moderation/geocoding)."""
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        stop_reason="end_turn",
    )


def tool_message(tool_input: dict, name: str = "report_identification"):
    """A response carrying a tool_use block (identification)."""
    return SimpleNamespace(
        content=[SimpleNamespace(type="tool_use", name=name, input=tool_input)],
        stop_reason="tool_use",
    )


class _FakeMessages:
    def __init__(self, response):
        self._response = response
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class FakeClient:
    """Drop-in for the anthropic client: records calls, returns a canned message."""

    def __init__(self, response):
        self.messages = _FakeMessages(response)
