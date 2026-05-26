"""Tests for audit/llm.py Anthropic SDK wrapper (US-045)."""

from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest

from light_audit.audit.models import AgentRun
from light_audit.audit.models import AgentRunStatus
from light_audit.audit.models import AgentType

_TOKENS_IN = 10
_TOKENS_OUT = 5


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db, django_user_model):
    return django_user_model.objects.create_user(
        email="llm_test@example.com",
        password="pw",  # noqa: S106
    )


@pytest.fixture
def project(db, user):
    from light_audit.audit.models import Project  # noqa: PLC0415

    return Project.objects.create(name="LLM Test Project", owner=user)


@pytest.fixture
def audit_version(db, project):
    from light_audit.audit.models import AuditVersion  # noqa: PLC0415
    from light_audit.audit.models import Building  # noqa: PLC0415

    building = Building.objects.create(name="Test Building", project=project)
    return AuditVersion.objects.create(building=building, version_number=1)


def _make_mock_response(
    text: str = "Hello!",
    input_tokens: int = _TOKENS_IN,
    output_tokens: int = _TOKENS_OUT,
):
    """Build a minimal mock Anthropic Message response."""
    content_block = MagicMock()
    content_block.text = text

    usage = MagicMock()
    usage.input_tokens = input_tokens
    usage.output_tokens = output_tokens

    response = MagicMock()
    response.content = [content_block]
    response.usage = usage
    return response


# ---------------------------------------------------------------------------
# Non-streaming tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_run_agent_creates_agent_run(user, project, audit_version, settings):
    """run_agent creates an AgentRun with status=running on enter."""
    from light_audit.audit.llm import run_agent  # noqa: PLC0415

    settings.ANTHROPIC_API_KEY = "test-key"
    settings.CLAUDE_MODEL = "claude-test-model"

    mock_response = _make_mock_response("Test response")
    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_response

    with (
        patch("light_audit.audit.llm.anthropic.Anthropic", return_value=mock_client),
        run_agent(
            agent_type=AgentType.AUDIT_REVIEW,
            user=user,
            project=project,
            audit_version=audit_version,
            messages=[{"role": "user", "content": "Audit this."}],
        ) as (response, run),
    ):
        # AgentRun exists while inside context
        assert AgentRun.objects.filter(pk=run.pk).exists()
        assert run.status == AgentRunStatus.RUNNING
        assert response.content[0].text == "Test response"

    # After context exits: status=ok, tokens updated
    run.refresh_from_db()
    assert run.status == AgentRunStatus.OK
    assert run.tokens_in == _TOKENS_IN
    assert run.tokens_out == _TOKENS_OUT
    assert run.response_output == {"content": "Test response"}


@pytest.mark.django_db
def test_run_agent_marks_error_on_exception(user, project, audit_version, settings):
    """run_agent marks AgentRun as error and re-raises when Anthropic raises."""
    from light_audit.audit.llm import run_agent  # noqa: PLC0415

    settings.ANTHROPIC_API_KEY = "test-key"
    settings.CLAUDE_MODEL = "claude-test-model"

    mock_client = MagicMock()
    mock_client.messages.create.side_effect = RuntimeError("API failure")

    with (
        patch("light_audit.audit.llm.anthropic.Anthropic", return_value=mock_client),
        pytest.raises(RuntimeError, match="API failure"),
        run_agent(
            agent_type=AgentType.AUDIT_REVIEW,
            user=user,
            project=project,
            audit_version=audit_version,
            messages=[{"role": "user", "content": "Audit."}],
        ),
    ):
        pass  # error raised before yield

    run = AgentRun.objects.get(agent_type=AgentType.AUDIT_REVIEW, user=user)
    assert run.status == AgentRunStatus.ERROR
    assert "API failure" in run.error


@pytest.mark.django_db
def test_run_agent_records_prompt_in_agent_run(user, project, audit_version, settings):
    """AgentRun stores the messages in prompt_input."""
    from light_audit.audit.llm import run_agent  # noqa: PLC0415

    settings.ANTHROPIC_API_KEY = "test-key"
    settings.CLAUDE_MODEL = "claude-test-model"

    messages = [{"role": "user", "content": "How much wattage?"}]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_mock_response()

    with (
        patch("light_audit.audit.llm.anthropic.Anthropic", return_value=mock_client),
        run_agent(
            agent_type=AgentType.AUDIT_REVIEW,
            user=user,
            project=project,
            audit_version=audit_version,
            messages=messages,
        ) as (_, run),
    ):
        assert run.prompt_input == {"messages": messages}


@pytest.mark.django_db
def test_run_agent_links_project_and_audit_version(
    user, project, audit_version, settings,
):
    """AgentRun is linked to the correct project and audit_version."""
    from light_audit.audit.llm import run_agent  # noqa: PLC0415

    settings.ANTHROPIC_API_KEY = "test-key"
    settings.CLAUDE_MODEL = "claude-test-model"

    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_mock_response()

    with (
        patch("light_audit.audit.llm.anthropic.Anthropic", return_value=mock_client),
        run_agent(
            agent_type=AgentType.AUDIT_REVIEW,
            user=user,
            project=project,
            audit_version=audit_version,
            messages=[{"role": "user", "content": "Check."}],
        ) as (_, run),
    ):
        assert run.project_id == project.pk
        assert run.audit_version_id == audit_version.pk


# ---------------------------------------------------------------------------
# Lint/enforcement: no direct anthropic SDK usage outside llm.py
# ---------------------------------------------------------------------------


def _python_files_outside_llm() -> list[Path]:
    """Return all .py files in light_audit/ except llm.py itself."""
    root = Path(__file__).resolve().parent.parent  # light_audit/
    files = list(root.rglob("*.py"))
    llm_path = Path(__file__).resolve().parent / "llm.py"
    return [f for f in files if f.resolve() != llm_path]


def _file_imports_anthropic_directly(path: Path) -> bool:
    """Return True if the file imports the anthropic SDK directly."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "anthropic" or alias.name.startswith("anthropic."):
                    return True
        elif isinstance(node, ast.ImportFrom):
            if node.module and (
                node.module == "anthropic"
                or node.module.startswith("anthropic.")
            ):
                return True
    return False


def test_no_direct_anthropic_imports_outside_llm():
    """No Python file outside audit/llm.py may import the anthropic SDK directly."""
    violators = [
        str(f)
        for f in _python_files_outside_llm()
        if _file_imports_anthropic_directly(f)
    ]
    assert violators == [], (
        "Direct `import anthropic` / `from anthropic` found outside audit/llm.py:\n"
        + "\n".join(violators)
    )
