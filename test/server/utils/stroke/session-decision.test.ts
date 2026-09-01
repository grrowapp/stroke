import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 承認の判断を `state.json` の `proposed` に持つ（openspec/specs/api/session/approve・
 * specs/project/generation「承認の判断を記録することは、phase を動かさない」）。
 *
 * 判断は局面ではなく、局面の中の印である。ここで固定するのは3つ——判断を持つ `state.json` が
 * 読めること／持たない既存の `state.json` が「判断なし」として読めること／判断を書いても
 * `phase` が `proposed` のままであること。
 *
 * `session-store.ts` は Nitro の自動 import（`useRuntimeConfig` / `createError`）を全域の
 * 名前として使う。`createError` は全域に置けば捕まるが、`useRuntimeConfig` は Nuxt アプリ側の
 * 自動 import（`#app/nuxt`）が差し込まれ、Nuxt アプリが無いと投げる（`NUXT_E1001`）。
 * そちらは差し込み先を差し替えて、保存先を一時ディレクトリへ向ける。
 */

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444'

// `vi.mock` は巻き上げられるので、その中から触るものは `vi.hoisted` に置く
const share = vi.hoisted(() => ({ root: '' }))

vi.mock('#app/nuxt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRuntimeConfig: () => ({ projectShareRoot: share.root }),
}))

vi.stubGlobal(
  'createError',
  (input: { statusCode: number; message: string }) => Object.assign(new Error(input.message), input),
)

const store = await import('../../../../server/utils/stroke/session-store')
const { decisionOf, readState, withDecision, withoutDecision, writeState } = store

async function seed(id: string, state: Record<string, unknown>): Promise<void> {
  await mkdir(join(share.root, id), { recursive: true })
  await writeFile(join(share.root, id, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function rawState(id: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(share.root, id, 'state.json'), 'utf8'))
}

beforeAll(async () => {
  share.root = await mkdtemp(join(tmpdir(), 'decision-'))
})

describe('承認の判断の置き場', () => {
  it('判断を持つ state.json が読め、判断が取り出せる', async () => {
    await seed(SESSION, {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 0,
      decision: { projectName: 'decided-app' },
    })

    const state = await readState(SESSION)

    expect(state.phase).toBe('proposed')
    expect(decisionOf(state)).toEqual({ projectName: 'decided-app' })
  })

  it('判断を持たない既存の state.json は「判断なし」として読める', async () => {
    await seed(SESSION, { phase: 'proposed', currentQuestion: null, invocation: 'idle' })

    const state = await readState(SESSION)

    expect(state.phase).toBe('proposed')
    expect(decisionOf(state)).toBeUndefined()
  })

  it('proposed 以外は判断を持ちえない', async () => {
    await seed(SESSION, { phase: 'approved', projectName: 'made', invocation: 'idle' })

    expect(decisionOf(await readState(SESSION))).toBeUndefined()
  })

  it('判断を書いても phase は proposed のまま。他のフィールドも動かない', async () => {
    await seed(SESSION, {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 2,
      projectName: 'candidate',
    })
    const before = await readState(SESSION)
    if (before.phase !== 'proposed') throw new Error('前提: proposed')

    await writeState(SESSION, withDecision(before, { projectName: 'decided-app' }))

    const raw = await rawState(SESSION)
    expect(raw.phase).toBe('proposed')
    expect(raw.decision).toEqual({ projectName: 'decided-app' })
    expect(raw.retries).toBe(2)
    expect(raw.projectName).toBe('candidate')
    expect(raw.invocation).toBe('idle')
  })

  it('判断を取り下げると decision だけが消え、phase は proposed のまま', async () => {
    await seed(SESSION, {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      decision: { projectName: 'decided-app' },
    })
    const before = await readState(SESSION)
    if (before.phase !== 'proposed') throw new Error('前提: proposed')

    await writeState(SESSION, withoutDecision(before))

    const raw = await rawState(SESSION)
    expect(raw.phase).toBe('proposed')
    expect('decision' in raw).toBe(false)
    expect(raw.invocation).toBe('idle')
  })

  it('空の名前は判断として成立しない（読めない）', async () => {
    await seed(SESSION, {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      decision: { projectName: '   ' },
    })

    await expect(readState(SESSION)).rejects.toThrow('state.json が壊れている')
  })

  it('判断を書く口は proposed 以外を受け付けない（型で止まる）', () => {
    const approved = { phase: 'approved', projectName: 'made', invocation: 'idle' } as const
    // @ts-expect-error `withDecision` は ProposedState だけを受ける。phase を動かす書き方は通らない
    const attempt = () => withDecision(approved, { projectName: 'x' })
    expect(typeof attempt).toBe('function')
  })
})
