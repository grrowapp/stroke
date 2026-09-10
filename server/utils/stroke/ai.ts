import type { Invocation } from '#shared/stroke'
import { runClaude, type ClaudeLaunch, type ClaudeMode } from './claude'
import { readStrokeConfig } from './config'
import { LOG_PREFIX } from './log'
import { submissionPath } from './submission-path'

/**
 * 1回の呼び出しに要るものすべて。
 *
 * 起動定義・定型・作業場所は呼び出し側が設定から引いて渡す。**組み立て済みの `AiRun` を
 * 受け取った後の invokeAi は設定を引き直さない**
 * （openspec/specs/agent/invocation「起動処理の内部で設定値を引き直してはならない」）。
 * 用途の違い（ストロークの往復 / 承認後の steering）は、渡す値の違いだけで表す。
 *
 * **組み立てそのもの（`buildRun`）は invokeAi の内側で行う**
 * （fix-idle-stuck-on-run-build-failure design.md D1）。組み立てに失敗した実行の記録
 * （`failed`/`error`）を書くのも invokeAi であって、呼び出し側（`kick`）ではない——
 * 「`invocation` を書くのは invokeAi だけ」という規定を保つためである。組み立てに
 * 失敗すると `AiRun` そのものが存在しないので、上のスカラーで言う「設定を引き直さない」は
 * この失敗記録の書き込みには及ばない（組み立ての失敗を判定するための最小限の読み出しは
 * 別に持つ。下の `recordBuildFailure` を見よ）。
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
  /** 失敗を起動し直す回数の上限。到達していたら起動しない */
  maxRetries: number
  /** これまでに起動し直した回数。`state.json` 側が持つ */
  retries: number
  /** 起動し直していない起動を打ち切るまでの時間。`runtimeConfig.claude.timeoutMs` */
  timeoutMs: number
  /** 起動し直し1回ぶんの刻み。`0` なら伸ばさない。`runtimeConfig.claude.timeoutStepMs` */
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
   * 実行が必ず提出（A5・A7）で終わるので、提出が無ければ作業をしていない。steering は
   * 実行の終わりに invoke-agent が本家 REST へ問い合わせ、3本の文書と承認依頼が本家に
   * 在るかで答える（`invoke.ts` の `steeringCompletedUpstream`。判定は終了時点の本家の
   * 状態で行い、起動ごとの記録は持たない——`docs/specs/architecture/invoke-agent.md`）。
   * 本家への問い合わせを含むので非同期である。渡さなければ常に「行われた」とみなす——
   * 今はどの用途も渡すので、この既定は工程を問わない安全弁として残る。
   */
  didWork?: () => Promise<boolean>
  /**
   * **完成を記録する**。`didWork` と同じ置き方で、渡されているときだけ呼ぶ。
   *
   * 生成中のプロジェクト（phase が `approved`）の steering だけが渡す（`invoke.ts`）。
   * **`didWork` が true のときだけ呼ぶ**——完成したかを決めるのは `didWork`（3本の文書と
   * その承認依頼が本家に在るか）で、記録先の U15 は判定を持たない
   * （ADR-0014・add-activated-phase design D3・D4）。記録が受理されなければ `failed` に
   * 倒す——404・409・不達はどれも「記録できていない」であり、`idle` にすると完成の記録が
   * 無いまま完了になる。
   *
   * invokeAi はいつ叩くかを判定しない。関数が渡されているかどうかが判定の結果である。
   */
  recordCompletion?: () => Promise<boolean>
  /** 走った会話の id を覚える。続きが要る用途だけ渡す */
  remember?: (conversationId: string) => Promise<void>
  /** 初回と判定されたときに実行環境を整える。要らない用途では省く */
  prepare?: () => Promise<void>
}

/**
 * `invokeAi` の戻り値。**2つの完結点を持つ**（fix-idle-stuck-on-run-build-failure
 * design.md D1・D2）。
 */
