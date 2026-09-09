import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'
import { readFetchFailure } from '../../utils/mcp/fetch-failure'
import { resolveConnectionProjectPath, resolveConnectionSessionId } from '../../utils/mcp/require-connection'
import { resolveProjectId } from '../../utils/mcp/resolve-project-id'
import { classifySteeringFailure, upstreamFetch } from '../../utils/mcp/upstream-fetch'

/** 数値キーの写像なので `Object.prototype` のメンバとは衝突しない（下の 404 の写像を参照）。 */
const FLONTIER_ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: 'validation_error',
  409: 'phase_conflict',
}

/**
 * flontier 側の 404 は本文の文言から導く。**既知の文言でないものは `session_not_found` に
 * 寄せない。**
 *
 * ルート不一致などの見覚えのない 404 まで「そのセッションは無い」に畳むと、受け手は存在
 * しない原因を直そうとする（specs `mcp/server`「契約に載せた状況へ無理に寄せてはならない」
 * MUST NOT）。A7 が 404 を返す経路は現状 `requireSessionId` の1本だけなので既知の文言も
 * 1つだが、守りの理由は get-overview.ts / get-send-back.ts と同じである
 * （santa-method レビュー指摘 7周目 2026-08-30）。
 *
 * steering 側は本家の応答を `classifySteeringFailure` が分類するので、この写像は通らない。
 *
 * プロトタイプを持たせない理由は get-overview.ts と同じ（santa-method レビュー指摘 6周目）。
 */
const FLONTIER_ERROR_CODE_BY_404_MESSAGE: Record<string, string> = Object.assign(Object.create(null), {
  // `server/utils/stroke/session-param.ts` の `requireSessionId`
  'そのセッションは無い。': 'session_not_found',
})

/**
 * 種別で A7（flontier）/ 本家 PUT（steering）へ振り分ける。specs `mcp/tools/submit`。
 *
 * `status` はどちらの経路も**代行先の実際の応答をそのまま持つ**（`mcp/server`「代行先が
 * 応答を返したなら、その status を保持する」SHALL）。flontier 側は `send-question.ts` と
 * 同じ理由で `$fetch.raw`（A7 も受理で完結する口なので、成功は本文なしの 204。
 * `docs/specs/api/contract.md` A7）、steering 側は `upstreamFetch` が `ofetch.raw` で
 * 持ち帰った本家の status を載せる。以前ここに置いていた `status: 200` の定数は、本家の
 * PUT がたまたまそう返すのと一致していただけで導出ではなかった（santa-method レビュー
 * 指摘 2026-08-30）。
 *
 * **このツールの責務は、文書を代行先へ登録することだけである**（`docs/specs/mcp/contract.md`
 * 「代行以外の固定の処理を受け持たない」）。その提出で作業が行われたかの判定・記録は
 * invoke-agent の責務で、ここには置かない——steering の判定は invoke-agent が実行の終わりに
 * 本家 REST へ問い合わせる（`server/utils/stroke/invoke.ts` の `steeringCompletedUpstream`）。
 */

/**
 * 本家の `:name` ルートへ届く文書名か。
 *
 * 空文字・`.`・`..` は `encodeURIComponent` を通してもそのまま残り、URL の正規化で
 * パスセグメントが消える（実測 2026-08-30: `..` は `PUT /api/projects/PID1/` を発行する。
 * `/` を含む `a/b` は `%2F` になるので無害）。本家の fastify ルート（`:name`）にすら
 * マッチせず素の 404 が返るので、規定外の文書名なのに `validation_error` にならない
 * （specs `mcp/tools/steering` の「規定外の文書名 → status: 400・validation_error」に
 * 反する。santa-method レビュー指摘 4周目 2026-08-30）。`name` が欠けている場合
 * （ツール自身の引数契約——specs `mcp/tools/submit`「steering の場合は文書名を併せて
 * 取る SHALL」——の不成立）も同じ結果に畳む。
 *
 * 弾くのは**本家のルートに届かない形だけ**で、値そのものの検証（product/tech/structure
 * か）は本家に任せたまま——ADR-0014。
 *
 * `get-steering.ts` に同じ判定・同じ文言を置いてある。共通の置き場は
 * `server/utils/mcp/` になるが、この change では触らないので各ファイルに写してある。
 */
