import { ProjectActionComponentProps } from '@ds-wizard/plugin-sdk/elements'
import { Alert } from '@ds-wizard/plugin-sdk/ui/Alert'
import { Button } from '@ds-wizard/plugin-sdk/ui/Button'
import { DialogBody, DialogFooter, DialogHeader } from '@ds-wizard/plugin-sdk/ui/Dialog'
import { Icon, Spinner } from '@ds-wizard/plugin-sdk/ui/Icon'
import { Stack } from '@ds-wizard/plugin-sdk/ui/Layout'
import { Link } from '@ds-wizard/plugin-sdk/ui/Link'
import { Body, Muted } from '@ds-wizard/plugin-sdk/ui/Text'
import { Fragment, ReactNode, useEffect, useState } from 'react'

import {
    checkEligibility,
    getProjectProgress,
    ProjectProgress,
    submitApplication,
} from '../api/service'
import { SettingsData } from '../data/settings-data'
import { UserSettingsData } from '../data/user-settings-data'

// The domain must not swallow a sentence-ending period
const EMAIL_PATTERN = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g
const WARNING_PREFIX = /^WARNING:( Error)?/

/**
 * The messages come from the plugin service. Highlight their warning prefix and
 * make the contact address a link, so that the user can act on it right away.
 */
function renderMessage(message: string): ReactNode {
    const prefix = WARNING_PREFIX.exec(message)?.[0]
    const rest = prefix ? message.slice(prefix.length) : message

    return (
        <>
            {prefix && <strong>{prefix}</strong>}
            {rest.split(EMAIL_PATTERN).map((part, index) => (
                <Fragment key={index}>
                    {index % 2 === 1 ? <Link href={`mailto:${part}`}>{part}</Link> : part}
                </Fragment>
            ))}
        </>
    )
}

type SubmitState =
    | { type: 'checking' }
    | { type: 'confirm' }
    | { type: 'blocked'; message: string }
    | { type: 'submitting' }
    | { type: 'done'; message: string }
    | { type: 'error'; message: string }

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback
}

function ProgressNote({ progress }: { progress: ProjectProgress }) {
    const total = progress.answeredQuestions + progress.unansweredQuestions
    const incomplete = progress.chapters.filter((chapter) => chapter.unansweredQuestions > 0)

    if (progress.unansweredQuestions === 0) {
        return (
            <Body>
                <Muted>
                    <Icon name="fa-check" /> All {total} questions are answered.
                </Muted>
            </Body>
        )
    }

    return (
        <Alert tone="warning">
            <span>
                Only{' '}
                <strong>
                    {progress.answeredQuestions} of {total} questions
                </strong>{' '}
                are answered. You can still submit the application, but the unanswered questions
                will be missing from it.
                {incomplete.length > 0 && (
                    <>
                        {' '}
                        Unanswered:{' '}
                        {incomplete
                            .map((chapter) => `${chapter.title} (${chapter.unansweredQuestions})`)
                            .join(', ')}
                        .
                    </>
                )}
            </span>
        </Alert>
    )
}

export default function SubmitApplication({
    project,
    onActionClose,
}: ProjectActionComponentProps<SettingsData, UserSettingsData>) {
    const [state, setState] = useState<SubmitState>({ type: 'checking' })
    const [progress, setProgress] = useState<ProjectProgress | null>(null)

    const projectUuid = project?.uuid ?? null

    // Only informative, a failure here must not stop the submission
    useEffect(() => {
        if (projectUuid === null) {
            return
        }

        let cancelled = false
        getProjectProgress(projectUuid)
            .then((projectProgress) => {
                if (!cancelled) {
                    setProgress(projectProgress)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setProgress(null)
                }
            })

        return () => {
            cancelled = true
        }
    }, [projectUuid])

    // Check upfront, so that the user is not offered an action that would fail
    useEffect(() => {
        if (projectUuid === null) {
            setState({ type: 'blocked', message: 'The project could not be loaded.' })
            return
        }

        let cancelled = false
        setState({ type: 'checking' })
        checkEligibility(projectUuid)
            .then((eligibility) => {
                if (cancelled) {
                    return
                }
                if (eligibility.canSubmit) {
                    setState({ type: 'confirm' })
                } else {
                    setState({
                        type: 'blocked',
                        message: eligibility.reason ?? 'You cannot submit this application.',
                    })
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setState({
                        type: 'blocked',
                        message: errorMessage(
                            error,
                            'It could not be checked whether you can submit the application.',
                        ),
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [projectUuid])

    const isSubmitting = state.type === 'submitting'
    const canSubmit = project !== null && (state.type === 'confirm' || state.type === 'error')

    const handleSubmit = async () => {
        if (!canSubmit || project === null) {
            return
        }

        setState({ type: 'submitting' })

        try {
            const response = await submitApplication({ project })
            setState({
                type: 'done',
                message: response.message ?? 'The application has been submitted.',
            })
        } catch (error) {
            setState({
                type: 'error',
                message: errorMessage(error, 'The application could not be submitted.'),
            })
        }
    }

    return (
        <>
            <DialogHeader title="Submit application" />
            <DialogBody>
                {state.type === 'done' ? (
                    <Alert tone="success">{state.message}</Alert>
                ) : (
                    <Stack>
                        <Alert tone="warning">
                            <span>
                                <strong>WARNING:</strong> For this Pilot call only invited resources
                                may apply.
                            </span>
                        </Alert>
                        <Body>
                            Once the application is submitted, the project becomes read-only. All of
                            its current users will no longer be able to edit the answers or add
                            comments.
                        </Body>
                        <Body>
                            The designated users from the ELIXIR Hub will be added to the project
                            and notified to process the application.
                        </Body>
                        {progress !== null && <ProgressNote progress={progress} />}
                        {state.type === 'checking' && (
                            <Body>
                                <Muted>
                                    <Spinner /> Checking whether you can submit the
                                    application&hellip;
                                </Muted>
                            </Body>
                        )}
                        {(state.type === 'blocked' || state.type === 'error') && (
                            <Alert tone="danger">
                                <span>{renderMessage(state.message)}</span>
                            </Alert>
                        )}
                    </Stack>
                )}
            </DialogBody>
            <DialogFooter>
                {state.type === 'done' ? (
                    <Button variant="primary" onClick={onActionClose}>
                        Close
                    </Button>
                ) : (
                    <>
                        <Button variant="ghost" disabled={isSubmitting} onClick={onActionClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            icon="fa-paper-plane"
                            loading={isSubmitting}
                            disabled={!canSubmit}
                            onClick={handleSubmit}
                        >
                            Submit application
                        </Button>
                    </>
                )}
            </DialogFooter>
        </>
    )
}
