import pytest

from mycologs_ai_service.api.identification import agent
from mycologs_ai_service.api.identification.schemas import IdentificationRequest, IdentificationImage, CandidateInput
from _fakes import FakeClient, text_message, tool_message

VALID_INPUT = {
    "scientific_name": "Amanita muscaria",
    "japanese_name": "ベニテングタケ",
    "dialect_names": [],
    "confidence": "high",
    "score": 0.9,
    "shape": "傘",
    "edibility": "toxic",
    "key_features": ["赤い傘", "白いイボ"],
}


def make_payload(**kw):
    return IdentificationRequest(images=[IdentificationImage(data="base64data")], **kw)


def test_tool_use_result_stamps_agent_version(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)
    result = agent.evaluate(make_payload())
    assert result.scientific_name == "Amanita muscaria"
    assert result.edibility == "toxic"
    assert result.agent_version == agent.AGENT_VERSION


def test_tool_use_result_stamps_usage(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)
    result = agent.evaluate(make_payload())
    assert result.usage is not None
    assert result.usage.model == agent.MODEL
    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 50


def test_usage_excluded_from_tool_input_schema(monkeypatch):
    # The model must not be asked to generate usage/agent_version itself.
    schema = agent._build_input_schema()
    assert "usage" not in schema["properties"]
    assert "agent_version" not in schema["properties"]


def test_missing_tool_use_raises(monkeypatch):
    client = FakeClient(text_message("I cannot identify this."))
    monkeypatch.setattr(agent, "client", client)
    with pytest.raises(ValueError):
        agent.evaluate(make_payload())


def test_request_includes_gps_and_hint(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)
    agent.evaluate(make_payload(latitude=35.6, longitude=139.7, hint="林の中で見つけた"))

    text_block = client.messages.calls[0]["messages"][0]["content"][-1]["text"]
    assert "緯度 35.6" in text_block
    assert "経度 139.7" in text_block
    assert "林の中で見つけた" in text_block


def test_request_without_gps_uses_fallback_line(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)
    agent.evaluate(make_payload())

    text_block = client.messages.calls[0]["messages"][0]["content"][-1]["text"]
    assert "GPS情報なし" in text_block


def test_candidates_are_listed_in_the_prompt(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)
    agent.evaluate(make_payload(candidates=[
        CandidateInput(japanese_name="ベニテングタケ", scientific_name="Amanita muscaria"),
        CandidateInput(japanese_name="タマゴタケ", scientific_name="Amanita caesareoides"),
    ]))

    text_block = client.messages.calls[0]["messages"][0]["content"][-1]["text"]
    assert "候補種" in text_block
    assert "ベニテングタケ" in text_block
    assert "タマゴタケ" in text_block


def test_candidate_evaluations_parse_from_result(monkeypatch):
    payload_input = {
        **VALID_INPUT,
        "candidate_evaluations": [
            {"japanese_name": "ベニテングタケ", "scientific_name": "Amanita muscaria",
             "matches": True, "confidence": "high", "score": 0.9, "reason": "赤い傘と白いイボが一致"},
            {"japanese_name": "タマゴタケ", "scientific_name": "Amanita caesareoides",
             "matches": False, "confidence": "low", "score": 0.1, "reason": "白いイボがあり該当しない"},
        ],
    }
    client = FakeClient(tool_message(payload_input))
    monkeypatch.setattr(agent, "client", client)
    result = agent.evaluate(make_payload())

    assert len(result.candidate_evaluations) == 2
    assert result.candidate_evaluations[0].matches is True
    assert result.candidate_evaluations[0].confidence == "high"
    assert result.candidate_evaluations[1].matches is False


def test_no_candidates_leaves_evaluations_empty(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)
    result = agent.evaluate(make_payload())
    assert result.candidate_evaluations == []


# --- variants -------------------------------------------------------------
#
# One call runs one variant; the web page fans out across several and tabs the
# answers. So what matters here is that a named variant actually reaches the
# API call, and that the name stamped on the result is the one that ran —
# because that string is what ends up in Identification.description when an
# admin saves a tab, and a wrong one would silently misattribute a result.

def test_named_variant_selects_its_model_and_prompt(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)
    name = "claude-sonnet-5/prompt-v2.2"

    result = agent.evaluate(make_payload(variant=name))

    call = client.messages.calls[0]
    assert call["model"] == agent.VARIANTS[name].model
    assert call["system"] == agent.VARIANTS[name].system
    assert result.agent_version == name
    assert result.usage.model == agent.VARIANTS[name].model


def test_omitting_the_variant_keeps_the_production_pairing(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)

    result = agent.evaluate(make_payload())

    assert client.messages.calls[0]["model"] == agent.MODEL
    assert result.agent_version == agent.DEFAULT_VARIANT


def test_unknown_variant_is_refused_rather_than_defaulted(monkeypatch):
    client = FakeClient(tool_message(VALID_INPUT))
    monkeypatch.setattr(agent, "client", client)

    # Defaulting would label the result with a pairing that never ran, which is
    # worse than failing: the comparison would be quietly wrong.
    with pytest.raises(KeyError):
        agent.evaluate(make_payload(variant="claude-opus-5/prompt-v99"))
    assert client.messages.calls == []


def test_every_variant_key_names_its_own_model():
    # The key is the comparison label. If it disagreed with the model actually
    # called, two rows in the tab strip could claim to differ and not.
    for name, v in agent.VARIANTS.items():
        assert name.startswith(v.model + "/"), f"{name} does not name {v.model}"
