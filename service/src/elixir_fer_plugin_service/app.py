import datetime
import logging
import typing
import uuid

import fastapi
import fastapi.middleware.cors
import fastapi.responses
import pydantic
import pydantic.alias_generators

from .auth import require_token
from .config import get_config, load_config, set_config
from .dsw import (
    CamelCaseModel,
    Client,
    DswClient,
    ProjectProgress,
    ProjectSettings,
    Role,
    User,
)

LOG = logging.getLogger(__name__)

OWNER_PERM = 'ADMIN'
USER_MEMBER_TYPE = 'UserMember'
USER_PERM_TYPE = 'UserProjectPermType'
USER_GROUP_PERM_TYPE = 'UserGroupProjectPermType'

READ_ONLY_PERMS = ['VIEW']
FULL_PERMS = ['VIEW', 'COMMENT', 'EDIT', 'ADMIN']

# Permissions alone do not make the project read-only, a submitted project is
# only accessible to the members listed in its permissions
SUBMITTED_VISIBILITY = 'PrivateProjectVisibility'
SUBMITTED_SHARING = 'RestrictedProjectSharing'

NOT_ELIGIBLE_ROLE_REASON = (
    'WARNING: Error - only resource owners can submit completed '
    'applications - contact fer@elixir-europe.org to check who is the '
    'allocated resource “owner” for your resource.'
)


class KnowledgeModelPackage(CamelCaseModel):
    uuid: uuid.UUID
    name: str
    description: str
    organization_id: str
    km_id: str
    version: str


class Project(CamelCaseModel):
    uuid: uuid.UUID
    name: str
    is_template: bool
    knowledge_model_package: KnowledgeModelPackage


class SubmitApplicationRequest(CamelCaseModel):
    # The designated users are read from the plugin settings, not from here
    project: Project


class SubmitApplicationResponse(CamelCaseModel):
    status: str
    message: str


class UsersResponse(CamelCaseModel):
    users: list[User]


class RolesResponse(CamelCaseModel):
    roles: list[Role]


class EligibilityResponse(CamelCaseModel):
    can_submit: bool
    reason: str | None = None


class PluginSettings(CamelCaseModel):
    """The plugin settings as configured in the wizard."""

    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
        extra='ignore',
    )

    eligible_role_uuid: uuid.UUID | None = None
    designated_user_uuids: list[uuid.UUID] = pydantic.Field(
        default_factory=list,
    )
    submitted_project_tag: str | None = None


async def _check_can_submit(
    client: DswClient,
    project_uuid: uuid.UUID,
) -> tuple[User, PluginSettings, str | None]:
    # Returns the current user, the plugin settings, and why they may not
    # submit, if they may not
    current_user = await client.get_current_user()

    # The settings are read from the wizard, never from the request, which the
    # user could tamper with
    plugin_uuid = get_config().plugin_uuid
    settings = PluginSettings.model_validate(
        await client.get_plugin_settings(plugin_uuid),
    )

    if settings.eligible_role_uuid is None:
        reason = 'No role eligible for submitting applications is configured'
        return current_user, settings, reason

    if current_user.role_uuid != settings.eligible_role_uuid:
        return current_user, settings, NOT_ELIGIBLE_ROLE_REASON

    if not settings.designated_user_uuids:
        reason = (
            'No designated ELIXIR Hub users are configured, so there would be '
            'nobody to process the application'
        )
        return current_user, settings, reason

    perms = await client.get_project_perms(project_uuid)
    is_owner = any(
        perm.member.type == USER_MEMBER_TYPE
        and perm.member.uuid == current_user.uuid
        and OWNER_PERM in perm.perms
        for perm in perms
    )
    if not is_owner:
        reason = 'Only the owner of the project can submit the application'
        return current_user, settings, reason

    return current_user, settings, None


def _submission_note(user: User) -> str:
    timestamp = datetime.datetime.now(tz=datetime.UTC)
    return (
        f'Submitted by {user.first_name} {user.last_name} ({user.uuid}) '
        f'at {timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")}.'
    )


def _appended_description(description: str | None, note: str) -> str:
    existing = (description or '').strip()
    return f'{existing}\n\n{note}' if existing else note


def _submission_tags(
    settings: ProjectSettings,
    submitted_project_tag: str | None,
) -> list[str]:
    # The tag makes it possible to filter the submitted applications later
    tags = list(settings.project_tags)
    tag = (submitted_project_tag or '').strip()
    if tag and tag not in tags:
        tags.append(tag)
    return tags


