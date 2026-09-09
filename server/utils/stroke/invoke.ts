import { isPromotedPhase, type Invocation, type Phase, type SessionSummary } from '#shared/stroke'
import { invokeAi, type AiRun, type InvokeAiOutcome } from './ai'
import { readStrokeConfig } from './config'
import { LOG_PREFIX } from './log'
import { initSessionOpenspec } from './openspec'
import { isPromotedState, readState, sessionExists, withStateLock, writeState } from './session-store'
import { forgetLaunchSubmission, hasLaunchSubmission, submissionCount } from './submission-signal'
import { activatePath, submissionPath } from './submission-path'
import { MCP_SERVER_NAME, withMcpToolsAllowed } from '../mcp/allowed-tools'
import { issueConnectionToken, registerConnection, removeConnection } from '../mcp/connection-table'
import { exposedToolsHeaderValue, MCP_TOOLS_HEADER, type McpToolPhase } from '../mcp/exposed-tools'
import { currentApiBaseUrl } from './listen-address'

/**
 * 起動の材料を設定から組み立てる端。
 *
 * `invokeAi` は設定を引かないので、引くのはここである。用途の違いは渡す値の違いだけで
 * 表す（openspec/specs/agent/invocation「起動処理は呼び出し元を区別しない」）。
 */

/** どの用途で起こすか。渡す値の決め方だけが違う。 */
export type RunKind = 'stroke' | 'steering'

/**
 * phase から用途を導く。**phase を見て渡す値を決めるのはここ1箇所**
 * （add-activated-phase design D4）。昇格後（`approved` / `activated`）は steering、
 * それ以外はストロークの往復。
 */
export function kindOf(phase: Phase): RunKind {
  return isPromotedPhase(phase) ? 'steering' : 'stroke'
}

/**
 * サーバー内から U13 を叩く path。cwd を添える（endpoint に導出させない・design.md D5）。
 *
 * **相対パスである。** 自分自身の endpoint を叩くのに外向けの設定値
 * （`claude.apiBaseUrl`）で URL を組むと、待ち受けを変えた瞬間に届かなくなる
 * （実測: E2E の 3199 で `fetch failed`）。Nitro の `$fetch` は相対パスをアプリ内部で
 * 解決するので、ホストもポートも知らなくてよい。
 *
 * 巡回（再キック）がこれを使う。初回の steering は昇格の成功を見た画面が U13 を叩き、
 * 昇格の受け口（U14）は起動を要求しない。endpoint を経由するのは、busy ガードと
 * 前提チェック（503）を通すためである。
 */
export function invokePath(sessionId: string, cwd: string): string {
  return `/api/strokes/${encodeURIComponent(sessionId)}/invoke-agent?cwd=${encodeURIComponent(cwd)}`
}

/**
 * `invocation` を書く口。**A8 を通す**（openspec/specs/agent/invocation）。
 *
 * > `invocation` の書き込みは `invocation` を操作する endpoint（A8）を通してのみ行い、
 * > 書き込むのは invokeAi だけとする SHALL。
 *
 * 同一プロセス内で完結する処理でも endpoint を経由する。直接書くと、書き込み口が
 * 2つになり「A8 を通してのみ」が成立しない。path は相対で、Nitro の `$fetch` が
 * アプリ内部で解決する（自分の待ち受けを知らなくてよい）。
 */
function invocationWriter(sessionId: string) {
  return async (invocation: Invocation, retries?: number): Promise<void> => {
    await $fetch(submissionPath(sessionId), {
      method: 'POST',
      body: { invocation, ...(retries === undefined ? {} : { retries }) },
    })
  }
}

/**
 * 「この時点より後に提出があったか」を答える関数を作る。
 *
 * 起動の前に今の数を控え、呼ばれた時点の数と比べる。完了の検知（output stream）とは
 * 別で、作業が行われたかだけを見る。
 */
function submittedSince(sessionId: string): () => boolean {
  const before = submissionCount(sessionId)
  return () => submissionCount(sessionId) > before
}

/**
 * steering 用の「作業が行われたか」。flontier の `submittedSince` と対だが、比べる前後の
 * 数ではなく起動単位（接続 token）の記録を読む——steering の提出は stroke-board の
 * endpoint を通らず、対象の `sessionId` に結びつける経路が無いため
 * （design.md D1「steering の作業の signal は起動（接続 token）を単位にする」）。
 *
 * 記録者は `submit-document.ts` の steering 分岐（受理された提出だけを記録する）。
 */
