import typing
import uuid

import fastapi
import httpx
import pydantic
import pydantic.alias_generators

from .auth import Token
from .config import get_config

ANSWERED_INDICATION = 'AnsweredIndication'


class CamelCaseModel(pydantic.BaseModel):
    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
    )


class User(CamelCaseModel):
    """Subset of the DSW user relevant for picking designated users."""

    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
        extra='ignore',
    )

    uuid: uuid.UUID
    first_name: str
    last_name: str
    email: str
    image_url: str | None = None
    active: bool = True
    role: str | None = None
    role_uuid: uuid.UUID | None = None

    @pydantic.model_validator(mode='before')
    @classmethod
    def _flatten_role(cls, data: typing.Any) -> typing.Any:  # noqa: ANN401
        # DSW returns the role either as an object or as a plain name
        if not isinstance(data, dict):
            return data

        role = data.get('role')
        if isinstance(role, dict):
            return {
                **data,
                'role': role.get('name'),
                'roleUuid': role.get('uuid'),
            }
        return data


class Role(CamelCaseModel):
    """Subset of the DSW role relevant for picking the eligible role."""

    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
        extra='ignore',
    )

    uuid: uuid.UUID
    name: str
    is_admin: bool = False


class ProjectMember(CamelCaseModel):
    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
        extra='ignore',
    )

    uuid: uuid.UUID
    type: str | None = None


class ProjectPerm(CamelCaseModel):
    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
        extra='ignore',
    )

    member: ProjectMember
    perms: list[str] = pydantic.Field(default_factory=list)


class ProjectSettings(CamelCaseModel):
    """Subset of the project settings needed to change them back."""

    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
        extra='ignore',
    )

    uuid: uuid.UUID
    name: str
    description: str | None = None
    is_template: bool = False
    project_tags: list[str] = pydantic.Field(default_factory=list)
    document_template: dict[str, typing.Any] | None = None
    format_uuid: str | None = None
    language: str | None = None
    visibility: str
    sharing: str
    permissions: list[ProjectPerm] = pydantic.Field(default_factory=list)


class ChapterProgress(CamelCaseModel):
    uuid: uuid.UUID
    title: str
    answered_questions: int
    unanswered_questions: int


class ProjectProgress(CamelCaseModel):
    answered_questions: int
    unanswered_questions: int
    chapters: list[ChapterProgress] = pydantic.Field(default_factory=list)


def _answered_indication(indications: typing.Any) -> tuple[int, int]:  # noqa: ANN401
    # The report has several indications, the answered one counts all the
    # questions, while the phases one only those of the current phase
    chosen = None
    for indication in indications or []:
        if not isinstance(indication, dict):
            continue
        if indication.get('indicationType') == ANSWERED_INDICATION:
            chosen = indication
            break
        if chosen is None:
            chosen = indication

    if chosen is None:
        return 0, 0
    return (
        int(chosen.get('answeredQuestions') or 0),
        int(chosen.get('unansweredQuestions') or 0),
    )


def _extract_embedded(payload: typing.Any) -> list[typing.Any]:  # noqa: ANN401
    # The listing is either a plain list or a paginated envelope
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        embedded = payload.get('_embedded')
        if isinstance(embedded, dict):
            for value in embedded.values():
                if isinstance(value, list):
                    return value
    return []


def resolve_api_url(api_url: str | None) -> str:
    # Validate the API URL sent by the plugin against the configuration
    config = get_config().dsw
    if not api_url:
        return config.api_url

    candidate = api_url.rstrip('/')
    if candidate not in config.allowed_urls:
        raise fastapi.HTTPException(
            status_code=400,
            detail='The DSW API URL is not allowed',
        )
    return candidate


def api_url_dependency(
    x_dsw_api_url: typing.Annotated[str | None, fastapi.Header()] = None,
) -> str:
    return resolve_api_url(x_dsw_api_url)


ApiUrl = typing.Annotated[str, fastapi.Depends(api_url_dependency)]


