import logging
import os
import pathlib
import typing

import pydantic
import pydantic.alias_generators
import yaml

LOG = logging.getLogger(__name__)

CONFIG_PATH_ENV = 'ELIXIR_FER_PLUGIN_CONFIG_PATH'
DEFAULT_CONFIG_PATH = 'config.yaml'


class ConfigModel(pydantic.BaseModel):
    # Both camelCase and snake_case keys are accepted in the YAML file
    model_config = pydantic.ConfigDict(
        alias_generator=pydantic.alias_generators.to_camel,
        populate_by_name=True,
        extra='forbid',
    )


class DswConfig(ConfigModel):
    api_url: str = 'https://elixir-fer.dsw.elixir-europe.org/wizard-api'
    allowed_api_urls: list[str] = pydantic.Field(default_factory=list)
    timeout: float = 10.0

    @pydantic.field_validator('api_url')
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip('/')

    @pydantic.field_validator('allowed_api_urls')
    @classmethod
    def _strip_trailing_slashes(cls, value: list[str]) -> list[str]:
        return [item.rstrip('/') for item in value]

    @property
    def allowed_urls(self) -> set[str]:
        # The API URL sent by the plugin must be one of these, so that the
        # service cannot be used to make requests to arbitrary hosts
        return {self.api_url, *self.allowed_api_urls}


class Config(ConfigModel):
    # Must match the UUID in the plugin metadata
    plugin_uuid: str = '69c7ee30-ac45-4b87-b6d5-b92532440923'
    dsw: DswConfig = pydantic.Field(default_factory=DswConfig)


def config_path() -> pathlib.Path:
    return pathlib.Path(os.getenv(CONFIG_PATH_ENV, DEFAULT_CONFIG_PATH))


def load_config() -> Config:
    path = config_path()

    if not path.is_file():
        if os.getenv(CONFIG_PATH_ENV):
            # An explicitly configured file must exist
            message = f'Config file not found: {path}'
            raise FileNotFoundError(message)
        LOG.warning(
            'Config file %s not found, using the default configuration '
            '(set %s to use a different path)',
            path,
            CONFIG_PATH_ENV,
        )
        return Config()

    with path.open(encoding='utf-8') as f:
        data: typing.Any = yaml.safe_load(f)

    config = Config.model_validate(data or {})
    LOG.info('Loaded config from %s', path)
    return config


_config: Config | None = None


def get_config() -> Config:
    global _config  # noqa: PLW0603
    if _config is None:
        _config = load_config()
    return _config


def set_config(config: Config | None) -> None:
    # Used at startup, so that config errors are reported right away
    global _config  # noqa: PLW0603
    _config = config
