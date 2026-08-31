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
  /** 呼び出しの生出力を書き残すディレクトリ。呼び出し側が設定から引き、無効なら省く */
  debugLogDir?: string
  /** 定型の**候補**。どちらを使うかは invokeAi が初回/継続の判定で決める */
  prompts: { first: string, continue: string }
  /** 失敗を起こし直す回数の上限。到達していたら起動しない */
  maxRetries: number
  /** これまでに起こし直した回数。`state.json` 側が持つ */
  retries: number
  /** 起こし直していない起動を打ち切るまでの時間。`runtimeConfig.claude.timeoutMs` */
  timeoutMs: number
  /** 起こし直し1回ぶんの刻み。`0` なら伸ばさない。`runtimeConfig.claude.timeoutStepMs` */
  timeoutStepMs: number
  /**
   * 会話の続け先。**あるかどうかが初回/継続の判定そのものである。**
   *
   * - ストローク: 自前採番の uuid。**`--resume` で同じ会話へ戻るために必ず渡す**
   *   （id を決めて覚えているのは呼び出し側だけである）。かつて理由に挙げていた
   *   「スキルが `${CLAUDE_SESSION_ID}` で知る」は読み手がもう居ない
   *   （santa-method レビュー指摘 7周目 2026-08-30）。
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
  /**
   * その実行で**作業が行われたか**。完了の検知とは別の問いである。
   *
   * プロセスが正常終了しても、何もせずに終わっていることがある。ストロークは1回の
   * 実行が必ず提出（A5・A7）で終わるので、提出が無ければ作業をしていない。渡さなければ
   * 常に「行われた」とみなす（steering は endpoint へ何も提出しないため渡さない）。
   */
  didWork?: () => boolean
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
    launch, cwd, debugLogDir, prompts, maxRetries, retries, timeoutMs, timeoutStepMs,
    conversationId, hasConversation, setInvocation, remember, prepare, didWork,
  } = run

  // 上限判定は起動の前。**`retries` は「これまでに起こし直した回数」** なので、初回の
  // キック（0回）は起こし直しではない。超えていたら起こさず終端へ倒し、ユーザーに
  // 引き渡す。起動の総回数は「上限 + 1」になる（docs/specs/core/settings-reference.md）。
  if (retries > maxRetries) {
    console.warn(`${LOG_PREFIX} リトライ上限に達した: ${sessionId}（${retries}/${maxRetries}）`)
    await setInvocation('error')
    return
  }

  // 打ち切りまでの長さは**上限判定と同じ `retries`** から決める。初回のキックは 0 なので
  // 刻みが乗らず、`timeoutMs` そのものになる。ここで `retries + 1` を見ると初回から
  // 伸びてしまうので、上限判定の隣に置いて解釈を1箇所に閉じている
  // （openspec/specs/agent/invocation・design.md Decision 2）。
  //
  // 伸びるのはひと続きの起こし直しの中だけである。完了とユーザーの再実行が `retries` を
  // 0 に戻すので、次の連なりは再び `timeoutMs` から始まる。
  const timeout = timeoutMs + timeoutStepMs * retries

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

  const mode: ClaudeMode = continuing ? 'resume' : 'new'
  const prompt = continuing ? prompts.continue : prompts.first

  // **1回の呼び出しで起こすのは1回だけである。** 起こし直しは巡回（`failed` を拾って
  // U13 を叩く）が担い、回数は `state.json` が持つ。ここで内側にもループを持つと、
  // 巡回の回数と掛け算になって総起動回数が上限の意味から外れる。
  const result = await runClaude({ sessionId: conversationId, launch, cwd, prompt, mode, debugLogDir, timeoutMs: timeout })

  if (result.ok) {
    // 会話 id は作業の成否に関わらず覚える。次のキックはこの続きから始める。
    if (remember && result.sessionId !== null) await remember(result.sessionId)

    // output stream の成功エンベロープ = プロセスは完了した。ただし**何もせずに
    // 終わっている**ことがあるので、用途ごとの確認を通す。作業をしていなければ
    // 失敗として起こし直す——ここを素通しにすると、問いも proposal も出ないまま
    // `idle` になり、巡回（`failed` しか拾わない）も回収できない詰まりが残る。
    if (didWork === undefined || didWork()) {
      await setInvocation('idle', 0)
      return
    }

    console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, ['プロセスは成功したが提出が届かない'])
    await setInvocation('failed')
    return
  }

  const failures = [result.detail]
  if (result.sessionMissing && continuing) {
    // 往復の途中で継続先を失った。ここから新しい会話で始め直すと、概要も過去の
    // ストロークも無いところへ入力だけを流し込むことになる。
    failures.push('継続先の会話が失われた（初回ではないので作り直さない）')
  }

  // `failed` は巡回（openspec/specs/portal/batch）が拾って起こし直す。回数が上限を
  // 超えていれば、次のキックが `error` へ倒してユーザーに引き渡す。
  console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, failures)
  await setInvocation('failed')
}