function submittedByLaunch(token: string): () => boolean {
  return () => hasLaunchSubmission(token)
}

/**
 * steering の会話 id を `state.json` に覚える。次のキックの続き先になる。
 * 完成の記録（`activated`）をまたいでも同じ会話を続けるので、昇格後ならどちらの局面でも書く。
 */
function conversationWriter(sessionId: string) {
  return async (runId: string): Promise<void> => {
    // 読んで書くの2手は直列化する（A8・U15 と同じ待ち行列）
    await withStateLock(sessionId, async () => {
      const state = await readState(sessionId)
      if (!isPromotedState(state)) return
      await writeState(sessionId, { ...state, runId })
    })
  }
}

/**
 * 完成の記録（U15）を叩く。**A8 と同じく endpoint を通す**——ここは受理されたかどうかを
 * true / false に写すだけで、U15 の側にも判定は無い（ADR-0014）。完成したかを決めたのは
 * 呼び出し元の invokeAi で、この関数はその判定が済んだ後にだけ呼ばれる（`didWork` が
 * true のとき。`ai.ts` の `runBuiltInvocation`）。
 *
 * 2xx 以外は「記録できていない」であり、記録できていないものを完成と扱わない。false を
 * 受けた invokeAi は `failed` に倒し、巡回の起こし直しが続きの実行の完了時にもう一度
 * ここを通る（add-activated-phase design D4・Risks「U15 の不達」）。
 *
 * **例外は、既に完成が記録されている場合だけ。** この実行の起動後に別の書き手（起動時の
 * 書き上げ）が `activated` を書いていると、U15 は「既に完成している」で断る。目的
 * （完成の記録）は果たされているので受理と同じに扱う——断られたら phase を読み直して決める。
 * 判定を U15 の応答の文言に頼らない。
 *
 * 書き上げが `running` を対象から外した（design D9）ので、この窓は狭い——一覧を取ってから
 * U15 を POST するまでの間に起動が挟まったときだけである。それでも残すのは、`failed` に
 * 倒すと完成済みの対象を巡回が起こし直し続けるためで、窓の広さとは別の理由による。
 */
function completionRecorder(sessionId: string) {
  return async (): Promise<boolean> => {
    try {
      await $fetch(activatePath(sessionId), { method: 'POST' })
      return true
    } catch (error) {
      if (await isAlreadyActivated(sessionId)) return true
      console.warn(`${LOG_PREFIX} 完成を記録できない: ${sessionId}`, error instanceof Error ? error.message : error)
      return false
    }
  }
}

/** 既に完成が記録されているか。読めなければ「記録されていない」に倒す */
async function isAlreadyActivated(sessionId: string): Promise<boolean> {
  try {
    return (await readState(sessionId)).phase === 'activated'
  } catch {
    return false
  }
}

/**
 * 起動の材料を作る。
 *
 * @param sessionId  対象の id（昇格後はプロジェクト名がこれにあたる）
 * @param cwd        実行する場所。キックする側が渡す（design.md D5）
 * @param phase      対象の局面。用途（ストロークの往復か steering か）と、完成の記録を
 *                   試みるか（生成中の steering だけ）はここから導く（design D4）
 * @param retries    これまでに起こし直した回数
 * @param runId      steering の会話 id。まだ無ければ undefined
 * @param token      この起動の接続表 token（provide-operations-via-mcp design.md「接続の担保」）
 */
