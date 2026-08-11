# ELIXIR FER Plugin

_DSW Plugin for supporting procedures related to ELIXIR FAIR-Enabling Resources._

Plugin UUID: `69c7ee30-ac45-4b87-b6d5-b92532440923`

## How to Install

See the [Plugins](https://guide.ds-wizard.org/en/latest/more/self-hosted-dsw/configuration/plugins.html) page in the DSW Guide for instructions on how to install the plugin.

## Configuration

The plugin service is configured with a YAML file, see
[config.example.yaml](service/config.example.yaml):

```yaml
dsw:
    apiUrl: https://elixir-fer.dsw.elixir-europe.org/wizard-api
    allowedApiUrls: []
    timeout: 10
```

The file is read from `config.yaml` in the working directory, or from the path
in the `ELIXIR_FER_PLUGIN_CONFIG_PATH` environment variable. If that variable is
set, the file must exist; otherwise the defaults above are used.

The plugin sends the token of the current user and the API URL of the wizard it
runs in with every request to the service. The service holds no credentials of
its own and calls the DSW API only with that token. The API URL is accepted only
if it is `apiUrl` or one of `allowedApiUrls`, so that the service cannot be used
to make requests to arbitrary hosts; `apiUrl` is used when the plugin sends none.

The role eligible for submitting applications and the designated ELIXIR Hub
users that process them are configured in the plugin settings in the wizard.

## Changelog

### 0.1.0

Initial version

## License

This project is licensed under the MIT License - see the
[LICENSE](LICENSE) file for more details.
