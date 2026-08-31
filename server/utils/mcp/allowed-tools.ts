/**
 * 自前 MCP サーバーの名前。`--mcp-config` の `mcpServers` のキーと揃える
 * （`server/utils/stroke/invoke.ts` の `mcpToolConfigFor` / `mcpConfigFor`）。
 * ずれると claude 側のツール名（`mcp__<server>__<tool>`）と一致せず、許可が効かない。
 */
export const MCP_SERVER_NAME = 'stroke-board'

/** `--allowedTools` に書く、自前 MCP サーバーのツール一式を指す名前。 */
export const MCP_SERVER_ALLOWED_TOOL = `mcp__${MCP_SERVER_NAME}`

/**
 * 本家 spec-workflow の MCP サーバーの名前。steering 工程の `--mcp-config` に並ぶ
 * （`server/utils/stroke/invoke.ts` の `mcpConfigFor`、ADR-0011）。
 */
export const UPSTREAM_MCP_SERVER_NAME = 'specworkflow'

/** `--allowedTools` に書く、本家 MCP サーバーのツール一式を指す名前。 */
export const UPSTREAM_MCP_ALLOWED_TOOL = `mcp__${UPSTREAM_MCP_SERVER_NAME}`

const ALLOWED_TOOLS_FLAG = '--allowedTools'

/** `--allowedTools=<値>` の連結形。多くの CLI が分離形と同じ意味で受け付ける。 */
const ALLOWED_TOOLS_ASSIGNED = `${ALLOWED_TOOLS_FLAG}=`

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
 *
 * 渡された args に `--allowedTools` が既に2本以上あるときは、値をつないで1本へ畳む。
 * `indexOf` で先頭の1本だけを見ると、残りが手つかずで残り「1本に保つ」が破れる
 * （santa-method レビュー指摘 2026-08-30）。
 *
 * 分離形（`--allowedTools <値>`）と連結形（`--allowedTools=<値>`）の両方を検出する。
 * 完全一致だけを見ると連結形で空振りし、末尾に2本目を足してしまって、まさに依存しないと
 * 書いたマージ/上書きの挙動に依存する形になる（santa-method レビュー指摘 2周目
 * 2026-08-30）。**出力は常に分離形へ揃える**——畳んだ値は複数の指定をつないだもので、
 * どちらの元の形を残すかに正解が無い。分離形は値に空白を含んでも1要素のままで
 * （引数配列を渡すので shell の再分割は起きない）、既存の畳み込みとも形が揃う。
 */
export function withMcpToolsAllowed(
  args: string[],
  tools: readonly string[] = [MCP_SERVER_ALLOWED_TOOL],
): string[] {
  // 足す名前は複数を取る。steering 工程は自前サーバーに加えて本家 MCP（`mcp__specworkflow`）
  // も許可が要る——`--mcp-config` に並べるだけでは、claude の一覧に出るのに1つも呼べない。
  // 「呼べないものを見せてから失敗させない」（specs `mcp/server`）は本家 MCP にも同じだけ
  // 当てはまる（santa-method レビュー指摘 4周目 2026-08-30）。
  const merge = (base: string): string => tools.reduce(
    (current, tool) => (current.split(/\s+/).includes(tool)
      ? current
      : [current, tool].filter(part => part !== '').join(' ')),
    base,
  )

  const isFlag = (arg: string): boolean => arg === ALLOWED_TOOLS_FLAG || arg.startsWith(ALLOWED_TOOLS_ASSIGNED)
  const flagIndexes = args.reduce<number[]>(
    (found, arg, index) => (isFlag(arg) ? [...found, index] : found),
    [],
  )
  if (flagIndexes.length === 0) {
    return [...args, ALLOWED_TOOLS_FLAG, merge('')]
  }

  // 値は不透明な1つの文字列として扱う。`Bash(openspec *)` のように値の中に空白が
  // 入るので、割って組み直すと壊れる。
  //
  // 連結形は `=` の右側がその場で値になる（`--allowedTools=` だけなら空の値）。分離形は
  // 末尾、または次が別のフラグならそのフラグには値が無い。ツール名が `-` で始まる
  // ことは無いので、`-` 始まりは次のフラグとみなしてよい（`--allowedTools
  // --disallowedTools ...` のような並びで、別フラグの値を書き換えるのを防ぐ）。
  const assignedValue = (flagIndex: number): string | undefined => {
    const arg = args[flagIndex]!
    return arg === ALLOWED_TOOLS_FLAG ? undefined : arg.slice(ALLOWED_TOOLS_ASSIGNED.length)
  }
  const hasSeparateValue = (flagIndex: number): boolean => {
    if (assignedValue(flagIndex) !== undefined) return false
    const value = args[flagIndex + 1]
    return value !== undefined && !value.startsWith('-')
  }
  const valueOf = (flagIndex: number): string =>
    assignedValue(flagIndex) ?? (hasSeparateValue(flagIndex) ? args[flagIndex + 1]! : '')

  const value = merge(flagIndexes.map(valueOf).filter(part => part !== '').join(' '))

  // 畳んだ結果は先頭のフラグの位置へ置く。2本目以降はフラグごと（分離形の値があれば
  // 値も）落とす。
  const dropped = new Set(
    flagIndexes.slice(1).flatMap(flagIndex =>
      hasSeparateValue(flagIndex) ? [flagIndex, flagIndex + 1] : [flagIndex],
    ),
  )
  const firstFlagIndex = flagIndexes[0]!
  const firstValueIndex = hasSeparateValue(firstFlagIndex) ? firstFlagIndex + 1 : -1

  return args.flatMap((arg, index) => {
    if (dropped.has(index)) return []
    if (index === firstValueIndex) return [value]
    // 先頭のフラグが連結形、または値を伴わない分離形のときは、ここで分離形へ組み直す
    if (index === firstFlagIndex && firstValueIndex === -1) return [ALLOWED_TOOLS_FLAG, value]
    return [arg]
  })
}