export function buildRun(options: {
  sessionId: string
  cwd: string
  phase: Phase
  retries: number
  runId?: string
  token: string
}): AiRun {
  const { sessionId, cwd, phase, retries, runId, token } = options
  const kind = kindOf(phase)
  const { claude, openspec } = readStrokeConfig()

  // 空 = 無効。無効を undefined へ写すのは設定を引いた端のここで行う
  // （openspec/specs/debug/logging「出力先の設定があるときだけ書かれる」）
  const debugLogDir = claude.debugLogDir === '' ? undefined : claude.debugLogDir

  // MCP の url・STROKE_BASEURL に使う base URL。**設定の固定値ではなく実際の待ち受けから
  // 組み立てる**（provide-operations-via-mcp 続き。`listen-address.ts` の docblock）。
  // dev で listen 前に呼ばれれば throw し、組み立て失敗として `failed` に倒れる
  // （呼び出し元 `invokeAi` の組み立て失敗経路）——巡回が拾い直すころには listen は済んでいる。
  const apiBaseUrl = currentApiBaseUrl()

  if (kind === 'steering') {
    return {
      launch: {
        command: claude.command,
        // 自前 MCP サーバー（provide-operations-via-mcp）を --mcp-config で与えて起こす。
        // MCP ツールは --allowedTools に載っていないと呼べないため、呼び出しごとにここで
        // 足す（tasks 4.5）。
        //
        // **本家 spec-workflow の MCP は並べない。** かつて並べていた（ADR 0011）が、その
        // 目的は起動時の登録簿への自己登録——AI の起動に乗せたプロジェクトの生成——だけで、
        // ツール呼び出しは1つも要らなかった。生成は P2（`POST /api/projects`）が本家 REST へ
        // 依頼するものになり、`kick` が AI を起動する前に済ませる。claude はプロジェクトを
        // 本家に登録する手段を持たない（update-project-generation-via-upstream-rest design D3）。
        args: [
          ...withMcpToolsAllowed(claude.args),
          '--mcp-config',
          mcpConfigFor(cwd, token, apiBaseUrl),
        ],
        apiBaseUrl,
      },
      cwd,
      debugLogDir,
      // 初回も継続も同じ定型。ユーザー入力は無く、続きを促すのも同じ1本で足りる
      prompts: { first: claude.steeringPrompt, continue: claude.steeringPrompt },
      maxRetries: claude.maxRetries,
      retries,
      timeoutMs: claude.timeoutMs,
      timeoutStepMs: claude.timeoutStepMs,
      // 会話 id は自前採番しない。対象のディレクトリ名はプロジェクト名で uuid ではなく、
      // `--session-id` は uuid しか受け付けない（実測）。初回は claude に採番させる
      conversationId: runId,
      hasConversation: async () => runId !== undefined,
      setInvocation: invocationWriter(sessionId),
      // steering の1回の実行は steering 文書の提出（本家が受理したもの）で終わる。
      // プロセスが正常終了しても提出が1つも無ければ、作業をせずに終わったということ
      // なので起こし直す（fix-steering-empty-completion）。この起動の token で読む——
      // steering の提出は stroke-board の endpoint を通らないため、対象の id ではなく
      // 起動そのものを単位に数える（design.md D1）。
      // **この判定が完成の判定そのものである。** 記録先の U15 は判定を持たないので、
      // 生成が終わったかを決めるのはここで渡す `didWork` である（ADR-0014・design D4）。
      didWork: submittedByLaunch(token),
      // 生成中（`approved`）の steering だけが完成を記録する。完成済み（`activated`）の
      // 起こし直しは記録を試みない——完成は一度だけ起こる出来事で、U15 も受理しない
      // （openspec/specs/api/session/activate「既に完成した対象には記録しない」）。
      recordCompletion: phase === 'approved' ? completionRecorder(sessionId) : undefined,
      remember: conversationWriter(sessionId),
      // 作業場所は昇格済みのプロジェクト。`.spec-workflow/` の内部構造は、`kick` が起動の
      // 前に依頼する生成（P2）を受けた本家が作る。整える実行環境は無い
      prepare: undefined,
    }
  }

  return {
    launch: {
      command: claude.command,
      // 自前 MCP サーバー（provide-operations-via-mcp）を足す。既存フラグの並びは変えない。
      // MCP ツールは --allowedTools に載っていないと呼べないため、同じくここで足す（tasks 4.5）。
      args: [
        ...withMcpToolsAllowed(claude.args),
        '--mcp-config',
        mcpToolConfigFor(token, apiBaseUrl, cwd),
      ],
      apiBaseUrl,
    },
    cwd,
    debugLogDir,
    prompts: { first: claude.firstPrompt, continue: claude.continuePrompt },
    maxRetries: claude.maxRetries,
    retries,
    timeoutMs: claude.timeoutMs,
    timeoutStepMs: claude.timeoutStepMs,
    // ストロークは uuid を自前採番して使う。**続きを開くのに要るからである**——次の起動が
    // `--resume <id>` で同じ会話へ戻るには、こちら側が id を決めて覚えているしかない。
    //
    // かつては「スキルが `${CLAUDE_SESSION_ID}` でセッション id を知る前提」を理由に
    // 書いていたが、**その読み手はもう居ない**（`claude.ts` の `STROKE_BASEURL` と同じ）。
    // セッション id を子へ渡しているのは、上の `--mcp-config` に載る接続表の token
    // （`x-stroke-token`）の方である（santa-method レビュー指摘 7周目 2026-08-30）
    conversationId: sessionId,
    // 実体の揃ったセッション（ディレクトリ・openspec ルート・スキーマ設定済み）として
    // 一覧に載っていれば、初回の起動を済ませている = 続き先が在る。
    // **参照は API の応答から得る**（openspec/specs/agent/invocation）。
    hasConversation: async () =>
      (await $fetch<SessionSummary[]>('/api/strokes')).some(s => s.id === sessionId),
    setInvocation: invocationWriter(sessionId),
    // ストロークの1回の実行は必ず提出（A5・A7）で終わる。プロセスが正常終了しても
    // 提出が1つも無ければ、作業をせずに終わったということなので起こし直す。
    didWork: submittedSince(sessionId),
    prepare: () => initSessionOpenspec({
      cwd,
      bin: openspec.bin,
      initArgs: openspec.initArgs,
      schemaName: claude.workflowSchema,
      // 実在の判定を渡す端はここ。消えたセッションのために掘らせない（openspec.ts）
      sessionExists: () => sessionExists(sessionId),
    }),
  }
}

