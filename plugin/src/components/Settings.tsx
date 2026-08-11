import { SettingsComponentProps } from '@ds-wizard/plugin-sdk/elements'

import { SettingsData } from '../data/settings-data'
import RoleSelect from './RoleSelect'
import UserSelect from './UserSelect'

export default function Settings({
    settings,
    onSettingsChange,
}: SettingsComponentProps<SettingsData>) {
    return (
        <>
            <div className="mb-3">
                <label className="form-label">Eligible role</label>
                <div className="form-text mb-2">
                    Users with this role can submit an application.
                </div>
                <RoleSelect
                    selectedUuid={settings.eligibleRoleUuid}
                    onChange={(eligibleRoleUuid) =>
                        onSettingsChange({ ...settings, eligibleRoleUuid })
                    }
                />
            </div>

            <div className="mb-3">
                <label className="form-label" htmlFor="elixir-fer-submitted-project-tag">
                    Submitted project tag
                </label>
                <div className="form-text mb-2">
                    Added to the project tags on submission, so that submitted applications can be
                    filtered. Leave empty to add no tag.
                </div>
                <input
                    type="text"
                    className="form-control"
                    id="elixir-fer-submitted-project-tag"
                    placeholder="e.g. submitted-application"
                    value={settings.submittedProjectTag}
                    onChange={(e) =>
                        onSettingsChange({ ...settings, submittedProjectTag: e.target.value })
                    }
                />
            </div>

            <div className="mb-3">
                <label className="form-label">Designated ELIXIR Hub users</label>
                <div className="form-text mb-2">
                    Users that are added to the project and notified to process the application
                    after it is submitted.
                </div>
                <UserSelect
                    selectedUuids={settings.designatedUserUuids}
                    onChange={(designatedUserUuids) =>
                        onSettingsChange({ ...settings, designatedUserUuids })
                    }
                />
            </div>
        </>
    )
}
