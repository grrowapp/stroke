/**
 * argv の中身だけで「どの対象の実行か」を判定する照合
 * （openspec/specs/bootstrap/system/cleanup-agent-process）。
 *
 * pid の記録には頼らない。手がかりはすべて `server/utils/stroke/invoke.ts` が
 * `--mcp-config` に組み立てて渡す JSON と、`server/utils/stroke/claude.ts` が足す
 * `--session-id` / `--resume` の中に、起動の時点で載っている。
 *
 * **どのサーバーインスタンスが起こしたかは見ない。** 同じ保存先を複数のインスタンスで
 * 共有する前提を置かないため（proposal「この change で扱わないもの」）。対象の会話 id や
 * cwd が一致すれば、それはこのアプリが起こした実行である。
 *
 * **組み立て（`invoke.ts` / `claude.ts`）と同じ事実を見ていることをテストで固定する**
 * （`test/server/utils/stroke/reap-match.test.ts`）。ここを直すときは、その組み立て側も
 * 一緒に確かめること。
 */

/**
 * 「どの対象の実行か」の照合対象。
 *
 * - `stroke`: ストロークの往復。`--session-id` （初回）か `--resume`（継続）に
 *   会話 id（uuid）が載る
 * - `steering`: 承認後の steering。cwd は `--mcp-config` の自前 MCP エントリのヘッダ
 *   `x-stroke-cwd` に、初回・継続を問わず必ず載る（サーバーはこのヘッダを読まない。
 *   後始末の照合のためだけに argv へ残している。承認依頼のために並べ直した本家 MCP
 *   エントリの `npx` 引数にも同じ cwd が載るが、照合はヘッダの方に拠る——本家の配線が
 *   また変わっても照合が壊れないようにするため。update-invoke-agent-responsibility-boundary
 *   design D4）。
 *   `runId`（`state.json` の継続先）は継続時だけ `--resume` に載るが、**一覧
 *   （U12 `/api/strokes`）の応答からは手に入らない**（`SessionSummary` は runId を
 *   持たない）——ファイルを直接読まない制約の下で照合の手がかりに
 *   できるのは cwd だけなので、`runId` は任意入力として残しつつ実際の照合は cwd に
 *   拠る
 */
export type ReapTarget =
  | { kind: 'stroke', sessionId: string }
  | { kind: 'steering', cwd: string, runId?: string }

/** argv がその対象の実行を指しているか。 */
export function matchesTarget(argv: string, target: ReapTarget): boolean {
  if (target.kind === 'stroke') {
    return argv.includes(`--session-id ${target.sessionId}`) || argv.includes(`--resume ${target.sessionId}`)
  }
  if (target.runId !== undefined && argv.includes(`--resume ${target.runId}`)) return true
  // cwd は `--mcp-config` の自前 MCP エントリのヘッダ（JSON の文字列値）にそのまま載る。
  return argv.includes(JSON.stringify(target.cwd))
}
