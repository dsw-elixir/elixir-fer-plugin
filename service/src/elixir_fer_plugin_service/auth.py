import typing

import fastapi
import fastapi.security

_bearer = fastapi.security.HTTPBearer(auto_error=False)


def require_token(
    credentials: typing.Annotated[
        fastapi.security.HTTPAuthorizationCredentials | None,
        fastapi.Depends(_bearer),
    ],
) -> str:
    # Every request from the plugin carries the token of the current user
    if credentials is None or not credentials.credentials:
        raise fastapi.HTTPException(
            status_code=401,
            detail='Missing or invalid Authorization header',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    return credentials.credentials


Token = typing.Annotated[str, fastapi.Depends(require_token)]
