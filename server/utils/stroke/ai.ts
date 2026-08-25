import type { Invocation } from '#shared/stroke'
import { runClaude, type ClaudeLaunch, type ClaudeMode } from './claude'
import { LOG_PREFIX } from './log'

/**
 * 1回の呼び出しに要るものすべて。
 *
 * 起動定義・定型・作業場所は呼び出し側が設定から引いて渡す。invokeAi は設定を引かない
 * （openspec/specs/agent/invocation「起動処理の内部で設定値を引き直してはならない」）。
 * 用途の違い（ストロークの往復 / 承認後の steering）は、渡す値の違いだけで表す。
 */
export interface AiRun {
  /** `claude` の起動定義。呼び出し側が要るフラグを足して渡してよい */
  launch: ClaudeLaunch
  /** `claude -p` の cwd。AI が書く生成物はここへ落ちる */
  cwd: string
  /** 定型の**候補**。どちらを使うかは invokeAi が初回/継続の判定で決める */
  prompts: { first: string, continue: string }
  /** 失敗を起こし直す回数の上限。到達していたら起動しない */
  maxRetries: number
  /** これまでに起こし直した回数。`state.json` 側が持つ */
  retries: number
  /**
   * 会話の続け先。**あるかどうかが初回/継続の判定そのものである。**
   *
   * - ストローク: 自前採番の uuid。スキルが `${CLAUDE_SESSION_ID}` でセッション id を
   *   知る前提（docs/specs/architecture/session-workflow.md）に効くので必ず渡す。
   *   初回か継続かは `hasConversation` が決める
   * - steering: 初回は `undefined`（claude に採番させる）。走った後に `remember` で
   *   受け取った id が次回の続き先になる
   */
  conversationId?: string
  /**
   * 続き先が既に在るか。`true` なら `--resume`、`false` なら新しい会話として始める。
   *
   * ストロークは実体の揃ったセッション一覧との符合から、steering は覚えている会話 id の
   * 有無から決まる。どちらも呼び出し側が事実を渡すだけで、**どの定型を使うかの指示では
   * ない**（それは invokeAi が決める）。
   */
  hasConversation: () => Promise<boolean>
  /** 実行の記録を書く。A8（`POST /api/strokes/:id/submission`）を通す */
  setInvocation: (invocation: Invocation, retries?: number) => Promise<void>
  /** 走った会話の id を覚える。続きが要る用途だけ渡す */
  remember?: (conversationId: string) => Promise<void>
  /** 初回と判定されたときに実行環境を整える。要らない用途では省く */
  prepare?: () => Promise<void>
}

/**
 * AI を呼ぶ。呼び出し側は結果を待たない（design.md 決定2・6: HTTP は受理・返却して
 * 即完結する）。
 *
 * **完了は子プロセスの output stream で検知する**（openspec/specs/agent/invocation）。
 * `--output-format json` の成功エンベロープが出たらその実行は終わりで、`invocation` を
 * `idle` に変える。AI 自身に完了を告知させない。時間切れ・異常終了は `failed`。
 *
 * `invocation` の書き込みはすべて `setInvocation`（A8）を通る。起動で `running`、
 * 完了で `idle`、失敗で `failed`、リトライ上限に達したら起動せず `error`（終端）。
 *
 * 呼び出し側は、この呼び出しを始める前に `beginRun(sessionId)` を済ませ、返ってきた
 * promise に `.finally(() => endRun(sessionId))` を付けること（busy ガードの対称性）。
 */
export async function invokeAi(sessionId: string, run: AiRun): Promise<void> {
  const {
    launch, cwd, prompts, maxRetries, retries,
    conversationId, hasConversation, setInvocation, remember, prepare,
  } = run

  // 上限判定は起動の前。到達していたら起こさず終端へ倒し、ユーザーに引き渡す。
  if (retries >= maxRetries) {
    console.warn(`${LOG_PREFIX} リトライ上限に達した: ${sessionId}（${retries}/${maxRetries}）`)
    await setInvocation('error')
    return
  }

  await setInvocation('running', retries + 1)

  const continuing = await hasConversation()

  if (!continuing && prepare) {
    // 実行環境（openspec ルート初期化 + config.yaml）は初回に整える（ユーザー決定）。
    try {
      await prepare()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, [`実行環境を作れない: ${detail}`])
      await setInvocation('failed')
      return
    }
  }

  let mode: ClaudeMode = continuing ? 'resume' : 'new'
  let prompt = continuing ? prompts.continue : prompts.first
  let id = conversationId
  const failures: string[] = []

  for (let attempt = retries; attempt < maxRetries; attempt += 1) {
    const result = await runClaude({ sessionId: id, launch, cwd, prompt, mode })

    if (result.ok) {
      // output stream の成功エンベロープ = 完了。会話 id を覚えて平常へ返す。
      if (remember && result.sessionId !== null) await remember(result.sessionId)
      await setInvocation('idle', 0)
      return
    }

    failures.push(result.detail)
    if (result.sessionMissing) {
      if (continuing) {
        // 往復の途中で継続先を失った。ここから新しい会話で始め直すと、概要も過去の
        // ストロークも無いところへ入力だけを流し込むことになる。
        failures.push('継続先の会話が失われた（初回ではないので作り直さない）')
        break
      }
      // 初回。継続先が無い = 履歴には何も入っていない。送り直してよい。
      mode = 'new'
      prompt = prompts.first
      continue
    }

    mode = 'resume'
    prompt = prompts.continue
    id = conversationId
  }

  // 尽きた。`failed` は巡回（openspec/specs/portal/batch）が拾って起こし直す。
  // 回数が上限に届いていれば、次のキックが `error` へ倒す。
  console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, failures)
  await setInvocation('failed')
}
