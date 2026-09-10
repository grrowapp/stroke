import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  forgetLaunchSubmission,
  hasLaunchSubmission,
  launchSubmissionKinds,
  recordLaunchSubmission,
  recordLaunchSubmissionIfActive,
} from '../../../../server/utils/stroke/submission-signal'
import { registerConnection, removeConnection } from '../../../../server/utils/mcp/connection-table'

/**
 * 提出の記録（change fix-rename-during-running-session）。
 *
 * 見るのは3つ。**単位が起動（接続 token）であること**——次の起動が前の起動の提出を自分の
 * 作業として数えない。**何が提出されたかを持つこと**——invokeAi の決着はこれを材料にする。
 * そして**起動が終わった後は記録しないこと**——誰も捨てない記録を残さない。
 */

const TOKEN = 'token-1'
const OTHER = 'token-2'

afterEach(() => {
  forgetLaunchSubmission(TOKEN)
  forgetLaunchSubmission(OTHER)
  removeConnection(TOKEN)
  removeConnection(OTHER)
})

describe('起動単位の提出の記録', () => {
  it('記録が無い起動は、何も提出されていない', () => {
    expect(hasLaunchSubmission(TOKEN)).toBe(false)
    expect([...launchSubmissionKinds(TOKEN)]).toEqual([])
  })

  it('何が提出されたかを持つ', () => {
    recordLaunchSubmission(TOKEN, 'question')

    expect(hasLaunchSubmission(TOKEN)).toBe(true)
    expect(launchSubmissionKinds(TOKEN).has('question')).toBe(true)
    expect(launchSubmissionKinds(TOKEN).has('proposal')).toBe(false)
  })

  it('同じ起動の複数の提出は種別ごとに積まれる', () => {
    recordLaunchSubmission(TOKEN, 'question')
    recordLaunchSubmission(TOKEN, 'question')
    recordLaunchSubmission(TOKEN, 'proposal')

    expect([...launchSubmissionKinds(TOKEN)].sort()).toEqual(['proposal', 'question'])
  })

  it('別の起動の提出は混ざらない', () => {
    recordLaunchSubmission(OTHER, 'proposal')

    expect(hasLaunchSubmission(TOKEN)).toBe(false)
    expect([...launchSubmissionKinds(TOKEN)]).toEqual([])
  })

  it('起動が終わったら記録は消える。次の起動は前の分を数えない', () => {
    recordLaunchSubmission(TOKEN, 'proposal')
    forgetLaunchSubmission(TOKEN)

    expect(hasLaunchSubmission(TOKEN)).toBe(false)
    expect([...launchSubmissionKinds(TOKEN)]).toEqual([])
  })
})

describe('recordLaunchSubmissionIfActive', () => {
  it('起動がまだ実行中なら記録する', () => {
    registerConnection(TOKEN, { sessionId: 'session-1' })

    recordLaunchSubmissionIfActive(TOKEN, 'proposal')

    expect(launchSubmissionKinds(TOKEN).has('proposal')).toBe(true)
  })

  it('起動が畳まれた後は記録しない（誰も捨てない記録を残さない）', () => {
    // 打ち切りで実行が先に畳まれた後、飛行中の提出が戻ってくる場面
    registerConnection(TOKEN, { sessionId: 'session-1' })
    removeConnection(TOKEN)

    recordLaunchSubmissionIfActive(TOKEN, 'proposal')

    expect(hasLaunchSubmission(TOKEN)).toBe(false)
  })

  it('token を持たない呼び出しは記録しない', () => {
    expect(() => recordLaunchSubmissionIfActive(undefined, 'question')).not.toThrow()
    expect(hasLaunchSubmission(TOKEN)).toBe(false)
  })

  it('判定と記録の間に await を挟まない（同期の1ブロック）', () => {
    // 片付けは同期なので、間に await が無ければ「片付けの前」か「後」のどちらかにしかならない。
    // 実装が同期であることを、呼び出しが Promise を返さないことで固定する
    registerConnection(TOKEN, { sessionId: 'session-1' })
    const returned = recordLaunchSubmissionIfActive(TOKEN, 'question') as unknown

    expect(returned).toBeUndefined()
    expect(vi.isMockFunction(recordLaunchSubmissionIfActive)).toBe(false)
  })
})
