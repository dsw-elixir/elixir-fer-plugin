import { ProjectActionComponentProps } from '@ds-wizard/plugin-sdk/elements'
import { FlashError, FlashSuccess, FlashWarning } from '@ds-wizard/plugin-sdk/ui/Flash'
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
                    {index % 2 === 1 ? <a href={`mailto:${part}`}>{part}</a> : part}
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

function ProgressFlash({ progress }: { progress: ProjectProgress }) {
    const total = progress.answeredQuestions + progress.unansweredQuestions
    const incomplete = progress.chapters.filter((chapter) => chapter.unansweredQuestions > 0)

    if (progress.unansweredQuestions === 0) {
        return (
            <p className="text-muted">
                <i className="fas fa-check me-1" />
                All {total} questions are answered.
            </p>
        )
    }

    return (
        <FlashWarning>
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
        </FlashWarning>
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
            <div className="modal-header">
                <h5 className="modal-title">Submit application</h5>
            </div>
            <div className="modal-body">
                {state.type === 'done' ? (
                    <FlashSuccess>{state.message}</FlashSuccess>
                ) : (
                    <>
                        <FlashWarning>
                            <span>
                                <strong>WARNING:</strong> For this Pilot call only invited resources
                                may apply.
                            </span>
                        </FlashWarning>
                        <p>
                            Once the application is submitted, the project becomes read-only. All of
                            its current users will no longer be able to edit the answers or add
                            comments.
                        </p>
                        <p>
                            The designated users from the ELIXIR Hub will be added to the project
                            and notified to process the application.
                        </p>
                        {progress !== null && <ProgressFlash progress={progress} />}
                        {state.type === 'checking' && (
                            <p className="text-muted">
                                <i className="fas fa-spinner fa-spin me-1" />
                                Checking whether you can submit the application&hellip;
                            </p>
                        )}
                        {(state.type === 'blocked' || state.type === 'error') && (
                            <FlashError>
                                <span>{renderMessage(state.message)}</span>
                            </FlashError>
                        )}
                    </>
                )}
            </div>
            <div className="modal-footer">
                {state.type === 'done' ? (
                    <button className="btn btn-primary" onClick={onActionClose}>
                        Close
                    </button>
                ) : (
                    <>
                        <button
                            className="btn btn-primary"
                            disabled={!canSubmit}
                            onClick={handleSubmit}
                        >
                            {isSubmitting && <i className="fas fa-spinner fa-spin me-1" />}
                            Submit application
                        </button>
                        <button
                            className="btn btn-secondary"
                            disabled={isSubmitting}
                            onClick={onActionClose}
                        >
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </>
    )
}
