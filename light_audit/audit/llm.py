"""Anthropic SDK wrapper that enforces AgentRun logging (US-045).

All Claude API calls MUST go through ``run_agent``.  Direct usage of the
``anthropic`` client outside this module is prohibited (enforced by tests).
"""

from __future__ import annotations

import traceback as _traceback
from contextlib import contextmanager
from typing import TYPE_CHECKING
from typing import Any

if TYPE_CHECKING:
    from collections.abc import Generator

import anthropic
from django.conf import settings
from django.utils import timezone

from light_audit.audit.models import AgentRun
from light_audit.audit.models import AgentRunStatus

if TYPE_CHECKING:
    from collections.abc import Generator

    from django.contrib.auth.models import AbstractUser

    from light_audit.audit.models import AuditVersion
    from light_audit.audit.models import Project

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

Message = dict[str, Any]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@contextmanager
def run_agent(  # noqa: PLR0913
    agent_type: str,
    user: AbstractUser,
    project: Project | None,
    audit_version: AuditVersion | None,
    messages: list[Message],
    *,
    stream: bool = False,
    max_tokens: int = 4096,
) -> Generator[tuple[Any, AgentRun]]:
    """Context manager that wraps an Anthropic API call with AgentRun logging.

    Creates an ``AgentRun`` row on enter (status=running) and marks it ok/error
    on exit.  Yields ``(response_or_stream, agent_run)`` to the caller.

    Usage (non-streaming)::

        with run_agent("audit_review", user, project, av, messages) as (resp, run):
            text = resp.content[0].text

    Usage (streaming)::

        with run_agent(..., stream=True) as (stream_mgr, run):
            for text_chunk in stream_mgr.text_stream:
                yield text_chunk
    """
    run = AgentRun.objects.create(
        agent_type=agent_type,
        user=user,
        project=project,
        audit_version=audit_version,
        prompt_input={"messages": messages},
        status=AgentRunStatus.RUNNING,
        started_at=timezone.now(),
    )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = settings.CLAUDE_MODEL

    try:
        if stream:
            with client.messages.stream(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
            ) as stream_mgr:
                yield stream_mgr, run
                # get_final_message() only valid after the with block exits
                final = stream_mgr.get_final_message()

            text = final.content[0].text if final.content else ""
            run.mark_ok(
                response={"content": text},
                tokens_in=final.usage.input_tokens,
                tokens_out=final.usage.output_tokens,
            )
        else:
            response = client.messages.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
            )
            text = response.content[0].text if response.content else ""
            yield response, run
            run.mark_ok(
                response={"content": text},
                tokens_in=response.usage.input_tokens,
                tokens_out=response.usage.output_tokens,
            )
    except Exception:
        run.mark_error(_traceback.format_exc())
        raise
