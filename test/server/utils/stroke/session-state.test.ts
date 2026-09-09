import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { PHASES, isPhase, isPromotedPhase } from '../../../../shared/stroke'

/**
 * 昇格後の `state.json` の形（openspec/changes/add-activated-phase design D1・D2）。
 *
 * `activated` は `approved` と同じ形で、違うのは phase の値だけ。完成の記録は phase を
 * 変えるだけで `runId` も `invocation` も触らない。足場は `session-decision.test.ts` と同じ。
 */

const NAME = 'made-app'

const share = vi.hoisted(() => ({ root: '' }))

vi.mock('#app/nuxt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRuntimeConfig: () => ({ projectShareRoot: share.root }),
}))

vi.stubGlobal(
  'createError',
  (input: { statusCode: number; message: string }) => Object.assign(new Error(input.message), input),
)

const { readState, withStateLock, writeInvocation, writeState } = await import('../../../../server/utils/stroke/session-store')

async function seed(id: string, state: Record<string, unknown>): Promise<void> {
  await mkdir(join(share.root, id), { recursive: true })
  await writeFile(join(share.root, id, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function rawState(id: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(share.root, id, 'state.json'), 'utf8'))
}

beforeAll(async () => {
  share.root = await mkdtemp(join(tmpdir(), 'state-'))
})

afterAll(async () => {
  await rm(share.root, { recursive: true, force: true })
})

/**
 * 読んで書くの直列化（レビュー指摘: 起動時に A8 と U15 が同じ `state.json` を古い写しで
 * 上書きしうる）。同じ id の区間は順に走り、別の id は待たない。
 */
describe('withStateLock', () => {
  it('同じ id の区間は前の区間が終わるまで始まらない', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const first = withStateLock('same', async () => {
      order.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push('first:end')
    })
    const second = withStateLock('same', async () => {
      order.push('second:start')
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(order).toEqual(['first:start'])

    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('別の id は待たない', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const first = withStateLock('a', async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push('a')
    })
    await withStateLock('b', async () => {
      order.push('b')
    })
    expect(order).toEqual(['b'])
    releaseFirst()
    await first
  })

  it('区間が投げても次の区間は走る', async () => {
    await expect(withStateLock('x', async () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    expect(await withStateLock('x', async () => 'ran')).toBe('ran')
  })

  it('invocation と phase を同時に書いても互いを上書きしない', async () => {
    await seed(NAME, { phase: 'approved', projectName: NAME, invocation: 'running', retries: 0 })

    // A8 相当（invocation）と U15 相当（phase）の read-modify-write を同時に始める
    await Promise.all([
      writeInvocation(NAME, 'failed'),
      withStateLock(NAME, async () => {
        const state = await readState(NAME)
        await writeState(NAME, { ...state, phase: 'activated' })
      }),
    ])

    const raw = await rawState(NAME)
    expect(raw.phase).toBe('activated')
    expect(raw.invocation).toBe('failed')
  })
})

describe('phase の値の集合（shared/stroke.ts）', () => {
  it('4つの値を一方向の順に持つ', () => {
    expect(PHASES).toEqual(['stroking', 'proposed', 'approved', 'activated'])
  })

  it('isPhase は集合に含まれる値だけを通す', () => {
    expect(isPhase('activated')).toBe(true)
    expect(isPhase('done')).toBe(false)
    expect(isPhase(undefined)).toBe(false)
  })

  it('isPromotedPhase は approved と activated だけを昇格済みとする', () => {
    expect(PHASES.filter(isPromotedPhase)).toEqual(['approved', 'activated'])
  })
})

describe('昇格後の state.json', () => {
  it('activated の state.json が読め、runId が保たれる', async () => {
    await seed(NAME, { phase: 'activated', projectName: NAME, invocation: 'idle', retries: 1, runId: 'run-1' })

    const state = await readState(NAME)

    expect(state.phase).toBe('activated')
    if (state.phase !== 'activated') throw new Error('前提: activated')
    expect(state.projectName).toBe(NAME)
    expect(state.runId).toBe('run-1')
    expect(state.retries).toBe(1)
  })

  it('invocation を持たない activated は idle として読める（approved と同じ既定値）', async () => {
    await seed(NAME, { phase: 'activated', projectName: NAME })

    const state = await readState(NAME)

    expect(state.invocation).toBe('idle')
  })

  it('completion は phase だけを変え、他のフィールドを触らない', async () => {
    await seed(NAME, { phase: 'approved', projectName: NAME, invocation: 'running', retries: 2, runId: 'run-9' })
    const before = await readState(NAME)
    if (before.phase !== 'approved') throw new Error('前提: approved')

    await writeState(NAME, { ...before, phase: 'activated' })

    const raw = await rawState(NAME)
    expect(raw.phase).toBe('activated')
    expect(raw.invocation).toBe('running')
    expect(raw.retries).toBe(2)
    expect(raw.runId).toBe('run-9')
    expect(raw.projectName).toBe(NAME)
  })

  it('集合に無い phase は読めない', async () => {
    await seed(NAME, { phase: 'done', projectName: NAME, invocation: 'idle' })

    await expect(readState(NAME)).rejects.toThrow('state.json が壊れている')
  })
})
