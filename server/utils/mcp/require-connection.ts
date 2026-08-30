import type { ConnectionContext } from './connection-table'

/**
 * 接続文脈と、呼び出しが求める工程が食い違っている。
 *
 * **代行先の応答ではなくここで組み立てた値である。** どちらへ代行するかが決まらず、
 * 要求そのものを組み立てられないので、保持すべき応答が存在しない。specs `mcp/server` が
 * 「代行先へ要求を出せなかった場合に限り」認めているもので、`resolve-project-id.ts` の
 * `ProjectNotRegisteredFailure` と同じ扱いになる。
 *
 * `errorCode` を `validation_error` にしないのは、代行先が返す 400（文書の中身が受け口の
 * 検証に通らない）と区別が付かなくなるため。呼び手の次の手が違う——こちらは `type` を
 * 直す（あるいはその工程では呼ばない）話で、文書を直しても通らない
 * （santa-method レビュー指摘 2周目 2026-08-30）。
 */
export interface ConnectionPhaseMismatchFailure {
  status: 400
  errorCode: 'connection_mismatch'
  error: string
}

export type ConnectionSessionIdResolution =
  | { ok: true, sessionId: string }
  | ({ ok: false } & ConnectionPhaseMismatchFailure)

export type ConnectionProjectPathResolution =
  | { ok: true, projectPath: string }
  | ({ ok: false } & ConnectionPhaseMismatchFailure)

const NOT_FLONTIER = 'この接続は flontier 工程向けではない。'
const NOT_STEERING = 'この接続は steering 工程向けではない。'

/**
 * 接続文脈から `sessionId`（flontier 工程）を取り出す。取れなければ平坦なエラー結果を返す。
 *
 * `resolveConnection` が返す `ConnectionContext` は union で、`sessionId` を持つとは限らない。
 * **`submit-document` ではこの食い違いが normal フローで起こりうる。** 同ツールは両工程に
 * 公開され（`server/utils/mcp/exposed-tools.ts`）、振り分けは引数 `type` で決まるので、
 * 工程ごとの公開ツールの絞り（`x-mcp-tools`）は**ツール単位**の絞りであってこの経路を
 * 塞げない。steering 接続の claude が `type: 'flontier'` を投げれば、そのままここに来る。
 *
 * だから throw ではなく結果で返す。throw するとモジュールの `normalizeErrorToResult` が
 * `isError: true` のテキストへ畳んでしまい、`status` も `errorCode` も持たない結果になる
 * ——specs `mcp/tools/submit`「失敗は種別によらずすべてこのエラー形式で返り」に反する
 * （santa-method レビュー指摘 2026-08-30）。
 *
 * **flontier 工程にしか公開されないツール（get-overview / get-strokes / get-send-back /
 * send-question）もこちらを使う。** 絞りが効いていれば起こらない食い違いだが、絞りは
 * fail-open である——モジュールの `applyMcpToolsHeader` は `x-mcp-tools` ヘッダが
 * **無ければ絞らない**（`node_modules/@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/utils.js`）。
 * ヘッダが届かない・モジュールの版上げでヘッダ仕様が変わった場合、絞りが外れた側で
 * throw すると結果の形まで崩れる。`mcp/server` の平坦形式の SHALL は無条件なので、
 * 崩れる側ではなく平坦なエラーへ倒す（santa-method レビュー指摘 3周目 2026-08-30）。
 */
export function resolveConnectionSessionId(context: ConnectionContext): ConnectionSessionIdResolution {
  if (context.sessionId === undefined) {
    return { ok: false, status: 400, errorCode: 'connection_mismatch', error: NOT_FLONTIER }
  }
  return { ok: true, sessionId: context.sessionId }
}

/** 接続文脈から `projectPath`（steering 工程）を取り出す。理由は `resolveConnectionSessionId` と対。 */
export function resolveConnectionProjectPath(context: ConnectionContext): ConnectionProjectPathResolution {
  if (context.projectPath === undefined) {
    return { ok: false, status: 400, errorCode: 'connection_mismatch', error: NOT_STEERING }
  }
  return { ok: true, projectPath: context.projectPath }
}

/*
 * throw する版（`requireConnectionSessionId` / `requireConnectionProjectPath`）は
 * 全廃した（santa-method レビュー指摘 3周目 2026-08-30）。6ツールすべてが上の
 * `resolve*` を使い、工程の食い違いは平坦なエラー結果になる。
 *
 * `x-mcp-tools` による絞りは fail-open で、ヘッダが届かなければ絞られない。throw を
 * 残すと、絞りが外れた側で結果の形まで崩れる方に倒れていた。
 */