export interface InvokeAiOutcome {
  /**
   * 組み立ての成否**だけ**を表す。組み立てに失敗すれば reject し、成功すれば resolve
   * する。**AI の応答の完了は待たない。** 起動を要求した側（U13）はここまでだけを待って
   * よい（openspec/specs/api/session/invoke-agent「応答が待つのはその成否まで」）。
   */
  built: Promise<void>
  /**
   * 実行全体の完了。busy ガード解除・接続表 token の削除はここに紐づける
   * （呼び出し側 `kick` の docstring）。組み立てに失敗しても、その記録
   * （`failed`/`error`）を書き終えたところで resolve する——reject しない。
   */
  settled: Promise<void>
}

/**
 * AI を呼ぶ。呼び出し側は結果を待たない（design.md 決定2・6: HTTP は受理・返却して
 * 即完結する）。
 *
 * **完了は子プロセスの output stream で検知する**（openspec/specs/agent/invocation）。
 * `--output-format json` の成功エンベロープが出たらその実行は終わりで、`invocation` を
 * `idle` に変える。AI 自身に完了を告知させない。時間切れ・異常終了は `failed`。
 *
 * `invocation` の書き込みはすべて A8 を通る。起動で `running`、完了で `idle`、失敗で
 * `failed`、リトライ上限に達したら起動せず `error`（終端）。**起動の材料を組み立てられ
 * ずに終わった実行も同じ扱いに含める**（fix-idle-stuck-on-run-build-failure）——組み立ては
 * この関数の内側で行い、失敗すれば `failed`/`error` を書く。書き手を `invokeAi` の外へ
 * 出さない。
 *
 * 呼び出し側は、`settled` に `.finally(() => endRun(sessionId))` を付けること
 * （busy ガードの対称性）。`built` は応答の可否だけを見るためのもので、busy ガードには
 * 使わない。
 */
export function invokeAi(
  sessionId: string,
  retries: number,
  // 組み立ては非同期になりうる（steering は材料を返す前に生成（P2）を依頼する。
  // `invoke.ts` の `kick`）。同期の throw も reject も同じ「組み立ての失敗」として扱い、
  // ここでは判定を足さない（update-project-generation-via-upstream-rest design D2）
  build: () => AiRun | Promise<AiRun>,
): InvokeAiOutcome {
  let resolveBuilt!: () => void
  let rejectBuilt!: (error: unknown) => void
  const built = new Promise<void>((resolve, reject) => {
    resolveBuilt = resolve
    rejectBuilt = reject
  })
  // `built` の reject は呼び出し側（`kick` 経由で U13）が拾う。ここでも拾っておくのは、
  // 拾い手が付く前の一瞬に unhandledRejection として騒がれないための保険であって、
  // エラーを握りつぶす意図ではない（`settled` 側で記録・ログの両方を行う）。
  built.catch(() => {})

  const settled = (async () => {
    let run: AiRun
    try {
      run = await build()
    } catch (error) {
      rejectBuilt(error)
      await recordBuildFailure(sessionId, retries, error)
      return
    }
    resolveBuilt()
    await runBuiltInvocation(sessionId, run)
  })()

  return { built, settled }
}

/**
 * 起動の材料を組み立てられなかった実行を記録する。
 *
 * **この失敗も起動し直しの回数に数える**（`retries + 1`）。上限に達していなければ
 * `failed`（巡回が拾う）、達しているか上限そのものを読み出せなければ `error`（終端）
 * にする（design.md D3）。
 *
 * 組み立てが失敗した以上、その組み立てが読むはずだった `maxRetries` は
 * `run.maxRetries` からは得られない。ここだけ独立して `readStrokeConfig()` を試す——
 * 呼べて読めれば「上限に達している/いない」を判定でき、呼べなければ「上限そのものを
 * 読み出せない」として `error` に倒す。`buildRun` を丸ごと再実行するわけではないので、
 * 組み立てが2回走ることにはならない。
 */
async function recordBuildFailure(sessionId: string, retries: number, error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error)
  const nextRetries = retries + 1

  let maxRetries: number | undefined
  try {
    maxRetries = readStrokeConfig().claude.maxRetries
  } catch {
    maxRetries = undefined
  }

  if (maxRetries !== undefined && retries <= maxRetries) {
    console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, [`起動の材料を組み立てられない: ${detail}`])
    await writeInvocation(sessionId, 'failed', nextRetries)
    return
  }

  console.warn(
    `${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`,
    [`起動の材料を組み立てられない（リトライ上限に達した、または上限を読み出せない）: ${detail}`],
  )
  await writeInvocation(sessionId, 'error')
}

