import { describe, expect, it } from 'vitest'

import type { Invocation, SessionSummary } from '#shared/stroke'
import { activateApproved, activateResultOf, type ActivateResult } from '../../../../server/utils/stroke/activate-approved'

/**
 * 起動時の書き上げ（add-activated-phase design D9）。
 *
 * 見るのは、**対象の選び方**——`approved` かつ実行の記録が `idle`（導入前に生成を終えて
 * いたもの）だけ——と、409 を生成中のまま数えること、1件の失敗で他の件が止まらないこと。
 * ここが判定の在り処である。U15 は判定を持たない（ADR-0014）ので、ファイルシステムを見て
 * 成果物を数える判定はどちらにも無い。
 */

function summary(
  id: string,
  phase: SessionSummary['phase'],
  invocation: Invocation = 'idle',
): SessionSummary {
  return { id, phase, updatedAt: '2026-09-02T00:00:00.000Z', path: `/tmp/share/${id}`, invocation }
}

function deps(results: Record<string, ActivateResult | Error>) {
  const called: string[] = []
  return {
    called,
    deps: {
      activate: async (id: string): Promise<ActivateResult> => {
        called.push(id)
        const result = results[id] ?? 'activated'
        if (result instanceof Error) throw result
        return result
      },
    },
  }
}

describe('activateApproved', () => {
  it('approved かつ idle だけに U15 を叩く。他の phase と unknown は触らない', async () => {
    const { called, deps: d } = deps({})

    const counts = await activateApproved([
      summary('s1', 'stroking'),
      summary('s2', 'proposed'),
      summary('p1', 'approved'),
      summary('p2', 'activated'),
      summary('x', 'unknown'),
    ], d)

    expect(called).toEqual(['p1'])
    expect(counts).toEqual({ activated: 1, notYet: 0, failed: 0 })
  })

  it('生成が終わっていない approved は触らない（failed / error / running）', async () => {
    // `failed` と `error` は生成が終わっていないもの（巡回とユーザーの再実行が拾う）。
    // `running` は起動時の後始末（01.reap-running.ts）が `failed` へ倒す途中である
    const { called, deps: d } = deps({})

    const counts = await activateApproved([
      summary('p1', 'approved', 'failed'),
      summary('p2', 'approved', 'error'),
      summary('p3', 'approved', 'running'),
      summary('p4', 'approved', 'idle'),
    ], d)

    expect(called).toEqual(['p4'])
    expect(counts).toEqual({ activated: 1, notYet: 0, failed: 0 })
  })

  it('完成済み（activated）は idle でも叩かない', async () => {
    const { called, deps: d } = deps({})

    const counts = await activateApproved([summary('p1', 'activated', 'idle')], d)

    expect(called).toEqual([])
    expect(counts).toEqual({ activated: 0, notYet: 0, failed: 0 })
  })

  it('409 は「生成中のまま残す」として数える', async () => {
    const { deps: d } = deps({ p1: 'not-yet', p2: 'activated' })

    const counts = await activateApproved([summary('p1', 'approved'), summary('p2', 'approved')], d)

    expect(counts).toEqual({ activated: 1, notYet: 1, failed: 0 })
  })

  it('1件が失敗しても他の件は続ける', async () => {
    const { called, deps: d } = deps({ p1: 'failed', p2: 'activated', p3: 'activated' })

    const counts = await activateApproved(
      [summary('p1', 'approved'), summary('p2', 'approved'), summary('p3', 'approved')],
      d,
    )

    expect(called).toEqual(['p1', 'p2', 'p3'])
    expect(counts).toEqual({ activated: 2, notYet: 0, failed: 1 })
  })

  it('依存が投げても他の件は続け、投げた分は failed に数える', async () => {
    const { called, deps: d } = deps({ p1: new Error('boom'), p2: 'activated' })

    const counts = await activateApproved([summary('p1', 'approved'), summary('p2', 'approved')], d)

    expect(called).toEqual(['p1', 'p2'])
    expect(counts).toEqual({ activated: 1, notYet: 0, failed: 1 })
  })

  it('対象が1件も無ければ何も叩かない', async () => {
    const { called, deps: d } = deps({})

    const counts = await activateApproved([summary('s1', 'stroking'), summary('p2', 'activated')], d)

    expect(called).toEqual([])
    expect(counts).toEqual({ activated: 0, notYet: 0, failed: 0 })
  })
})

describe('activateResultOf', () => {
  it('409 だけが not-yet。他はすべて failed', () => {
    expect(activateResultOf(Object.assign(new Error('x'), { statusCode: 409 }))).toBe('not-yet')
    expect(activateResultOf(Object.assign(new Error('x'), { status: 409 }))).toBe('not-yet')
    expect(activateResultOf(Object.assign(new Error('x'), { statusCode: 404 }))).toBe('failed')
    expect(activateResultOf(Object.assign(new Error('x'), { statusCode: 500 }))).toBe('failed')
    expect(activateResultOf(new Error('fetch failed'))).toBe('failed')
    expect(activateResultOf(undefined)).toBe('failed')
  })
})
