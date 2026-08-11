import { makeJsonCodec } from '@ds-wizard/plugin-sdk/utils'
import { z } from 'zod'

// UUIDs of the designated ELIXIR Hub users that process submitted applications.
// Kept as plain strings (not z.uuid) so that a partially typed value in the
// settings form doesn't break encoding; the form validates them for display.
export const SettingsDataSchema = z.object({
    designatedUserUuids: z.array(z.string()).default([]),
    // UUID of the role whose users may submit an application
    eligibleRoleUuid: z.string().nullable().default(null),
    // Project tag added on submission, empty to add none
    submittedProjectTag: z.string().default(''),
})

export type SettingsData = z.infer<typeof SettingsDataSchema>

export const DefaultSettingsData: SettingsData = {
    designatedUserUuids: [],
    eligibleRoleUuid: null,
    submittedProjectTag: '',
}

export const SettingsDataCodec = makeJsonCodec(SettingsDataSchema, DefaultSettingsData)
