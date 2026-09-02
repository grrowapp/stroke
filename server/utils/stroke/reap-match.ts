/**
 * argv の中身だけで「自分が起こした claude か」「どの対象の実行か」を判定する照合
 * （`fix-orphan-run-on-restart` design.md Decision 1・Decision 2）。
 *
 * pid の記録には頼らない。手がかりはすべて `server/utils/stroke/invoke.ts` が
 * `--mcp-config` に組み立てて渡す JSON と、`server/utils/stroke/claude.ts` が足す
 * `--session-id` / `--resume` の中に、起動の時点で載っている。
 *
 * **1.4 で組み立て（`invoke.ts` / `claude.ts`）と同じ事実を見ていることを固定する**
 * （`test/server/utils/stroke/reap-match.test.ts`）。ここを直すときは、その組み立て側も
 * 一緒に確かめること。
 */

/**
 * 「どの対象の実行か」の照合対象。
 *
 * - `stroke`: ストロークの往復。`--session-id` （初回）か `--resume`（継続）に
 *   会話 id（uuid）が載る
 * - `steering`: 承認後の steering。cwd は `--mcp-config` の本家 MCP エントリ
 *   （`npx @pimzino/spec-workflow-mcp@latest <cwd>`）に、初回・継続を問わず必ず載る。
 *   `runId`（`state.json` の継続先）は継続時だけ `--resume` に載るが、**一覧
 *   （U12 `/api/strokes`）の応答からは手に入らない**（`SessionSummary` は runId を
 *   持たない）——ファイルを直接読まない制約（tasks 2.2）の下で照合の手がかりに
 *   できるのは cwd だけなので、`runId` は任意入力として残しつつ実際の照合は cwd に
 *   拠る（design.md Decision 1 の実務上の帰結）
 */
export type ReapTarget =
  | { kind: 'stroke', sessionId: string }
  | { kind: 'steering', cwd: string, runId?: string }

/**
 * argv に自インスタンスの `apiBaseUrl` が載っているか（design.md Decision 2）。
 *
 * `--mcp-config` は `JSON.stringify(...)` で組み立てられ（スペースを入れない既定の
 * 出力）、`url` は必ず `${apiBaseUrl}/mcp` の形になる
 * （`invoke.ts` の `mcpToolServerEntry`）。その断片がそのまま argv に現れる。
 */
export function isOwnLaunch(argv: string, apiBaseUrl: string): boolean {
  return argv.includes(mcpUrlFragment(apiBaseUrl))
}

/** `--mcp-config` の JSON の中で `url` が取る断片。JSON のエスケープ規則をここ1箇所に置く。 */
function mcpUrlFragment(apiBaseUrl: string): string {
  // `{"url":"<apiBaseUrl>/mcp"}` から波括弧を剥がし、`"url":"<apiBaseUrl>/mcp"` だけを取る。
  // 手組みの文字列連結にしないのは、`apiBaseUrl` に JSON 上のエスケープが要る文字
  // （バックスラッシュ等）が来ても `invoke.ts` 側の組み立てと表記がずれないようにするため。
  return JSON.stringify({ url: `${apiBaseUrl}/mcp` }).slice(1, -1)
}

/**
 * argv がその対象の実行を指しているか（design.md Decision 1）。
 *
 * 自分が起こしたかどうかは見ない——`isOwnLaunch` と組み合わせて使う。
 */
export function matchesTarget(argv: string, target: ReapTarget): boolean {
  if (target.kind === 'stroke') {
    return argv.includes(`--session-id ${target.sessionId}`) || argv.includes(`--resume ${target.sessionId}`)
  }
  if (target.runId !== undefined && argv.includes(`--resume ${target.runId}`)) return true
  // cwd は `--mcp-config` の npx args（JSON の文字列要素）にそのまま載る。
  return argv.includes(JSON.stringify(target.cwd))
}
