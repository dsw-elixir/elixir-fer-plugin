import { Alert } from '@ds-wizard/plugin-sdk/ui/Alert'
import { Button, IconButton } from '@ds-wizard/plugin-sdk/ui/Button'
import { TextField } from '@ds-wizard/plugin-sdk/ui/Field'
import { Icon, Spinner } from '@ds-wizard/plugin-sdk/ui/Icon'
import { Stack } from '@ds-wizard/plugin-sdk/ui/Layout'
import { List, ListItem } from '@ds-wizard/plugin-sdk/ui/ListItem'
import { Muted } from '@ds-wizard/plugin-sdk/ui/Text'
import { ReactNode, useEffect, useState } from 'react'

import { getUser, searchUsers, User } from '../api/service'

const SEARCH_DEBOUNCE_MS = 300

type UserSelectProps = {
    label: string
    hint?: ReactNode
    selectedUuids: string[]
    onChange: (userUuids: string[]) => void
}

function userName(user: User): string {
    return `${user.firstName} ${user.lastName}`.trim()
}

export default function UserSelect({ label, hint, selectedUuids, onChange }: UserSelectProps) {
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
        <Stack>
            <div
                onFocus={() => setIsOpen(true)}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                        setIsOpen(false)
                    }
                }}
            >
                <Stack>
                    <TextField
                        label={label}
                        hint={hint}
                        type="search"
                        placeholder="Search users by name or email…"
                        value={query}
                        onChange={(value) => {
                            setQuery(value)
                            setIsOpen(true)
                        }}
                    />
                    {isOpen && (
                        <div style={{ maxHeight: '16rem', overflowY: 'auto' }}>
                            {isSearching ? (
                                <Muted>
                                    <Spinner /> Searching…
                                </Muted>
                            ) : availableResults.length === 0 ? (
                                <Muted>No users found.</Muted>
                            ) : (
                                <List>
                                    {availableResults.map((user) => (
                                        <ListItem
                                            key={user.uuid}
                                            title={userName(user)}
                                            description={user.email}
                                            actions={
                                                <Button
                                                    size="small"
                                                    icon="fa-plus"
                                                    onClick={() => addUser(user)}
                                                >
                                                    Add
                                                </Button>
                                            }
                                        />
                                    ))}
                                </List>
                            )}
                        </div>
                    )}
                </Stack>
            </div>

            {error && <Alert tone="danger">{error}</Alert>}

            {selectedUuids.length > 0 && (
                <List>
                    {selectedUuids.map((userUuid) => {
                        const user = knownUsers[userUuid]

                        return (
                            <ListItem
                                key={userUuid}
                                title={
                                    user ? (
                                        userName(user)
                                    ) : user === null ? (
                                        <Muted>
                                            <Icon
                                                name="fa-triangle-exclamation"
                                                label="Unknown user"
                                            />{' '}
                                            {userUuid}
                                        </Muted>
                                    ) : (
                                        <Muted>Loading…</Muted>
                                    )
                                }
                                description={user ? user.email : undefined}
                                actions={
                                    <IconButton
                                        icon="fa-trash"
                                        label="Remove user"
                                        size="small"
                                        variant="ghost"
                                        onClick={() => removeUser(userUuid)}
                                    />
                                }
                            />
                        )
                    })}
                </List>
            )}
        </Stack>
    )
}
