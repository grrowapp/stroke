import { afterEach, describe, expect, it } from 'vitest'

import { awaitReap, beginReap, resetReapGateForTest } from '../../../../server/utils/stroke/reap-gate'

/**
 * 後始末（`01.reap-running.ts`）と巡回（`01.retry-failed.ts`）の順序の担保
 * （`fix-orphan-run-on-restart` tasks 3.1・3.2・4.5）。
 *
 * Nitro のプラグイン実行順そのものはここでは確かめられない（`defineNitroPlugin` は
 * Nitro の外から呼べない）。ここで固定するのは、両プラグインが実際に配線している門
 * （`beginReap` / `awaitReap`）の振る舞いである——
 *
 * - 後始末が終わるまで `awaitReap()` は解決しない（後始末より先に巡回を始めさせない）
 * - 後始末が失敗して終わっても `awaitReap()` は解決する（reject しない）
 * - `beginReap` が一度も呼ばれていなければ、`awaitReap()` は即座に解決する（後始末プラグイン
 *   が無効化・削除されても巡回が永久に止まらないための保険）
 */

afterEach(() => {
  resetReapGateForTest()
})

describe('awaitReap', () => {
  it('beginReap が呼ばれていなければ即座に解決する', async () => {
    await expect(awaitReap()).resolves.toBeUndefined()
  })

  it('後始末が終わるまで解決しない', async () => {
    let finish = (): void => {}
    beginReap(new Promise<void>((resolve) => { finish = resolve }))

    let resolved = false
    void awaitReap().then(() => { resolved = true })

    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(false)

    finish()
    await awaitReap()
    expect(resolved).toBe(true)
  })

  it('後始末が失敗して終わっても解決する（reject しない）', async () => {
    let fail = (_error: Error): void => {}
    beginReap(new Promise<void>((_resolve, reject) => { fail = reject }))

    fail(new Error('後始末に失敗'))

    await expect(awaitReap()).resolves.toBeUndefined()
  })

  it('複数回 await しても、後始末は1回しか走っていないことが前提のまま毎回同じ結果になる', async () => {
    let calls = 0
    beginReap((async () => {
      calls += 1
    })())

    await awaitReap()
    await awaitReap()

    expect(calls).toBe(1)
  })
})