function isRoutableDocumentName(name: string | undefined): name is string {
  return name !== undefined && !['', '.', '..'].includes(name)
}

/** 本家のルートに届かない文書名を弾いたときの文言。`get-steering.ts` と揃える */
const UNROUTABLE_NAME_ERROR = '文書名（name）が無いか、使えない形（. / ..）。'

/**
 * 振り分け先を決められない `type` を弾いたときの文言。
 *
 * `type` は代行先そのものを選ぶ項目で、欠落・規定外の値では A7 とも本家 PUT とも要求を
 * 組み立てられない。値の妥当性を代行先に問い合わせる先が存在しないので、ここで判定する
 * ——`isRoutableDocumentName` と同じ立ち位置であり、ADR-0014 の「代行先が持つ検証を
 * 手前で写す」には当たらない。
 */
const UNKNOWN_TYPE_ERROR = '種別（type）が無いか、使えない値。flontier / steering のいずれか。'

export default defineStrokeTool({
  description: '文書を提出する（type: flontier は proposal、steering は指定した文書名の steering 文書）',
  // 上限・許容値は**説明として**書く（`.max()` や `.enum()` で弾かない）。検証の正は
  // 代行先（A7 / 本家 PUT）に置いたままにする——ADR-0014。send-question と同じ理由で、
  // 契約に書かないとエージェントは形を探り続けることになる。
  //
  // **項目は1つも必須にしない（すべて `.optional()`）。`type` も `.enum()` を外す。**
  // MCP SDK は `inputSchema` をハンドラより**前**に検証し、通らなければ
  // `McpError(InvalidParams)` を投げる（`@modelcontextprotocol/sdk/dist/esm/server/mcp.js`
  // の `validateToolInput` が 174-178 行で `safeParseAsync` の失敗を投げ、その呼び出しは
  // 125 行——ハンドラを呼ぶ 126 行より前）。モジュールの try/catch はハンドラの内側しか
  // 覆わない（`@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/tools.js` 36-44 行）
  // ので、必須項目の欠落や enum 外の `type` は `status` も `errorCode` も持たない結果に
  // なり、specs `mcp/server` の平坦形式の SHALL（無条件）を破る
  // （santa-method レビュー指摘 5周目 2026-08-30）。
  //
  // `type` は**振り分けに使う＝代行先を決められない**項目なので、欠落・規定外の値は
  // ハンドラの中で平坦な 400 `validation_error` にする（`name` と同じ扱い）。`document`
  // は中身の妥当性を代行先が判定するので、欠けたまま渡して代行先の 400 を載せる。
  inputSchema: {
    type: z.string().optional().describe('種別。flontier / steering のいずれか。省くと 400 になる'),
    document: z.string().optional().describe('文書の本文そのもの。ファイルパスではない。省くと代行先が 400 で返す'),
    name: z.string().optional().describe('type が steering のときの文書名。product / tech / structure のいずれか'),
    // 撤去済みの旧スキル（`assets/.claude/skills/proposal/SKILL.md`）は `/proposal '<filepath>'
    // '<projectName>'` で候補を送っていた。ツールの引数に無いと常に `{ proposal }` だけが
    // 飛び、`state.projectName` が空のまま承認画面のプロジェクト名欄
    // （`app/composables/useProposalReview.ts`）が毎回空になる（santa-method レビュー指摘）。
    // 形（kebab-case か）で弾かないのは ADR-0014。採否の判定は A7 が持つ。
    projectName: z.string().optional().describe('type が flontier のときの、承認画面に出すプロジェクト名の候補。kebab-case（英小文字と数字をハイフンで繋いだ形。例 my-project）のときだけ採用される'),
  },
  outputSchema: {
    status: z.number(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (args, extra) => {
    // token の欠落・不一致も throw せず平坦なエラーで返す（理由は `connection-table.ts`）。
    const connection = resolveConnection(extra.requestInfo?.headers ?? {})
    if (!connection.ok) {
      return { status: connection.status, errorCode: connection.errorCode, error: connection.error }
    }
    const conn = connection.context

    // 振り分け先を決められない `type` はここで弾く（理由は `UNKNOWN_TYPE_ERROR`）。
    if (args.type !== 'flontier' && args.type !== 'steering') {
      return { status: 400, errorCode: 'validation_error', error: UNKNOWN_TYPE_ERROR }
    }

    if (args.type === 'flontier') {
      // 種別と接続文脈の食い違いは、`type` が両方の値を提示する以上 normal フローで
      // 起こりうる（steering 工程の claude が `type: 'flontier'` を投げる）。throw せず
      // 平坦なエラー結果を返す——理由は `require-connection.ts` の
      // `resolveConnectionSessionId` に書いた。
      const connected = resolveConnectionSessionId(conn)
      if (!connected.ok) {
        return { status: connected.status, errorCode: connected.errorCode, error: connected.error }
      }

      try {
        const response = await $fetch.raw(`/api/strokes/${encodeURIComponent(connected.sessionId)}/proposal`, {
          method: 'POST',
          // 候補が無いときは項目そのものを載せない。A7 の `proposalSubmitBody` は
          // `projectName` を optional として受けるので、送らなければ既存の
          // `state.projectName` がそのまま残る（`server/handler/proposal.ts` の候補名の決定）。
          body: {
            proposal: args.document,
            ...(args.projectName === undefined ? {} : { projectName: args.projectName }),
          },
        })
        return { status: response.status }
      } catch (error) {
        const failure = readFetchFailure(error)
        if (failure.status === 404) {
          // 見覚えのない 404 は `session_not_found` に寄せない（理由は写像の宣言に書いた）。
          const errorCode = FLONTIER_ERROR_CODE_BY_404_MESSAGE[failure.message] ?? 'unexpected_status'
          return { status: 404, errorCode, error: failure.message }
        }
        const errorCode = FLONTIER_ERROR_CODE_BY_STATUS[failure.status] ?? 'unexpected_status'
        return { status: failure.status, errorCode, error: failure.message }
      }
    }

    // ここから steering。`projectName` は A7 を使わないので見ない（無視する）。
    //
    // 接続文脈の確認を `name` の確認より先に置くのは flontier 側と対にするため。
    // どちらの工程の接続かは、引数の欠けよりも手前で決まっている前提である。
    const connected = resolveConnectionProjectPath(conn)
    if (!connected.ok) {
      return { status: connected.status, errorCode: connected.errorCode, error: connected.error }
    }

    // 本家のルートに届かない形はここで弾く（理由は `isRoutableDocumentName`）。
    // 「引数契約を満たすか」「本家のルートに届くか」はツール自身の責務の判定であり
    // ADR-0014 の対象外。
    if (!isRoutableDocumentName(args.name)) {
      return { status: 400, errorCode: 'validation_error', error: UNROUTABLE_NAME_ERROR }
    }

    // 代行先を呼ぶものはすべて try の中に置く。`resolveProjectId` は現状 throw しないが、
    // 外に出すとそこだけ平坦形の保証が及ばない（santa-method レビュー指摘 6周目 2026-08-30）
    try {
      const resolved = await resolveProjectId(connected.projectPath)
      if (!resolved.ok) {
        return { status: resolved.status, errorCode: resolved.errorCode, error: resolved.error }
      }

      // 本家の PUT の応答本文は `{ success, message }` だが、成否は状態コードが持つので
      // 中身を使わない。形を検証しないことを `z.unknown()` で明示する（`rest.ts` の
      // `write` と同じ扱い）。
      const response = await upstreamFetch(
        `/api/projects/${encodeURIComponent(resolved.projectId)}/steering/${encodeURIComponent(args.name)}`,
        z.unknown(),
        { method: 'PUT', body: { content: args.document } },
      )
      // ここまで来た時点で `upstreamFetch` は例外を投げていない＝本家 PUT は 2xx で応答
      // している。返すのは本家の実応答の `status` だけで、受理を記録しない——文書が本家に
      // 在るかは invoke-agent が実行の終わりに本家へ問い合わせる（上の docblock）。
      return { status: response.status }
    } catch (error) {
      const failure = classifySteeringFailure(error)
      return { status: failure.status, errorCode: failure.errorCode, error: failure.error }
    }
  },
})
