import { SettingsComponentProps } from '@ds-wizard/plugin-sdk/elements'
import { TextField } from '@ds-wizard/plugin-sdk/ui/Field'
import { Stack } from '@ds-wizard/plugin-sdk/ui/Layout'

import { SettingsData } from '../data/settings-data'
import RoleSelect from './RoleSelect'
import UserSelect from './UserSelect'

export default function Settings({
    settings,
    onSettingsChange,
}: SettingsComponentProps<SettingsData>) {
    return (
        <Stack loose>
            <RoleSelect
                label="Eligible role"
                hint="Users with this role can submit an application."
                selectedUuid={settings.eligibleRoleUuid}
                onChange={(eligibleRoleUuid) => onSettingsChange({ ...settings, eligibleRoleUuid })}
            />

            <TextField
                id="elixir-fer-submitted-project-tag"
                label="Submitted project tag"
                hint="Added to the project tags on submission, so that submitted applications can be filtered. Leave empty to add no tag."
                placeholder="e.g. submitted-application"
                value={settings.submittedProjectTag}
                onChange={(submittedProjectTag) =>
                    onSettingsChange({ ...settings, submittedProjectTag })
                }
            />

            <UserSelect
                label="Designated ELIXIR Hub users"
                hint="Users that are added to the project and notified to process the application after it is submitted."
                selectedUuids={settings.designatedUserUuids}
                onChange={(designatedUserUuids) =>
                    onSettingsChange({ ...settings, designatedUserUuids })
                }
            />
        </Stack>
    )
}
