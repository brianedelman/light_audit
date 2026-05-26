"""Tests for AuditReviewConsumer (US-046)."""

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

from light_audit.audit.consumers import AuditReviewConsumer
from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Project

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_run_agent(tokens: list[str]):
    """Return a context-manager replacement for run_agent that yields fake tokens."""

    @contextmanager
    def _mock(*args, **kwargs):
        mock_run = MagicMock()
        mock_stream = MagicMock()
        mock_stream.text_stream = iter(tokens)
        yield mock_stream, mock_run

    return _mock


_ROUTER = URLRouter(
    [
        re_path(
            r"^ws/audit-review/(?P<audit_version_id>\d+)/$",
            AuditReviewConsumer.as_asgi(),
        ),
    ],
)


def _make_consumer(av_id: int):
    return WebsocketCommunicator(
        _ROUTER,
        f"/ws/audit-review/{av_id}/",
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(email="reviewer@example.com", password="pw")  # noqa: S106


@pytest.fixture
def audit_version(db, user):
    project = Project.objects.create(name="Test Project", owner=user)
    building = Building.objects.create(project=project, name="Test Building")
    return AuditVersion.objects.create(building=building, created_by=user)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_anonymous_connection_rejected():
    """Anonymous scope user should be rejected with close code 4003."""

    async def _run():
        communicator = _make_consumer(1)
        # Leave user unset → anonymous
        connected, code = await communicator.connect()
        assert not connected
        anon_code = 4003
        assert code == anon_code

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_authenticated_connect(user, audit_version):
    """Authenticated user with valid audit_version_id connects successfully."""

    async def _run():
        communicator = _make_consumer(audit_version.pk)
        communicator.scope["user"] = user
        connected, _ = await communicator.connect()
        assert connected
        await communicator.disconnect()

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_nonexistent_audit_version_rejected(user):
    """Non-existent audit_version_id should be rejected with code 4004."""

    async def _run():
        communicator = _make_consumer(99999)
        communicator.scope["user"] = user
        connected, code = await communicator.connect()
        assert not connected
        missing_code = 4004
        assert code == missing_code

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_prompt_streams_tokens(user, audit_version):
    """Sending a prompt yields token messages followed by done."""

    async def _run():
        communicator = _make_consumer(audit_version.pk)
        communicator.scope["user"] = user
        connected, _ = await communicator.connect()
        assert connected

        with patch(
            "light_audit.audit.consumers.run_agent",
            _make_mock_run_agent(["Hello", " world"]),
        ):
            await communicator.send_json_to({"prompt": "Analyze this audit"})

            msg1 = await communicator.receive_json_from(timeout=5)
            assert msg1 == {"type": "token", "text": "Hello"}

            msg2 = await communicator.receive_json_from(timeout=5)
            assert msg2 == {"type": "token", "text": " world"}

            done = await communicator.receive_json_from(timeout=5)
            assert done == {"type": "done"}

        await communicator.disconnect()

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_empty_prompt_returns_error(user, audit_version):
    """Missing prompt field returns an error message."""

    async def _run():
        communicator = _make_consumer(audit_version.pk)
        communicator.scope["user"] = user
        connected, _ = await communicator.connect()
        assert connected

        await communicator.send_json_to({"prompt": ""})
        msg = await communicator.receive_json_from(timeout=5)
        assert msg["type"] == "error"

        await communicator.disconnect()

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_conversation_history_maintained(user, audit_version):
    """Second prompt includes prior assistant turn in messages passed to run_agent."""
    captured_messages: list = []

    @contextmanager
    def _capturing_agent(*args, **kwargs):
        captured_messages.extend(args[4])
        mock_run = MagicMock()
        mock_stream = MagicMock()
        mock_stream.text_stream = iter(["ok"])
        yield mock_stream, mock_run

    async def _run():
        communicator = _make_consumer(audit_version.pk)
        communicator.scope["user"] = user
        await communicator.connect()

        with patch("light_audit.audit.consumers.run_agent", _capturing_agent):
            # First turn
            await communicator.send_json_to({"prompt": "Turn one"})
            while True:
                msg = await communicator.receive_json_from(timeout=5)
                if msg["type"] == "done":
                    break

            # Second turn
            await communicator.send_json_to({"prompt": "Turn two"})
            while True:
                msg = await communicator.receive_json_from(timeout=5)
                if msg["type"] == "done":
                    break

        await communicator.disconnect()

        # After two turns, the second call's messages should include the assistant reply
        roles = [m["role"] for m in captured_messages]
        assert "assistant" in roles

    async_to_sync(_run)()
