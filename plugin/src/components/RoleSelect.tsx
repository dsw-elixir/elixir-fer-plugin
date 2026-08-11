import { FlashError } from '@ds-wizard/plugin-sdk/ui/Flash'
import { useEffect, useState } from 'react'

import { listRoles, Role } from '../api/service'

type RoleSelectProps = {
    selectedUuid: string | null
    onChange: (roleUuid: string | null) => void
}

export default function RoleSelect({ selectedUuid, onChange }: RoleSelectProps) {
    const [roles, setRoles] = useState<Role[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        listRoles()
            .then((loadedRoles) => {
                if (!cancelled) {
                    setRoles(loadedRoles)
                    setError(null)
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

    return (
        <>
            <select
                className="form-select"
                disabled={roles === null}
                value={selectedUuid ?? ''}
                onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
            >
                <option value="">
                    {roles === null ? 'Loading…' : 'No role selected (nobody can submit)'}
                </option>
                {(roles ?? []).map((role) => (
                    <option value={role.uuid} key={role.uuid}>
                        {role.name}
                    </option>
                ))}
                {!isSelectedKnown && <option value={selectedUuid}>{selectedUuid} (unknown)</option>}
            </select>
            {error && <FlashError>{error}</FlashError>}
        </>
    )
}
