/**
 * 自前 MCP サーバーの名前。`--mcp-config` の `mcpServers` のキーと揃える
 * （`server/utils/stroke/invoke.ts` の `mcpToolConfigFor` / `mcpConfigFor`）。
 * ずれると claude 側のツール名（`mcp__<server>__<tool>`）と一致せず、許可が効かない。
 */
export const MCP_SERVER_NAME = 'stroke-board'

/** `--allowedTools` に書く、自前 MCP サーバーのツール一式を指す名前。 */
export const MCP_SERVER_ALLOWED_TOOL = `mcp__${MCP_SERVER_NAME}`

const ALLOWED_TOOLS_FLAG = '--allowedTools'

/**
 * 起動 args の `--allowedTools` に、自前 MCP サーバーのツールを足したものを返す。
 *
 * MCP ツールは `--allowedTools` に載っていないと claude が呼び出せない。設定
 * （`nuxt.config.ts` の `claude.args`）には持たせず、`--mcp-config` と同じく
 * 呼び出しごとにここで組み立てる（provide-operations-via-mcp tasks 4.5）。
 *
 * **既存の値に追記して指定を1本に保つ。** `--allowedTools` を2回渡したときに
 * マージされるか上書きされるかは未確認のため、その挙動に依存しない形にしている。
 * フラグ自体が無い args にはフラグごと足す。
 */
export function withMcpToolsAllowed(args: string[]): string[] {
  const flagIndex = args.indexOf(ALLOWED_TOOLS_FLAG)
  if (flagIndex === -1) {
    return [...args, ALLOWED_TOOLS_FLAG, MCP_SERVER_ALLOWED_TOOL]
  }

  const valueIndex = flagIndex + 1
  const value = args[valueIndex]

  // 末尾、または次が別のフラグなら値が無い。フラグを増やさず、値だけを差し込む。
  // ツール名が `-` で始まることは無いので、`-` 始まりは次のフラグとみなしてよい
  // （`--allowedTools --disallowedTools ...` のような並びで、別フラグの値を
  // 書き換えてしまうのを防ぐ）。
  if (value === undefined || value.startsWith('-')) {
    return [...args.slice(0, valueIndex), MCP_SERVER_ALLOWED_TOOL, ...args.slice(valueIndex)]
  }

  if (value.split(' ').includes(MCP_SERVER_ALLOWED_TOOL)) {
    return [...args]
  }

  return args.map((arg, index) =>
    index === valueIndex ? `${arg} ${MCP_SERVER_ALLOWED_TOOL}` : arg,
  )
}
