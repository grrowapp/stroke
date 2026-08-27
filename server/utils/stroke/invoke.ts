import type { Invocation, SessionSummary } from '#shared/stroke'
import { invokeAi, type AiRun } from './ai'
import { readStrokeConfig } from './config'
import { initSessionOpenspec } from './openspec'
import { readState, writeState } from './session-store'
import { submissionCount } from './submission-signal'

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
 * 承認処理（初回の steering）と巡回（再キック）がこれを使う。endpoint を経由するのは、
 * busy ガードと前提チェック（503）を通すためである。
 */
export function invokePath(sessionId: string, cwd: string): string {
  return `/api/strokes/${encodeURIComponent(sessionId)}/invoke-agent?cwd=${encodeURIComponent(cwd)}`
}

/** A8 の path。`invocation` の唯一の書き込み口。 */
export function submissionPath(sessionId: string): string {
  return `/api/strokes/${encodeURIComponent(sessionId)}/submission`
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
 */
export function buildRun(options: {
  sessionId: string
  cwd: string
  kind: RunKind
  retries: number
  runId?: string
}): AiRun {
  const { sessionId, cwd, kind, retries, runId } = options
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
        args: [...claude.args, '--mcp-config', mcpConfigFor(cwd)],
        apiBaseUrl: claude.apiBaseUrl,
      },
      cwd,
      debugLogDir,
      // 初回も継続も同じ定型。ユーザー入力は無く、続きを促すのも同じ1本で足りる
      prompts: { first: claude.steeringPrompt, continue: claude.steeringPrompt },
      maxRetries: claude.maxRetries,
      retries,
      // 会話 id は自前採番しない。対象のディレクトリ名はプロジェクト名で uuid ではなく、
      // `--session-id` は uuid しか受け付けない（実測）。初回は claude に採番させる
      conversationId: runId,
      hasConversation: async () => runId !== undefined,
      setInvocation: invocationWriter(sessionId),
      remember: conversationWriter(sessionId),
      // 作業場所は昇格済みのプロジェクト。`.spec-workflow/` の内部構造は本家 MCP が作る
      prepare: undefined,
    }
  }

  return {
    launch: {
      command: claude.command,
      args: claude.args,
      apiBaseUrl: claude.apiBaseUrl,
    },
    cwd,
    debugLogDir,
    prompts: { first: claude.firstPrompt, continue: claude.continuePrompt },
    maxRetries: claude.maxRetries,
    retries,
    // ストロークは uuid を自前採番して使う。スキルが `${CLAUDE_SESSION_ID}` でセッション
    // id を知る前提（docs/specs/architecture/session-workflow.md）に効いている
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
    }),
  }
}

/**
 * 本家 `spec-workflow-mcp` を起こす `--mcp-config` の中身。
 *
 * `--mcp-config` は JSON 文字列を直接受け取れる（実機確認済み・design.md D7）。
 * 生成先のプロジェクトをそのままワークスペースとして渡す。
 */
function mcpConfigFor(cwd: string): string {
  return JSON.stringify({
    mcpServers: {
      specworkflow: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@pimzino/spec-workflow-mcp@latest', cwd],
      },
    },
  })
}

/** 材料を組み立てて起こす。結果は待たない。 */
export function kick(options: {
  sessionId: string
  cwd: string
  kind: RunKind
  retries: number
  runId?: string
}): Promise<void> {
  return invokeAi(options.sessionId, buildRun(options))
}
