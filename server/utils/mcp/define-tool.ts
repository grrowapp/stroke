import type { ZodRawShape } from 'zod'
import { defineMcpTool, type McpToolDefinition } from '@nuxtjs/mcp-toolkit/server'

/**
 * `defineMcpTool` の薄い包み。ハンドラが返した素のオブジェクトを
 * `structuredContent` として返す形に整える。
 *
 * **これが無いと `outputSchema` を宣言したツールは1つも動かない。** モジュールの
 * `normalizeToolResult`（`@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/results.js`）
 * は、CallToolResult でない素のオブジェクトを `content`（テキスト）だけに包み、
 * `structuredContent` を付けない。その結果を `outputSchema` 付きのツールが返すと、
 * MCP SDK が弾く:
 *
 * ```
 * MCP error -32602: Output validation error:
 * Tool get-overview has an output schema but no structured content was provided
 * ```
 *
 * （実測 2026-08-27。ブラウザ操作の往復で6ツールすべてがこのエラーで失敗した）
 *
 * ツールごとの `return` で包むのではなく定義の入口で包むのは、包み忘れが1箇所でも
 * あるとそのツールだけ静かに壊れるためである。型は `defineMcpTool` のものをそのまま
 * 引き継ぎ、`inputSchema` から `args` が推論される性質を保つ。
 */
export function defineStrokeTool<
  const InputSchema extends ZodRawShape | undefined = ZodRawShape,
  const OutputSchema extends ZodRawShape = ZodRawShape,
>(
  definition: McpToolDefinition<InputSchema, OutputSchema>,
): McpToolDefinition<InputSchema, OutputSchema> {
  const { handler, ...rest } = definition

  return defineMcpTool<InputSchema, OutputSchema>({
    ...rest,
    handler: (async (...callArgs: unknown[]) => ({
      structuredContent: await (handler as (...a: unknown[]) => unknown)(...callArgs),
    })) as typeof handler,
  } as McpToolDefinition<InputSchema, OutputSchema>)
}