def _submission_permissions(
    settings: ProjectSettings,
    designated_user_uuids: list[uuid.UUID],
) -> list[dict[str, typing.Any]]:
    # All current members keep read-only access, the designated users get
    # full access; a designated user that is already a member is not doubled
    permissions: dict[str, dict[str, typing.Any]] = {}

    for perm in settings.permissions:
        member_uuid = str(perm.member.uuid)
        is_user = perm.member.type == USER_MEMBER_TYPE
        permissions[member_uuid] = {
            'memberType': USER_PERM_TYPE if is_user else USER_GROUP_PERM_TYPE,
            'memberUuid': member_uuid,
            'perms': READ_ONLY_PERMS,
        }

    for user_uuid in designated_user_uuids:
        permissions[str(user_uuid)] = {
            'memberType': USER_PERM_TYPE,
            'memberUuid': str(user_uuid),
            'perms': FULL_PERMS,
        }

    return list(permissions.values())


# Every endpoint except the health check requires the bearer token
router = fastapi.APIRouter(dependencies=[fastapi.Depends(require_token)])


@router.get('/users')
async def list_users(
    client: Client,
    q: str = '',
    size: typing.Annotated[int, fastapi.Query(ge=1, le=100)] = 20,
) -> UsersResponse:
    return UsersResponse(users=await client.search_users(query=q, size=size))


@router.get('/users/{user_uuid}')
async def get_user(client: Client, user_uuid: uuid.UUID) -> User:
    return await client.get_user(user_uuid)


@router.get('/roles')
async def list_roles(
    client: Client,
    q: str = '',
    size: typing.Annotated[int, fastapi.Query(ge=1, le=100)] = 100,
) -> RolesResponse:
    return RolesResponse(roles=await client.list_roles(query=q, size=size))


@router.get('/projects/{project_uuid}/progress')
async def get_project_progress(
    client: Client,
    project_uuid: uuid.UUID,
) -> ProjectProgress:
    return await client.get_project_progress(project_uuid)


@router.get('/projects/{project_uuid}/eligibility')
async def get_eligibility(
    client: Client,
    project_uuid: uuid.UUID,
) -> EligibilityResponse:
    # The same check as the one enforced on submission, so that the plugin can
    # tell the user upfront why they may not submit
    _, _, reason = await _check_can_submit(client, project_uuid)
    return EligibilityResponse(can_submit=reason is None, reason=reason)


@router.post('/applications')
async def submit_application(
    client: Client,
    request: SubmitApplicationRequest,
) -> SubmitApplicationResponse:
    project_uuid = request.project.uuid
    current_user, plugin_settings, reason = await _check_can_submit(
        client,
        project_uuid,
    )
    if reason is not None:
        raise fastapi.HTTPException(status_code=403, detail=reason)

    project_settings = await client.get_project_settings(project_uuid)

    # The settings have to be updated first, because the permission change
    # below takes away the right of the current user to do so
    await client.set_project_settings(
        settings=project_settings,
        description=_appended_description(
            project_settings.description,
            _submission_note(current_user),
        ),
        project_tags=_submission_tags(
            project_settings,
            plugin_settings.submitted_project_tag,
        ),
    )

    await client.set_project_share(
        project_uuid=project_uuid,
        visibility=SUBMITTED_VISIBILITY,
        sharing=SUBMITTED_SHARING,
        permissions=_submission_permissions(
            project_settings,
            plugin_settings.designated_user_uuids,
        ),
    )

    LOG.info(
        'User %s submitted application for project %s (%s) to %d '
        'designated user(s)',
        current_user.uuid,
        project_settings.name,
        project_uuid,
        len(plugin_settings.designated_user_uuids),
    )

    return SubmitApplicationResponse(
        status='submitted',
        message='The application has been submitted.',
    )


def create_app() -> fastapi.FastAPI:
    set_config(load_config())

    app = fastapi.FastAPI(
        title='Plugin Service',
        version='1.0.0',
    )

    app.add_middleware(
        middleware_class=fastapi.middleware.cors.CORSMiddleware,  # type: ignore
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    @app.get('/health')
    async def health_check() -> fastapi.responses.JSONResponse:
        return fastapi.responses.JSONResponse(content={'status': 'healthy'})

    app.include_router(router)

    return app
