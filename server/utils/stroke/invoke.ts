import type { Invocation, SessionSummary } from '#shared/stroke'
import { invokeAi, type AiRun, type InvokeAiOutcome } from './ai'
import { readStrokeConfig } from './config'
import { initSessionOpenspec } from './openspec'
import { readState, sessionExists, writeState } from './session-store'
import { forgetLaunchSubmission, hasLaunchSubmission, submissionCount } from './submission-signal'
import { submissionPath } from './submission-path'
import {
  MCP_SERVER_NAME,
  UPSTREAM_MCP_SERVER_NAME,
  withMcpToolsAllowed,
} from '../mcp/allowed-tools'
import { readServerConfig } from '../config'
import { issueConnectionToken, registerConnection, removeConnection } from '../mcp/connection-table'
import { exposedToolsHeaderValue, MCP_TOOLS_HEADER, type McpToolPhase } from '../mcp/exposed-tools'

/**
 * 起動の材料を設定から組み立てる端。
 *
 * `invokeAi` は設定を引かないので、引くのはここである。用途の違いは渡す値の違いだけで
 * 表す（openspec/specs/agent/invocation「起動処理は呼び出し元を区別しない」）。
 */

/** どの用途で起こすか。渡す値の決め方だけが違う。 */
export type RunKind = 'stroke' | 'steering'

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

/** steering の会話 id を `state.json` に覚える。次のキックの続き先になる。 */
function conversationWriter(sessionId: string) {
  return async (runId: string): Promise<void> => {
    const state = await readState(sessionId)
    if (state.phase !== 'approved') return
    await writeState(sessionId, { ...state, runId })
  }
}

/**
 * 起動の材料を作る。
 *
 * @param sessionId  対象の id（昇格後はプロジェクト名がこれにあたる）
 * @param cwd        実行する場所。キックする側が渡す（design.md D5）
 * @param kind       ストロークの往復か、承認後の steering か
 * @param retries    これまでに起こし直した回数
 * @param runId      steering の会話 id。まだ無ければ undefined
 * @param token      この起動の接続表 token（provide-operations-via-mcp design.md「接続の担保」）
 */
export function buildRun(options: {
  sessionId: string
  cwd: string
  kind: RunKind
  retries: number
  runId?: string
  token: string
}): AiRun {
  const { sessionId, cwd, kind, retries, runId, token } = options
  const { claude, openspec } = readStrokeConfig()

  // 空 = 無効。無効を undefined へ写すのは設定を引いた端のここで行う
  // （openspec/specs/debug/logging「出力先の設定があるときだけ書かれる」）
  const debugLogDir = claude.debugLogDir === '' ? undefined : claude.debugLogDir

  if (kind === 'steering') {
    return {
      launch: {
        command: claude.command,
        // 本家 spec-workflow の MCP を与えて起こす（ADR 0011）。設定にも持たず、
        // ファイルも作らず、cwd から組み立てて args に足す（design.md D7）。
        // 自前 MCP サーバー（provide-operations-via-mcp）も同じ --mcp-config に並べる
        // （既存フラグ・本家 MCP の並びは変えない）。
        // MCP ツールは --allowedTools に載っていないと呼べないため、同じく呼び出し
        // ごとにここで足す（tasks 4.5）。**本家 MCP の分は足さない**——配線と許可は別で、
        // 配線の目的（起動時の登録簿への自己登録）は許可なしで果たされる
        // （`initialize()` が stdio transport を繋ぐ前に自己登録する。本家 2.2.5
        // `dist/server.js`）。`--allowedTools` は可視性を決めないので、外しても本家の
        // ツールは一覧から消えない——呼ばせない責務は案内（`get-steering-guide`）が
        // 併せて負う（adr0016-sub-fix-upstream-mcp-allowance design.md D1）。
        args: [
          ...withMcpToolsAllowed(claude.args),
          '--mcp-config',
          mcpConfigFor(cwd, token, claude.apiBaseUrl),
        ],
        apiBaseUrl: claude.apiBaseUrl,
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
      didWork: submittedByLaunch(token),
      remember: conversationWriter(sessionId),
      // 作業場所は昇格済みのプロジェクト。`.spec-workflow/` の内部構造は本家 MCP が作る
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
        mcpToolConfigFor(token, claude.apiBaseUrl),
      ],
      apiBaseUrl: claude.apiBaseUrl,
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
 * url は `runtimeConfig.claude.apiBaseUrl` から組み立てる（design.md「MCP の url は
 * 既存設定から組み立てる」。新しい設定は増やさない）。token はこの起動専用の一時値
 * （接続表 `server/utils/mcp/connection-table.ts`）。
 *
 * 工程は url ではなくヘッダで分ける。`x-mcp-tools` に載せた名前のツールだけが claude の
 * tools 一覧に載るので、その工程で呼べないツールは初めから見えない
 * （`server/utils/mcp/exposed-tools.ts`）。
 */
function mcpToolServerEntry(
  token: string,
  apiBaseUrl: string,
  phase: McpToolPhase,
): Record<string, unknown> {
  return {
    type: 'http',
    url: `${apiBaseUrl}/mcp`,
    headers: {
      'x-stroke-token': token,
      [MCP_TOOLS_HEADER]: exposedToolsHeaderValue(phase),
    },
  }
}

/** flontier 工程の `--mcp-config`。自前 MCP サーバーのみを持つ。 */
function mcpToolConfigFor(token: string, apiBaseUrl: string): string {
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: mcpToolServerEntry(token, apiBaseUrl, 'flontier'),
    },
  })
}