/**
 * 自前 MCP サーバー（provide-operations-via-mcp）を起こす `--mcp-config` の1エントリ。
 *
 * url は `buildRun` が実際の待ち受けから組み立てた `apiBaseUrl`（`listen-address.ts`）を
 * 渡り受けて組み立てる。設定の固定値は使わない（provide-operations-via-mcp 続き）。
 * token はこの起動専用の一時値（接続表 `server/utils/mcp/connection-table.ts`）。
 *
 * 工程は url ではなくヘッダで分ける。`x-mcp-tools` に載せた名前のツールだけが claude の
 * tools 一覧に載るので、その工程で呼べないツールは初めから見えない
 * （`server/utils/mcp/exposed-tools.ts`）。
 *
 * **`x-stroke-cwd` はサーバーが読まないヘッダである。** 起動時の後始末（`reap-match.ts`）が
 * 走っている claude を argv で照合するとき、steering の手がかりは cwd の JSON 文字列が
 * argv に含まれるかどうかである。かつては本家 MCP エントリの `npx` 引数に cwd が載って
 * いたが、その配線を外した（`mcpConfigFor`）ので、代わりにここで argv へ残す
 * （update-project-generation-via-upstream-rest design D4）。
 *
 * ヘッダの値は HTTP の制約で ASCII に限る。cwd は `projectShareRoot`（既定 `/opt/projects`）の
 * 直下で、名前は uuid かプロジェクト名（`project.ts` の `PROJECT_NAME_PATTERN`、ASCII のみ）
 * なので、`projectShareRoot` が ASCII である限り値も ASCII である。エンコードはしない——
 * 照合（`reap-match.ts`）が `JSON.stringify(cwd)` の素の形を見るためで、`projectShareRoot` に
 * 非 ASCII を置く運用はこの前提の外になる。
 */
function mcpToolServerEntry(
  token: string,
  apiBaseUrl: string,
  phase: McpToolPhase,
  cwd: string,
): Record<string, unknown> {
  return {
    type: 'http',
    url: `${apiBaseUrl}/mcp`,
    headers: {
      'x-stroke-token': token,
      [MCP_TOOLS_HEADER]: exposedToolsHeaderValue(phase),
      'x-stroke-cwd': cwd,
    },
  }
}

/** flontier 工程の `--mcp-config`。自前 MCP サーバーのみを持つ。 */
function mcpToolConfigFor(token: string, apiBaseUrl: string, cwd: string): string {
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: mcpToolServerEntry(token, apiBaseUrl, 'flontier', cwd),
    },
  })
}

/**
 * steering 工程の `--mcp-config`。自前 MCP サーバーのみを持つ。
 *
 * `--mcp-config` は JSON 文字列を直接受け取れる（実機確認済み・design.md D7）。
 *
 * **本家 `spec-workflow-mcp` は並べない。** かつては `npx -y @pimzino/spec-workflow-mcp@latest
 * <cwd>` を `SPEC_WORKFLOW_HOME` 付きで並べ、その起動時の自己登録でプロジェクトが本家に
 * 現れていた——プロジェクトの生成が AI のプロセスに乗っていた。生成は P2
 * （`POST /api/projects`）が本家 REST へ依頼するものになり、`kick` が AI を起動する前に
 * 済ませる。配線を外した後、claude はプロジェクトを本家に登録する手段を持たない
 * （openspec/specs/project/generation「AI のプロセスにプロジェクトを生成させてはならない」・
 * update-project-generation-via-upstream-rest design D3）。
 */