class DswClient:
    """Client for the DSW API acting on behalf of the current user."""

    def __init__(self, token: str, api_url: str | None = None) -> None:
        config = get_config().dsw
        self._api_url = api_url or config.api_url
        self._timeout = config.timeout
        self._token = token

    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, typing.Any] | None = None,
        json: typing.Any = None,  # noqa: ANN401
    ) -> typing.Any:  # noqa: ANN401
        try:
            async with httpx.AsyncClient(
                base_url=self._api_url,
                timeout=self._timeout,
            ) as client:
                response = await client.request(
                    method,
                    path,
                    params=params,
                    json=json,
                    headers={'Authorization': f'Bearer {self._token}'},
                )
        except httpx.HTTPError as e:
            raise fastapi.HTTPException(
                status_code=502,
                detail='The DSW API could not be reached',
            ) from e

        if response.status_code in {401, 403, 404}:
            raise fastapi.HTTPException(
                status_code=response.status_code,
                detail='The DSW API rejected the request',
            )
        if response.is_error:
            raise fastapi.HTTPException(
                status_code=502,
                detail='The DSW API returned an unexpected response',
            )
        if not response.content:
            return None

        return response.json()

    async def get(
        self,
        path: str,
        params: dict[str, typing.Any] | None = None,
    ) -> typing.Any:  # noqa: ANN401
        return await self._request('GET', path, params=params)

    async def post(
        self,
        path: str,
        json: typing.Any = None,  # noqa: ANN401
    ) -> typing.Any:  # noqa: ANN401
        return await self._request('POST', path, json=json)

    async def put(
        self,
        path: str,
        json: typing.Any = None,  # noqa: ANN401
    ) -> typing.Any:  # noqa: ANN401
        return await self._request('PUT', path, json=json)

    async def search_users(self, query: str, size: int) -> list[User]:
        # List active DSW users matching the query, sorted by name
        params: dict[str, typing.Any] = {
            'page': 0,
            'sort': 'lastName,asc',
            'size': size,
        }
        if query:
            params['q'] = query

        payload = await self.get('/users', params=params)

        users = []
        for item in _extract_embedded(payload):
            user = User.model_validate(item)
            if user.active:
                users.append(user)
        return users

    async def get_user(self, user_uuid: uuid.UUID) -> User:
        # Get a single DSW user, including the inactive ones
        payload = await self.get(f'/users/{user_uuid}')
        return User.model_validate(payload)

    async def get_current_user(self) -> User:
        # Identify the user that made the request
        payload = await self.get('/users/current')
        return User.model_validate(payload)

    async def get_project_perms(
        self,
        project_uuid: uuid.UUID,
    ) -> list[ProjectPerm]:
        # The project detail contains the permissions of all its members
        payload = await self.get(f'/projects/{project_uuid}')
        if not isinstance(payload, dict):
            return []
        perms = payload.get('permissions')
        if not isinstance(perms, list):
            return []
        return [ProjectPerm.model_validate(item) for item in perms]

    async def get_project_progress(
        self,
        project_uuid: uuid.UUID,
    ) -> ProjectProgress:
        # How many questions of the project are answered, in total and per
        # chapter, in the order in which the chapters are in the project
        payload = await self.get(f'/projects/{project_uuid}/report')
        if not isinstance(payload, dict):
            return ProjectProgress(answered_questions=0, unanswered_questions=0)

        total = payload.get('totalReport')
        answered, unanswered = _answered_indication(
            total.get('indications') if isinstance(total, dict) else None,
        )

        reports = {
            report.get('chapterUuid'): report
            for report in payload.get('chapterReports') or []
            if isinstance(report, dict)
        }

        chapters = []
        for chapter in payload.get('chapters') or []:
            if not isinstance(chapter, dict):
                continue
            report = reports.get(chapter.get('uuid')) or {}
            chapter_answered, chapter_unanswered = _answered_indication(
                report.get('indications'),
            )
            chapters.append(
                ChapterProgress(
                    uuid=chapter.get('uuid'),
                    title=chapter.get('title') or '',
                    answered_questions=chapter_answered,
                    unanswered_questions=chapter_unanswered,
                ),
            )

        return ProjectProgress(
            answered_questions=answered,
            unanswered_questions=unanswered,
            chapters=chapters,
        )

    async def get_project_settings(
        self,
        project_uuid: uuid.UUID,
    ) -> ProjectSettings:
        payload = await self.get(f'/projects/{project_uuid}/settings')
        return ProjectSettings.model_validate(payload)

    async def set_project_settings(
        self,
        settings: ProjectSettings,
        description: str,
        project_tags: list[str],
    ) -> None:
        # The whole settings have to be sent back, not just what changed
        document_template = settings.document_template or {}
        await self.put(
            f'/projects/{settings.uuid}/settings',
            json={
                'name': settings.name,
                'description': description,
                'isTemplate': settings.is_template,
                'projectTags': project_tags,
                'documentTemplateUuid': document_template.get('uuid'),
                'formatUuid': settings.format_uuid,
                'language': settings.language,
            },
        )

    async def set_project_share(
        self,
        project_uuid: uuid.UUID,
        visibility: str,
        sharing: str,
        permissions: list[dict[str, typing.Any]],
    ) -> None:
        await self.put(
            f'/projects/{project_uuid}/share',
            json={
                'visibility': visibility,
                'sharing': sharing,
                'permissions': permissions,
            },
        )

    async def get_plugin_settings(
        self,
        plugin_uuid: str,
    ) -> dict[str, typing.Any]:
        # The global plugin settings as stored by the wizard
        path = f'/tenants/current/plugin-settings/{plugin_uuid}'
        payload = await self.get(path)
        if isinstance(payload, dict):
            # Tolerate the settings being wrapped in a value envelope
            value = payload.get('value')
            if isinstance(value, dict):
                return value
            return payload
        return {}

    async def list_roles(self, query: str, size: int) -> list[Role]:
        # List DSW roles matching the query, sorted by name
        params: dict[str, typing.Any] = {
            'page': 0,
            'sort': 'name,asc',
            'size': size,
        }
        if query:
            params['q'] = query

        payload = await self.get('/roles', params=params)
        items = _extract_embedded(payload)
        return [Role.model_validate(item) for item in items]


def dsw_client(token: Token, api_url: ApiUrl) -> DswClient:
    # Every request carries the token and the API URL of the current user
    return DswClient(token, api_url)


Client = typing.Annotated[DswClient, fastapi.Depends(dsw_client)]