/**
 * steering 工程の `--mcp-config`。本家 `spec-workflow-mcp` と自前 MCP サーバーを並べる
 * （既存フラグ・本家 MCP の並びは変えない）。
 *
 * `--mcp-config` は JSON 文字列を直接受け取れる（実機確認済み・design.md D7）。
 * 生成先のプロジェクトをそのままワークスペースとして渡す。
 *
 * **`SPEC_WORKFLOW_HOME` を渡す。これが無いと steering 工程は成立しない。**
 * 本家 MCP は起動時に「どのプロジェクトが動いているか」の登録簿へ自分を書き込み、
 * dashboard の `GET /api/projects/list` はその登録簿を読む。登録簿の場所は
 * `SPEC_WORKFLOW_HOME` が決め、未設定なら `~/.spec-workflow-mcp` になる。
 *
 * dashboard は `/opt/projects/.spec-workflow-mcp` を見て動いているのに、claude が起こす
 * 側は環境変数を継がず既定の場所へ書いていた。**別々の登録簿に書いて読んでいた**ので、
 * 昇格したてのプロジェクトは何度起こしても一覧に現れず、`get-steering` /
 * `submit-document`（steering）は `project_not_registered` を返し続けていた
 * （実測 2026-08-31: 本家 MCP は `connected` で「Project registered」も出しているのに、
 * dashboard の一覧にも `/opt/projects/.spec-workflow-mcp/activeProjects.json` にも
 * 現れない。手で起こして突き合わせて確かめた）。
 *
 * 値は**ポータル側が読んでいるものと同じ1つ**を使う（`readServerConfig`）。ここで
 * 別の解決規則を書くと、また読み手と書き手が割れる。
 */
function mcpConfigFor(cwd: string, token: string, apiBaseUrl: string): string {
  return JSON.stringify({
    mcpServers: {
      [UPSTREAM_MCP_SERVER_NAME]: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@pimzino/spec-workflow-mcp@latest', cwd],
        env: { SPEC_WORKFLOW_HOME: readServerConfig().specWorkflowHome },
      },
      [MCP_SERVER_NAME]: mcpToolServerEntry(token, apiBaseUrl, 'steering'),
    },
  })
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
  kind: RunKind
  retries: number
  runId?: string
}): InvokeAiOutcome {
  const token = issueConnectionToken()
  registerConnection(
    token,
    options.kind === 'steering' ? { projectPath: options.cwd } : { sessionId: options.sessionId },
  )

  const { built, settled } = invokeAi(
    options.sessionId,
    options.retries,
    () => buildRun({ ...options, token }),
  )

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
