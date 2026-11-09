import { SelectField, SelectOption } from '@ds-wizard/plugin-sdk/ui/Field'
import { ReactNode, useEffect, useState } from 'react'

import { listRoles, Role } from '../api/service'

type RoleSelectProps = {
    label: string
    hint?: ReactNode
    selectedUuid: string | null
    onChange: (roleUuid: string | null) => void
}

export default function RoleSelect({ label, hint, selectedUuid, onChange }: RoleSelectProps) {
    const [roles, setRoles] = useState<Role[] | null>(null)
    const [error, setError] = useState<string | undefined>(undefined)

    useEffect(() => {
        let cancelled = false
        listRoles()
            .then((loadedRoles) => {
                if (!cancelled) {
                    setRoles(loadedRoles)
                    setError(undefined)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRoles([])
                    setError('The roles could not be loaded.')
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    // Keep an unknown selected role in the list, so that it is not lost
    const isSelectedKnown =
        selectedUuid === null || (roles ?? []).some((role) => role.uuid === selectedUuid)

    const options: SelectOption[] = [
        {
            value: '',
            label: roles === null ? 'Loading…' : 'No role selected (nobody can submit)',
        },
        ...(roles ?? []).map((role) => ({ value: role.uuid, label: role.name })),
        ...(!isSelectedKnown && selectedUuid !== null
            ? [{ value: selectedUuid, label: `${selectedUuid} (unknown)` }]
            : []),
    ]

    return (
        <SelectField
            label={label}
            hint={hint}
            disabled={roles === null}
            error={error}
            value={selectedUuid ?? ''}
            onChange={(value) => onChange(value === '' ? null : value)}
            options={options}
        />
    )
}
