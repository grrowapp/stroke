/**
 * 工程ごとに claude へ見せる MCP ツールを絞るための値。
 *
 * 自前 MCP サーバーはツールを1つ残らず単一の `/mcp` に登録するので、何もしないと
 * flontier 工程の claude の tools 一覧にも steering 専用のツールが載る。載れば呼ばれ、
 * 接続文脈が合わずに失敗する（実測: `.stroke-check/debug-log/` の 18 本で
 * `mcp__stroke-board__get-steering` が 51 回中 48 回失敗）。
 *
 * 絞りは `@nuxtjs/mcp-toolkit` の `x-mcp-tools` ヘッダで行う。モジュールは request ごとに
 * ヘッダを読み（`dist/runtime/server/mcp/utils.js` の `applyMcpToolsHeader`）、`,` 区切りの
 * 名前集合に含まれるツールだけを残して MCP サーバーを組み立てる。ヘッダが無ければ絞らない。
 * **一覧に無い名前が1つでもあると 400 で落ちる**ので、名前は登録されたツールと厳密に揃える。
 */

/** 公開ツールを絞るヘッダ名（`@nuxtjs/mcp-toolkit` の規定）。 */
export const MCP_TOOLS_HEADER = 'x-mcp-tools'

/** どちらの工程の接続として起こすか。接続表（`connection-table.ts`）の2種と対。 */
export type McpToolPhase = 'flontier' | 'steering'

/**
 * 工程ごとの公開ツール。**名前の実体は `server/mcp/tools/` のファイル名（拡張子なし）**で、
 * モジュールが `_meta.filename` から kebab-case で採る（`enrichNameTitle`）。ツール定義側で
 * `name` を宣言していないので、ファイル名を変えたらここも変わる。
 *
 * `submit-document` は種別引数で振り分けるツールなので両方に出る。
 *
 * 案内のツール（`get-guide` / `get-steering-guide`）を先頭に書いてあるのは**読みやすさの
 * ためだけ**である。`tools/list` の並びには効かない——モジュールはヘッダを `Set` に変換して
 * 含有判定にしか使わず、出力は `config.tools` の登録順のままになる
 * （`filter-tools-header.js`）。その登録順もファイルの走査順で、名前順ですらない。
 * **順序に意味を持たせないこと。** 「まず案内を呼べ」を伝えるのは description の役目である。
 */
const EXPOSED_TOOLS: Record<McpToolPhase, readonly string[]> = {
  flontier: ['get-guide', 'get-overview', 'get-strokes', 'get-send-back', 'send-question', 'submit-document'],
  steering: ['get-steering-guide', 'get-steering', 'submit-document'],
}

/** `x-mcp-tools` に載せる値。モジュールは `,` で分割し、前後の空白を落とす。 */
export function exposedToolsHeaderValue(phase: McpToolPhase): string {
  return EXPOSED_TOOLS[phase].join(',')
}