/** A8 へ書く。組み立てに失敗した経路専用——`AiRun.setInvocation` は組み立てが成功した
 * ときにしか手に入らないので、ここだけ独立した書き手を持つ。 */
async function writeInvocation(sessionId: string, invocation: Invocation, retries?: number): Promise<void> {
  await $fetch(submissionPath(sessionId), {
    method: 'POST',
    body: { invocation, ...(retries === undefined ? {} : { retries }) },
  })
}

/**
 * 組み立てられた材料で実際に起動する。組み立てが成功した後の処理はここに閉じる
 * （`fix-idle-stuck-on-run-build-failure` で `invokeAi` の本体から切り出した。切り出しの
 * 時点では振る舞いを変えていない。成功経路はその後 `add-activated-phase` で変えている）。
 */
async function runBuiltInvocation(sessionId: string, run: AiRun): Promise<void> {
  const {
    launch, cwd, debugLogDir, prompts, maxRetries, retries, timeoutMs, timeoutStepMs,
    conversationId, hasConversation, setInvocation, remember, prepare, didWork, recordCompletion,
  } = run

  // 上限判定は起動の前。**`retries` は「これまでに起動し直した回数」** なので、初回の
  // キック（0回）は起動し直しではない。超えていたら起動せず終端へ倒し、ユーザーに
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
  // 伸びるのはひと続きの起動し直しの中だけである。完了とユーザーの再実行が `retries` を
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

  // **1回の呼び出しで起動するのは1回だけである。** 起動し直しは巡回（`failed` を拾って
  // U13 を叩く）が担い、回数は `state.json` が持つ。ここで内側にもループを持つと、
  // 巡回の回数と掛け算になって総起動回数が上限の意味から外れる。
  const result = await runClaude({ sessionId: conversationId, launch, cwd, prompt, mode, debugLogDir, timeoutMs: timeout })

  if (result.ok) {
    // 会話 id は作業の成否に関わらず覚える。次のキックはこの続きから始める。
    if (remember && result.sessionId !== null) await remember(result.sessionId)

    // output stream の成功エンベロープ = プロセスは完了した。ただし**何もせずに
    // 終わっている**ことがあるので、用途ごとの確認を通す。
    //
    // 作業をしていなければ失敗として起動し直す——ここを素通しにすると、問いも proposal も
    // 出ないまま `idle` になり、巡回（`failed` しか拾わない）も回収できない詰まりが残る。
    // **完成の記録より先に見る。** 完成したかを決めるのは `didWork` の方で、記録先の U15 は
    // 判定を持たない（ADR-0014・add-activated-phase design D4）。作業をしていない実行が
    // 完成を記録しに行くと、何も出していない対象が完成として畳まれる。
    if (didWork !== undefined && !(await didWork())) {
      console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, ['プロセスは成功したが作業が確認できない'])
      await setInvocation('failed')
      return
    }

    // 作業があった実行のうち、完成の記録を渡されたもの（生成中の steering）だけが記録する。
    // 記録できなければ `failed` に倒す——記録できていないものを完成として `idle` にしない。
    if (recordCompletion !== undefined && !(await recordCompletion())) {
      console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, ['プロセスは成功したが完成を記録できない'])
      await setInvocation('failed')
      return
    }

    await setInvocation('idle', 0)
    return
  }

  const failures = [result.detail]
  if (result.sessionMissing && continuing) {
    // 往復の途中で継続先を失った。ここから新しい会話で始め直すと、概要も過去の
    // ストロークも無いところへ入力だけを流し込むことになる。
    failures.push('継続先の会話が失われた（初回ではないので作り直さない）')
  }

  // `failed` は巡回（openspec/specs/portal/batch）が拾って起動し直す。回数が上限を
  // 超えていれば、次のキックが `error` へ倒してユーザーに引き渡す。
  console.warn(`${LOG_PREFIX} AI 呼び出しが失敗: ${sessionId}`, failures)
  await setInvocation('failed')
}