function mcpConfigFor(cwd: string, token: string, apiBaseUrl: string): string {
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: mcpToolServerEntry(token, apiBaseUrl, 'steering', cwd),
    },
  })
}

/**
 * 生成（P2 `POST /api/projects`）を依頼する。昇格先のディレクトリ（cwd）を本家へ登録
 * させ、`.spec-workflow/` を本家に作らせる。
 *
 * **サーバー内から自分の endpoint を相対パスで叩く**（`invocationWriter` と同じ作法）。
 * 受理されなければ throw のまま返す——`kick` が渡す組み立て方の中で呼ばれるので、
 * `invokeAi` が「起動の材料を組み立てられない」として `failed` / `error` を書き、
 * U13 は 503 を返す（openspec/specs/agent/invocation「承認の後の実行は、起動の材料を
 * 組み立てるたびに生成を依頼する」）。
 */
async function generateProject(cwd: string): Promise<void> {
  await $fetch('/api/projects', { method: 'POST', body: { projectPath: cwd } })
}

/**
 * 材料を組み立てて起こす。結果は待たない。
 *
 * spawn 直前に接続表 token を発行・登録し（provide-operations-via-mcp design.md「接続の
 * 担保」）、実行終了時（正常・異常とも——`buildRun` が同期的に throw する経路も含む）に
 * 削除する。**削除は `settled` の1本に集約する**
 * （fix-idle-stuck-on-run-build-failure design.md「接続の担保」・Risks）。
 *
 * `buildRun` の呼び出しは `invokeAi` の内側へ移した。ここで渡すのは組み立て済みの
 * `AiRun` ではなく「組み立て方」——`buildRun` をこの起動の材料で閉じ込めた関数——である。
 * `invokeAi` が組み立てに失敗しても、その記録（`failed`/`error`）を書くのは `invokeAi`
 * であって `kick` ではない（design.md D1「書き込むのは invokeAi だけ」）。
 *
 * **steering の組み立て方は、材料を返す前に生成（P2）を依頼する。** 初回か継続かを問わず
 * 起動のたびに依頼する——本家の登録は dashboard の再起動で消え、本家 MCP の自己登録を
 * 外した今、戻す道はこれだけである。受理されなければ材料を返さず reject し、AI は起動
 * しない（update-project-generation-via-upstream-rest design D2）。
 *
 * **戻り値は2つの完結点を持つ。**
 *
 * - `built`: 組み立ての成否**だけ**を表す。失敗すれば reject、成功すれば resolve する。
 *   AI の応答の完了は待たない。起動を要求した側（U13）はここまでだけを待ってよい
 *   （openspec/specs/api/session/invoke-agent）
 * - `settled`: 実行全体の完了。組み立てに失敗した場合も、その記録を書き終えた時点で
 *   resolve する（reject しない）。busy ガード解除・接続表 token の削除はこちらへ
 *   紐づける——組み立てに失敗した実行も、記録を書き終えるまでは「実行中」として扱う
 */
export function kick(options: {
  sessionId: string
  cwd: string
  phase: Phase
  retries: number
  runId?: string
}): InvokeAiOutcome {
  const token = issueConnectionToken()
  const kind = kindOf(options.phase)
  registerConnection(
    token,
    kind === 'steering' ? { projectPath: options.cwd } : { sessionId: options.sessionId },
  )

  const build = async (): Promise<AiRun> => {
    // 生成は AI を起動する前、材料の組み立ての中で済ませる（上の docblock）
    if (kind === 'steering') await generateProject(options.cwd)
    return buildRun({ ...options, token })
  }

  const { built, settled } = invokeAi(options.sessionId, options.retries, build)

  // 削除は settled の1本に集約する（fix-idle-stuck-on-run-build-failure design.md
  // 「接続の担保」）。起動単位の提出記録（steering）も同じ寿命で捨てる——次の起動が
  // 前の起動の提出を自分の作業として数えないようにするため（fix-steering-empty-completion
  // design.md D1「記録は removeConnection(token) と同じ `.finally` で捨てる」）。
  // flontier の起動でも forgetLaunchSubmission は無害（何も記録されていないので no-op）。
  return {
    built,
    settled: settled.finally(() => {
      removeConnection(token)
      forgetLaunchSubmission(token)
    }),
  }
}
