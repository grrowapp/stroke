import type { SessionView } from '#shared/types'
import { invokeAi } from '../../utils/ai'
import { initialState } from '../../utils/apply-outcome'
import { overviewPrompt } from '../../utils/prompt'
import { parseBody, startSessionBody } from '../../utils/request-schemas'
import { beginRun, endRun } from '../../utils/running'
import { createSession, writeState } from '../../utils/session-store'
import { buildSessionView } from '../../utils/session-view'

/** 概要でセッションを開始し、AI の最初の問いが得られるまで進める。 */
export default defineEventHandler(async (event): Promise<SessionView> => {
  const { overview } = parseBody(startSessionBody, await readBody(event))

  const sessionId = await createSession()

  beginRun(sessionId)
  try {
    // ここが失敗すると `state.json` を書かないので、このディレクトリは「在るセッション」
    // として拾われない。ユーザーは同じ操作をやり直せる。
    const outcome = await invokeAi({ sessionId, prompt: overviewPrompt(overview), first: true })
    const state = initialState(outcome)
    await writeState(sessionId, state)
    return await buildSessionView(sessionId, state)
  } finally {
    endRun(sessionId)
  }
})
