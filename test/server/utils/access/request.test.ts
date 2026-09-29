import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AccessUser } from '../../../../shared/access'

/**
 * api が対象ごとに見られるかを確かめる口（access/permission・design D3・D5）。
 *
 * 一般の利用者・許可のある利用者・管理者・サーバー内部の呼び出しの4通りを見る。
 * 利用者の判定そのもの（token・接続元）は `identity.test.ts` が見るので、ここでは
 * 求めた結果を `event.context` に置いてから呼ぶ。
 */

const config = vi.hoisted(() => ({ root: '' }))

vi.mock('#app/nuxt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRuntimeConfig: () => ({
    projectShareRoot: config.root,
    access: { teamDomain: '', aud: '', admins: { emails: [], networks: [], hosts: [] } },
  }),
}))

const fetchMock = vi.fn(async (..._args: unknown[]) => undefined)
vi.stubGlobal('$fetch', fetchMock)

const { accessUserOf, internalFetch, requireAdmin, requireProjectName, requireSession, visibleSessions } =
  await import('../../../../server/utils/access/request')

const guest: AccessUser = { email: 'guest@example.com', admin: false, projects: ['alpha'] }
const admin: AccessUser = { email: null, admin: true, projects: [] }

function eventOf(user: AccessUser | null, headers: Record<string, string> = {}): H3Event {
  return {
    node: { req: { headers, socket: { remoteAddress: '203.0.113.9' } } },
    context: user ? { accessUser: Promise.resolve(user) } : {},
  } as unknown as H3Event
}

async function statusOf(run: Promise<void>): Promise<number | 'ok'> {
  try {
    await run
    return 'ok'
  } catch (error) {
    return (error as { statusCode: number }).statusCode
  }
}

async function writeState(name: string, state: Record<string, unknown>): Promise<void> {
  await mkdir(join(config.root, name), { recursive: true })
  await writeFile(join(config.root, name, 'state.json'), JSON.stringify(state))
}

beforeAll(async () => {
  config.root = await mkdtemp(join(tmpdir(), 'access-request-'))
  await writeState('3f2a0000-0000-4000-8000-000000000001', { phase: 'stroking', startedBy: 'guest@example.com' })
  await writeState('3f2a0000-0000-4000-8000-000000000002', { phase: 'stroking', startedBy: 'other@example.com' })
  await writeState('3f2a0000-0000-4000-8000-000000000003', { phase: 'stroking' })
  await writeState('alpha', { phase: 'activated', projectName: 'alpha', startedBy: 'other@example.com' })
  await writeState('beta', { phase: 'activated', projectName: 'beta' })
})

afterAll(async () => {
  await rm(config.root, { recursive: true, force: true })
})

describe('プロジェクト', () => {
  it('許可のあるプロジェクトは通り、許可の無いプロジェクトは 404', async () => {
    expect(await statusOf(requireProjectName(eventOf(guest), 'alpha'))).toBe('ok')
    expect(await statusOf(requireProjectName(eventOf(guest), 'beta'))).toBe(404)
  })

  it('管理者はどのプロジェクトも通る', async () => {
    expect(await statusOf(requireProjectName(eventOf(admin), 'beta'))).toBe('ok')
  })
})

describe('セッションの id', () => {
  it('作成途中のストロークは始めた本人だけが通る', async () => {
    expect(await statusOf(requireSession(eventOf(guest), '3f2a0000-0000-4000-8000-000000000001'))).toBe('ok')
    expect(await statusOf(requireSession(eventOf(guest), '3f2a0000-0000-4000-8000-000000000002'))).toBe(404)
    expect(await statusOf(requireSession(eventOf(guest), '3f2a0000-0000-4000-8000-000000000003'))).toBe(404)
  })

  it('昇格したものはプロジェクトの許可で決まる。始めた人かどうかは見ない', async () => {
    expect(await statusOf(requireSession(eventOf(guest), 'alpha'))).toBe('ok')
    expect(await statusOf(requireSession(eventOf(guest), 'beta'))).toBe(404)
  })

  it('一覧は見られる行だけが残る', async () => {
    const rows = ['3f2a0000-0000-4000-8000-000000000001', '3f2a0000-0000-4000-8000-000000000002', 'alpha', 'beta'].map(
      (id) => ({ id }),
    )
    expect((await visibleSessions(eventOf(guest), rows)).map((row) => row.id)).toEqual([
      '3f2a0000-0000-4000-8000-000000000001',
      'alpha',
    ])
  })
})

describe('ユーザー管理', () => {
  it('管理者でなければ 404', async () => {
    expect(await statusOf(requireAdmin(eventOf(guest)))).toBe(404)
    expect(await statusOf(requireAdmin(eventOf(admin)))).toBe('ok')
  })
})

describe('サーバー内部の呼び出し', () => {
  it('internalFetch が付けた内部 token を持つリクエストは、すべてを見られる', async () => {
    await internalFetch('/api/sessions')
    const options = fetchMock.mock.calls[0]![1] as { headers: Headers }
    const headers = Object.fromEntries(options.headers.entries())

    const user = await accessUserOf(eventOf(null, headers))
    expect(user.admin).toBe(true)
    expect(await statusOf(requireProjectName(eventOf(null, headers), 'beta'))).toBe('ok')
  })

  it('内部 token が合わなければ、token も登録も無い接続として判定される', async () => {
    const user = await accessUserOf(eventOf(null, { 'x-stroke-internal': 'wrong' }))
    expect(user.admin).toBe(false)
  })
})
