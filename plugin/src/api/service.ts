import { ProjectData } from '@ds-wizard/plugin-sdk'
import { getApiUrlAndToken, requestJson } from '@ds-wizard/plugin-sdk/requests'
import { z } from 'zod'

/**
 * The plugin service works against the DSW API on behalf of the current user,
 * so the token is forwarded with every request, together with the API URL of
 * the wizard the plugin runs in.
 */
function authHeaders(): Record<string, string> {
    const { apiUrl, token } = getApiUrlAndToken()

    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(apiUrl ? { 'X-Dsw-Api-Url': apiUrl } : {}),
    }
}

export const UserSchema = z.object({
    uuid: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    imageUrl: z.string().nullish(),
    active: z.boolean(),
    role: z.string().nullish(),
})

export type User = z.infer<typeof UserSchema>

export const UsersResponseSchema = z.object({
    users: z.array(UserSchema),
})

export async function searchUsers(query: string, size = 20): Promise<User[]> {
    const params = new URLSearchParams({ q: query, size: String(size) })
    const response = await requestJson(
        `${__API_URL__}/users?${params.toString()}`,
        UsersResponseSchema,
        { headers: authHeaders() },
    )
    return response.users
}

export async function getUser(userUuid: string): Promise<User> {
    return requestJson(`${__API_URL__}/users/${userUuid}`, UserSchema, {
        headers: authHeaders(),
    })
}

export const RoleSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    isAdmin: z.boolean(),
})

export type Role = z.infer<typeof RoleSchema>

export const RolesResponseSchema = z.object({
    roles: z.array(RoleSchema),
})

export async function listRoles(): Promise<Role[]> {
    const response = await requestJson(`${__API_URL__}/roles`, RolesResponseSchema, {
        headers: authHeaders(),
    })
    return response.roles
}

export const SubmitApplicationResponseSchema = z.object({
    status: z.string(),
    message: z.string().nullish(),
})

export type SubmitApplicationResponse = z.infer<typeof SubmitApplicationResponseSchema>

export type SubmitApplicationRequest = {
    // The designated users are read from the plugin settings by the service
    project: ProjectData
}

/**
 * Unlike the SDK helper, this reports the reason returned by the service, so
 * that the user learns why a submission was refused.
 */
async function requestWithDetail<TSchema extends z.ZodType>(
    url: string,
    schema: TSchema,
    fallbackError: string,
    init: { method?: string; body?: unknown } = {},
): Promise<z.infer<TSchema>> {
    const response = await fetch(url, {
        method: init.method ?? (init.body ? 'POST' : 'GET'),
        headers: {
            Accept: 'application/json',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...authHeaders(),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
        const detail = (payload as { detail?: unknown } | null)?.detail
        throw new Error(typeof detail === 'string' ? detail : fallbackError)
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
        throw new Error('Unexpected response from the plugin service.')
    }

    return parsed.data
}

export const ChapterProgressSchema = z.object({
    uuid: z.string(),
    title: z.string(),
    answeredQuestions: z.number(),
    unansweredQuestions: z.number(),
})

export type ChapterProgress = z.infer<typeof ChapterProgressSchema>

export const ProjectProgressSchema = z.object({
    answeredQuestions: z.number(),
    unansweredQuestions: z.number(),
    chapters: z.array(ChapterProgressSchema),
})

export type ProjectProgress = z.infer<typeof ProjectProgressSchema>

/** How many questions of the project are answered, in total and per chapter. */
export async function getProjectProgress(projectUuid: string): Promise<ProjectProgress> {
    return requestWithDetail(
        `${__API_URL__}/projects/${projectUuid}/progress`,
        ProjectProgressSchema,
        'The answered questions could not be counted.',
    )
}

export const EligibilitySchema = z.object({
    canSubmit: z.boolean(),
    reason: z.string().nullish(),
})

export type Eligibility = z.infer<typeof EligibilitySchema>

/**
 * Check whether the current user may submit an application for the project.
 * This is the same check that the service enforces on submission.
 */
export async function checkEligibility(projectUuid: string): Promise<Eligibility> {
    return requestWithDetail(
        `${__API_URL__}/projects/${projectUuid}/eligibility`,
        EligibilitySchema,
        'It could not be checked whether you can submit the application.',
    )
}

/**
 * Submit the FER application to the plugin service. The service checks that the
 * user may submit it, makes the project read-only for its current users, and
 * adds/notifies the designated ELIXIR Hub users.
 */
export async function submitApplication(
    request: SubmitApplicationRequest,
): Promise<SubmitApplicationResponse> {
    return requestWithDetail(
        `${__API_URL__}/applications`,
        SubmitApplicationResponseSchema,
        'The application could not be submitted.',
        { method: 'POST', body: request },
    )
}
