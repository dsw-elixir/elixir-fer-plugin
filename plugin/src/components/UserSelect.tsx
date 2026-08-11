import { FlashError } from '@ds-wizard/plugin-sdk/ui/Flash'
import { useEffect, useState } from 'react'

import { getUser, searchUsers, User } from '../api/service'

const SEARCH_DEBOUNCE_MS = 300

type UserSelectProps = {
    selectedUuids: string[]
    onChange: (userUuids: string[]) => void
}

function userName(user: User): string {
    return `${user.firstName} ${user.lastName}`.trim()
}

export default function UserSelect({ selectedUuids, onChange }: UserSelectProps) {
    // Only UUIDs are stored in the settings, the rest is loaded for display
    const [knownUsers, setKnownUsers] = useState<Record<string, User | null>>({})
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<User[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const missingUuids = selectedUuids.filter((userUuid) => !(userUuid in knownUsers))
        if (missingUuids.length === 0) {
            return
        }

        let cancelled = false
        Promise.all(
            missingUuids.map((userUuid) =>
                getUser(userUuid)
                    .then((user) => [userUuid, user] as const)
                    .catch(() => [userUuid, null] as const),
            ),
        ).then((entries) => {
            if (!cancelled) {
                setKnownUsers((users) => ({ ...users, ...Object.fromEntries(entries) }))
            }
        })

        return () => {
            cancelled = true
        }
    }, [selectedUuids, knownUsers])

    useEffect(() => {
        if (!isOpen) {
            return
        }

        let cancelled = false
        setIsSearching(true)
        const handle = setTimeout(() => {
            searchUsers(query)
                .then((users) => {
                    if (!cancelled) {
                        setResults(users)
                        setError(null)
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setResults([])
                        setError('The users could not be loaded.')
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setIsSearching(false)
                    }
                })
        }, SEARCH_DEBOUNCE_MS)

        return () => {
            cancelled = true
            clearTimeout(handle)
        }
    }, [query, isOpen])

    const addUser = (user: User) => {
        setKnownUsers((users) => ({ ...users, [user.uuid]: user }))
        onChange([...selectedUuids, user.uuid])
        setQuery('')
        setIsOpen(false)
    }

    const removeUser = (userUuid: string) => {
        onChange(selectedUuids.filter((uuid) => uuid !== userUuid))
    }

    const availableResults = results.filter((user) => !selectedUuids.includes(user.uuid))

    return (
        <div
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsOpen(false)
                }
            }}
        >
            {selectedUuids.length > 0 && (
                <ul className="list-group mb-2">
                    {selectedUuids.map((userUuid) => {
                        const user = knownUsers[userUuid]

                        return (
                            <li
                                className="list-group-item d-flex align-items-center"
                                key={userUuid}
                            >
                                <span className="flex-grow-1">
                                    {user ? (
                                        <>
                                            {userName(user)}{' '}
                                            <span className="text-muted">({user.email})</span>
                                        </>
                                    ) : user === null ? (
                                        <span className="text-muted">
                                            <i className="fas fa-exclamation-triangle me-1" />
                                            {userUuid}
                                        </span>
                                    ) : (
                                        <span className="text-muted">Loading&hellip;</span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    title="Remove user"
                                    onClick={() => removeUser(userUuid)}
                                >
                                    <i className="fas fa-trash" />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}

            <div className="position-relative">
                <input
                    type="text"
                    className="form-control"
                    placeholder="Search users by name or email&hellip;"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setIsOpen(true)
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {isOpen && (
                    <div
                        className="list-group position-absolute w-100 shadow-sm"
                        style={{ zIndex: 1000, maxHeight: '16rem', overflowY: 'auto' }}
                    >
                        {isSearching && (
                            <span className="list-group-item text-muted">
                                <i className="fas fa-spinner fa-spin me-1" />
                                Searching&hellip;
                            </span>
                        )}
                        {!isSearching &&
                            availableResults.map((user) => (
                                <button
                                    type="button"
                                    className="list-group-item list-group-item-action"
                                    key={user.uuid}
                                    onClick={() => addUser(user)}
                                >
                                    {userName(user)}{' '}
                                    <span className="text-muted">({user.email})</span>
                                </button>
                            ))}
                        {!isSearching && availableResults.length === 0 && (
                            <span className="list-group-item text-muted">No users found.</span>
                        )}
                    </div>
                )}
            </div>

            {error && <FlashError>{error}</FlashError>}
        </div>
    )
}
