import { invokeAi } from '../utils/ai'
import { sessionPrompt } from '../utils/prompt'
import { parseBody, startSessionBody } from '../utils/request-schemas'
import { beginRun, endRun } from '../utils/running'
import { createSession } from '../utils/session-store'

/**
 * U1: 概要でセッションを開始する。HTTP はステートレス（design.md）なので、最初の問いを
 * 待たずに id を発行して即返す。AI の呼び出しはこの応答の後、バックグラウンドで進む
 * （結果は W1 で画面へ届く）。
 */
export default defineEventHandler(async (event): Promise<{ sessionId: string }> => {
  const { overview } = parseBody(startSessionBody, await readBody(event))

  const sessionId = await createSession(overview)

  beginRun(sessionId)
  invokeAi({ sessionId, prompt: sessionPrompt(sessionId), first: true })
    .catch((error) => {
      console.error(`[stroke-board] AI 呼び出しの管理に失敗: ${sessionId}`, error)
    })
    .finally(() => endRun(sessionId))

  return { sessionId }
})
