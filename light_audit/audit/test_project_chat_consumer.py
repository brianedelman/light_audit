"""Tests for ProjectChatConsumer (US-053)."""

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

from light_audit.audit.consumers import ProjectChatConsumer
from light_audit.audit.consumers import _build_project_prompt
from light_audit.audit.models import Building
from light_audit.audit.models import Project

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_run_agent(tokens: list[str]):
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
            r"^ws/project-chat/(?P<project_id>\d+)/$",
            ProjectChatConsumer.as_asgi(),
        ),
    ],
)


def _make_consumer(project_id: int):
    return WebsocketCommunicator(
        _ROUTER,
        f"/ws/project-chat/{project_id}/",
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(email="chat@example.com", password="pw")  # noqa: S106


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="Chat Project", client="ACME Corp", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(
        project=project, name="Main Building", address="123 Main St",
    )


# ---------------------------------------------------------------------------
# Scope guard: system prompt
# ---------------------------------------------------------------------------


def test_build_project_prompt_contains_metadata(db, project, building):
    prompt = _build_project_prompt(project)
    assert "Chat Project" in prompt
    assert "ACME Corp" in prompt
    assert "Main Building" in prompt


def test_build_project_prompt_excludes_audit_data(db, project):
    """Prompt must not contain audit log entry data or fixture specs."""
    prompt = _build_project_prompt(project)
    # Actual field names from LogEntry model must not appear
    assert "log_entry_id" not in prompt.lower()
    assert "wattage" not in prompt.lower()
    assert "mount_type" not in prompt.lower()
    # Prompt must mention the scope restriction
    assert "Do not reference" in prompt


# ---------------------------------------------------------------------------
# Consumer tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_anonymous_rejected():
    async def _run():
        communicator = _make_consumer(1)
        connected, code = await communicator.connect()
        assert not connected
        assert code == 4003  # noqa: PLR2004

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_authenticated_connect(user, project):
    async def _run():
        communicator = _make_consumer(project.pk)
        communicator.scope["user"] = user
        connected, _ = await communicator.connect()
        assert connected
        await communicator.disconnect()

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_nonexistent_project_rejected(user):
    async def _run():
        communicator = _make_consumer(99999)
        communicator.scope["user"] = user
        connected, code = await communicator.connect()
        assert not connected
        assert code == 4004  # noqa: PLR2004

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_prompt_streams_tokens(user, project):
    async def _run():
        communicator = _make_consumer(project.pk)
        communicator.scope["user"] = user
        connected, _ = await communicator.connect()
        assert connected

        with patch(
            "light_audit.audit.consumers.run_agent",
            _make_mock_run_agent(["Hi", " there"]),
        ):
            await communicator.send_json_to({"prompt": "Tell me about this project"})

            msg1 = await communicator.receive_json_from(timeout=5)
            assert msg1 == {"type": "token", "text": "Hi"}

            msg2 = await communicator.receive_json_from(timeout=5)
            assert msg2 == {"type": "token", "text": " there"}

            done = await communicator.receive_json_from(timeout=5)
            assert done == {"type": "done"}

        await communicator.disconnect()

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_run_agent_called_with_chatbot_type(user, project):
    """run_agent must be called with AgentType.CHATBOT, not audit_review."""
    captured: list = []

    @contextmanager
    def _capture(agent_type, *args, **kwargs):
        captured.append(agent_type)
        mock_run = MagicMock()
        mock_stream = MagicMock()
        mock_stream.text_stream = iter(["ok"])
        yield mock_stream, mock_run

    async def _run():
        communicator = _make_consumer(project.pk)
        communicator.scope["user"] = user
        await communicator.connect()

        with patch("light_audit.audit.consumers.run_agent", _capture):
            await communicator.send_json_to({"prompt": "hello"})
            while True:
                msg = await communicator.receive_json_from(timeout=5)
                if msg["type"] in ("done", "error"):
                    break

        await communicator.disconnect()
        assert captured[0] == "chatbot"

    async_to_sync(_run)()


@pytest.mark.django_db(transaction=True)
def test_empty_prompt_returns_error(user, project):
    async def _run():
        communicator = _make_consumer(project.pk)
        communicator.scope["user"] = user
        await communicator.connect()

        await communicator.send_json_to({"prompt": ""})
        msg = await communicator.receive_json_from(timeout=5)
        assert msg["type"] == "error"

        await communicator.disconnect()

    async_to_sync(_run)()
