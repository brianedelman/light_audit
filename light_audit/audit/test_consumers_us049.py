"""Tests for US-049: flag persistence + dismissed flag context injection."""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from asgiref.sync import async_to_sync
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.urls import re_path

from light_audit.audit.consumers import (
    AuditReviewConsumer,
    _build_system_prompt,
    _parse_flags_from_response,
    _persist_flags,
)
from light_audit.audit.models import (
    AgentRun,
    AgentRunStatus,
    AgentType,
    AuditFlag,
    AuditVersion,
    Building,
    Floor,
    FlagSeverity,
    FlagStatus,
    LogEntry,
    Project,
    Room,
)

User = get_user_model()

_ROUTER = URLRouter(
    [
        re_path(
            r"^ws/audit-review/(?P<audit_version_id>\d+)/$",
            AuditReviewConsumer.as_asgi(),
        ),
    ],
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(email="tester@example.com", password="pw")  # noqa: S106


@pytest.fixture
def audit_version(db, user):
    project = Project.objects.create(name="Test Project", owner=user)
    building = Building.objects.create(project=project, name="Test Building")
    return AuditVersion.objects.create(building=building, created_by=user)


@pytest.fixture
def log_entry(db, audit_version):
    floor = Floor.objects.create(
        building=audit_version.building,
        name="Floor 1",
        audit_version=audit_version,
    )
    room = Room.objects.create(floor=floor, name="Room A", audit_version=audit_version)
    return LogEntry.objects.create(
        room=room,
        fixture_id="E1",
        qty=4,
        audit_version=audit_version,
    )


@pytest.fixture
def agent_run(db, user, audit_version):
    return AgentRun.objects.create(
        agent_type=AgentType.AUDIT_REVIEW,
        user=user,
        audit_version=audit_version,
        status=AgentRunStatus.RUNNING,
    )


# ---------------------------------------------------------------------------
# Unit tests: _parse_flags_from_response
# ---------------------------------------------------------------------------


def test_parse_flags_extracts_valid_block():
    text = (
        "Here is my analysis.\n\n"
        "```flags\n"
        '[{"log_entry_id": 1, "severity": "warn", "message": "High wattage"}]\n'
        "```\n\n"
        "Let me know if you need more detail."
    )
    flags = _parse_flags_from_response(text)
    assert len(flags) == 1
    assert flags[0]["log_entry_id"] == 1
    assert flags[0]["severity"] == "warn"
    assert flags[0]["message"] == "High wattage"


def test_parse_flags_returns_empty_when_no_block():
    flags = _parse_flags_from_response("No flags here, just analysis text.")
    assert flags == []


def test_parse_flags_returns_empty_on_invalid_json():
    text = "```flags\nnot valid json\n```"
    flags = _parse_flags_from_response(text)
    assert flags == []


def test_parse_flags_multiple_items():
    text = (
        "```flags\n"
        '[{"log_entry_id": 1, "severity": "critical", "message": "480V fixture"},'
        ' {"log_entry_id": 2, "severity": "info", "message": "Low qty"}]\n'
        "```"
    )
    flags = _parse_flags_from_response(text)
    assert len(flags) == 2  # noqa: PLR2004


# ---------------------------------------------------------------------------
# Unit tests: _persist_flags
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_persist_flags_creates_audit_flag_rows(log_entry, audit_version, agent_run):
    flags_data = [
        {"log_entry_id": log_entry.pk, "severity": "warn", "message": "Check wattage"},
    ]
    _persist_flags(flags_data, audit_version, agent_run)

    flag = AuditFlag.objects.get(audit_version=audit_version)
    assert flag.log_entry_id == log_entry.pk
    assert flag.severity == FlagSeverity.WARN
    assert flag.message == "Check wattage"
    assert flag.status == FlagStatus.ACTIVE
    assert flag.source_run_id == agent_run.pk


@pytest.mark.django_db
def test_persist_flags_skips_unknown_log_entry(audit_version, agent_run):
    flags_data = [
        {"log_entry_id": 99999, "severity": "warn", "message": "Unknown entry"},
    ]
    _persist_flags(flags_data, audit_version, agent_run)
    assert AuditFlag.objects.filter(audit_version=audit_version).count() == 0


@pytest.mark.django_db
def test_persist_flags_defaults_invalid_severity(log_entry, audit_version, agent_run):
    flags_data = [
        {
            "log_entry_id": log_entry.pk,
            "severity": "not_a_severity",
            "message": "Bad severity",
        },
    ]
    _persist_flags(flags_data, audit_version, agent_run)
    flag = AuditFlag.objects.get(audit_version=audit_version)
    assert flag.severity == FlagSeverity.INFO


@pytest.mark.django_db
def test_persist_flags_skips_empty_message(log_entry, audit_version, agent_run):
    flags_data = [
        {"log_entry_id": log_entry.pk, "severity": "warn", "message": ""},
    ]
    _persist_flags(flags_data, audit_version, agent_run)
    assert AuditFlag.objects.filter(audit_version=audit_version).count() == 0


@pytest.mark.django_db
def test_persist_flags_noop_on_empty_list(audit_version, agent_run):
    _persist_flags([], audit_version, agent_run)
    assert AuditFlag.objects.filter(audit_version=audit_version).count() == 0


# ---------------------------------------------------------------------------
# Unit tests: _build_system_prompt dismissed context injection
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_build_system_prompt_includes_dismissed_flags(
    log_entry, audit_version, agent_run, user
):
    flag = AuditFlag.objects.create(
        log_entry=log_entry,
        audit_version=audit_version,
        severity=FlagSeverity.WARN,
        message="High wattage",
        status=FlagStatus.DISMISSED,
        dismissed_reason="Intentional industrial fixture",
        dismissed_by=user,
        source_run=agent_run,
    )
    prompt = _build_system_prompt(audit_version)
    assert "Previously dismissed flags" in prompt
    assert "High wattage" in prompt
    assert "Intentional industrial fixture" in prompt
    _ = flag  # referenced above


@pytest.mark.django_db
def test_build_system_prompt_no_dismissed_section_when_none(audit_version):
    prompt = _build_system_prompt(audit_version)
    assert "Previously dismissed flags" not in prompt


@pytest.mark.django_db
def test_build_system_prompt_excludes_active_flags(
    log_entry, audit_version, agent_run
):
    AuditFlag.objects.create(
        log_entry=log_entry,
        audit_version=audit_version,
        severity=FlagSeverity.WARN,
        message="Active flag should not appear",
        status=FlagStatus.ACTIVE,
        source_run=agent_run,
    )
    prompt = _build_system_prompt(audit_version)
    assert "Active flag should not appear" not in prompt
    assert "Previously dismissed flags" not in prompt


# ---------------------------------------------------------------------------
# Integration: consumer streams + persists flags via WS
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_consumer_persists_flags_from_response(user, audit_version, log_entry):
    """When Claude response contains a ```flags block, AuditFlag rows are created."""
    flag_response = (
        "Analysis complete.\n\n"
        "```flags\n"
        f'[{{"log_entry_id": {log_entry.pk}, "severity": "warn",'
        ' "message": "Potential over-wattage"}]\n'
        "```"
    )

    # Pre-create a real AgentRun so FK constraint is satisfied when persisting flags
    real_run = AgentRun.objects.create(
        agent_type=AgentType.AUDIT_REVIEW,
        user=user,
        audit_version=audit_version,
        status=AgentRunStatus.RUNNING,
    )

    @contextmanager
    def _mock_agent(*args, **kwargs):
        mock_stream = MagicMock()
        mock_stream.text_stream = iter([flag_response])
        yield mock_stream, real_run

    async def _run():
        communicator = WebsocketCommunicator(
            _ROUTER, f"/ws/audit-review/{audit_version.pk}/"
        )
        communicator.scope["user"] = user
        await communicator.connect()

        with patch("light_audit.audit.consumers.run_agent", _mock_agent):
            await communicator.send_json_to({"prompt": "Review this audit"})
            while True:
                msg = await communicator.receive_json_from(timeout=5)
                if msg["type"] in ("done", "error"):
                    break

        await communicator.disconnect()

    async_to_sync(_run)()

    flags = AuditFlag.objects.filter(audit_version=audit_version)
    assert flags.count() == 1
    assert flags.first().message == "Potential over-wattage"
    assert flags.first().severity == FlagSeverity.WARN


@pytest.mark.django_db(transaction=True)
def test_consumer_dismissed_flags_in_second_turn(user, audit_version, log_entry):
    """Dismissed flags appear in system prompt on the second turn."""
    captured_prompts: list[str] = []

    @contextmanager
    def _capturing_agent(*args, **kwargs):
        # args[4] is the messages list; capture the first user message content
        msgs = args[4]
        if msgs:
            captured_prompts.append(msgs[0]["content"])
        mock_run = MagicMock()
        mock_run.pk = 999
        mock_stream = MagicMock()
        mock_stream.text_stream = iter(["ok"])
        yield mock_stream, mock_run

    # Pre-create a dismissed flag
    AuditFlag.objects.create(
        log_entry=log_entry,
        audit_version=audit_version,
        severity=FlagSeverity.CRITICAL,
        message="480V fixture",
        status=FlagStatus.DISMISSED,
        dismissed_reason="Building uses 480V intentionally",
    )

    async def _run():
        communicator = WebsocketCommunicator(
            _ROUTER, f"/ws/audit-review/{audit_version.pk}/"
        )
        communicator.scope["user"] = user
        await communicator.connect()

        with patch("light_audit.audit.consumers.run_agent", _capturing_agent):
            await communicator.send_json_to({"prompt": "First turn"})
            while True:
                msg = await communicator.receive_json_from(timeout=5)
                if msg["type"] == "done":
                    break

        await communicator.disconnect()

    async_to_sync(_run)()

    # The first turn's augmented message should include the dismissed flag
    assert captured_prompts, "No prompts captured"
    first_prompt = captured_prompts[0]
    assert "Previously dismissed flags" in first_prompt
    assert "480V fixture" in first_prompt
    assert "480V intentionally" in first_prompt
