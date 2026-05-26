from http import HTTPStatus

import pytest
from django.contrib.auth import get_user_model

from light_audit.audit.models import PredefinedPrompt

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="prompts@example.com", password="pass")  # noqa: S106


@pytest.fixture
def active_prompt(db):
    return PredefinedPrompt.objects.create(
        name="Summarize findings",
        prompt_text="Summarize the audit findings.",
        agent_type="audit_review",
        active=True,
    )


@pytest.fixture
def inactive_prompt(db):
    return PredefinedPrompt.objects.create(
        name="Inactive prompt",
        prompt_text="This prompt is inactive.",
        agent_type="audit_review",
        active=False,
    )


@pytest.mark.django_db
def test_list_predefined_prompts_returns_active_only(
    client, user, active_prompt, inactive_prompt,
):
    client.force_login(user)
    response = client.get("/api/predefined-prompts/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    ids = [p["id"] for p in data]
    assert active_prompt.id in ids
    assert inactive_prompt.id not in ids


@pytest.mark.django_db
def test_list_predefined_prompts_fields(client, user, active_prompt):
    client.force_login(user)
    response = client.get("/api/predefined-prompts/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    p = data[0]
    assert p["name"] == "Summarize findings"
    assert p["prompt_text"] == "Summarize the audit findings."
    assert p["agent_type"] == "audit_review"
    assert p["active"] is True


@pytest.mark.django_db
def test_list_predefined_prompts_requires_auth(client, active_prompt):
    response = client.get("/api/predefined-prompts/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_predefined_prompt_model_str(db, active_prompt):
    assert str(active_prompt) == "Summarize findings"
