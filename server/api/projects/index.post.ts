import { basename, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'

import { registerProject } from '../../handler/project-directory'
import { requireProjectName } from '../../utils/access/request'
import { toHttpError } from '../../utils/control/upstream-proxy'
import { readStrokeConfig } from '../../utils/stroke/config'
import { parseBody } from '../../utils/stroke/request-schemas'

/**
 * P2: プロジェクトの生成（openspec/specs/api/project/generate）。
 *
 * 昇格したプロジェクトを本家 spec-workflow に存在させる——本家の登録の REST
 * （`POST /api/projects/add`）へ依頼するだけである。依頼そのものは
 * `server/handler/project-directory.ts` の `registerProject` が持つ。プロジェクトはリソースとして
 * `projects/` を既に持つ（P1 の削除）ので、その作成として同じ path に POST で置く。
 *
 * **ユーザーは叩かない。** 承認の後の実行（steering）の起動の材料を組み立てるとき、
 * サーバーが AI を起動する前に叩く（`server/utils/stroke/invoke.ts` の `kick`）。かつては
 * steering 用 claude の `--mcp-config` に並べた本家 MCP の自己登録でプロジェクトが本家に
 * 現れていた——生成が AI のプロセスに乗っていた。その配線は外し、生成はここだけになった
 * （update-project-generation-via-upstream-rest）。本家 MCP は承認依頼のためにだけ steering の
 * 起動定義へ並べ直したが、並べるのはここが受理された後に限る——登録済みのパスへの自己登録は
 * 同じ projectId を返すだけで、生成にはならない
 * （update-invoke-agent-responsibility-boundary design D4）。
 *
 * **id を取らない。** 作成に id は無く、本家が要るのはパスであり、呼び手は cwd としてパスを
 * 既に持っている。id を受けてパスを導出し直すのは、呼び手が持つ事実を別の規則で決め直す
 * ことになる（U13 が cwd を導出しないのと同じ理由）。
 *
 * **判定を持たない（ADR-0014）。** AI を起動せず、改名せず、phase も `invocation` も書かず、
 * 上層へ `project-creation` を配信しない。`state.json` も読まない——受け取ったのはパスであり、
 * 判定はその形だけに掛ける。
 *
 * **受け付けるのは親（`projectShareRoot`）の直下1階層の絶対パスだけ。** 親の外を本家に
 * 登録させないための入力検証であり、状態の判定ではない。本家へ送るのは受け取った値そのもの
 * （正規化は判定にだけ使う）。判定は字面（`path.resolve` による `.` / `..` の畳み込み）で行い、
 * シンボリックリンクは解決しない——ファイルシステムを読まない口だからである。
 *
 * 失敗は `toHttpError` で写す。未設定・不達・本家のエラー応答（404 を含む）→ 503（環境か設定を
 * 直すまで通らない）、形違い → 502。どの失敗でも何も変えない。
 */
const generateBody = z.object({
  projectPath: z.string({ error: 'projectPath は文字列で書く。' }).min(1, 'projectPath が要る。'),
}, { error: 'projectPath を持つ組で送る。' })

export default defineEventHandler(async (event): Promise<Response> => {
  const { projectPath } = parseBody(generateBody, await readBody(event))

  const shareRoot = resolve(readStrokeConfig().projectShareRoot)
  const target = resolve(projectPath)
  // 親の直下1階層: 正規化した値が「親 + 末尾1要素」に一致し、親そのものではない
  if (!isAbsolute(projectPath) || target === shareRoot || join(shareRoot, basename(target)) !== target) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `projectPath は ${shareRoot} の直下のディレクトリの絶対パスでなければならない。`,
    })
  }

  // 見られない対象は存在しないものとして 404（access/permission）。叩くのはサーバー内部で、そこは通る
  await requireProjectName(event, basename(target))

  const result = await registerProject(projectPath)
  if (!result.ok) {
    // 本家が 404 を返すのは登録の口そのものが無いとき（`/api/projects/add` を持たない版）で、
    // 作成の要求に「対象が見つからない」を返すと読み違える。本家がエラーで返したものは
    // 一律に「環境か設定を直すまで通らない」（503）とする（specs/api/project/generate）
    if (result.failure.kind === 'not-found') {
      throw createError({
        statusCode: 503,
        statusMessage: 'upstream-unreachable',
        message: '本家に登録の口が無い（/api/projects/add が見つからない）',
      })
    }
    throw toHttpError(result.failure)
  }

  return new Response(null, { status: 204 })
})
