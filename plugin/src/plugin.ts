import { PluginBuilder } from '@ds-wizard/plugin-sdk/core'
import { Plugin } from '@ds-wizard/plugin-sdk/types'

import Settings from './components/Settings'
import SubmitApplication from './components/SubmitApplication'
import { SettingsDataCodec } from './data/settings-data'
import { UserSettingsDataCodec } from './data/user-settings-data'
import { pluginMetadata } from './metadata'

export default function (_settingsInput: unknown, _userSettingsInput: unknown): Plugin {
    const plugin: Plugin = PluginBuilder.create(
        pluginMetadata,
        SettingsDataCodec,
        UserSettingsDataCodec,
    )
        .addProjectAction(
            'Submit application',
            'x-elixir-fer-plugin-submit-application',
            SubmitApplication,
            ['elixir:elixir-fair-enabling-resource:*'],
        )
        .addSettings('x-elixir-fer-plugin-settings', Settings)
        .createPlugin()

    return plugin
}
