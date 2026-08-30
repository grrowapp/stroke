import { createFetchError } from 'ofetch';
import { expect, vi } from 'vitest';
import { z, type ZodRawShape } from 'zod';

/**
 * ツール定義の `inputSchema` が、引数を1つも渡さない呼び出しを通すか。
 *
 * MCP SDK は `inputSchema` を**ハンドラより前に**検証し、通らなければ
 * `McpError(InvalidParams)` を投げる（`@modelcontextprotocol/sdk/dist/esm/server/mcp.js`:
 * 125 行で `validateToolInput` を呼び、その中の 174-178 行で `safeParseAsync` の失敗を
 * 投げる。ハンドラを呼ぶのは 126 行）。モジュールの try/catch はハンドラの内側しか
 * 覆わない（`@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/tools.js` 36-44 行）
 * ので、必須項目を欠いた呼び出しは `status` も `errorCode` も持たない結果になり、
 * specs `mcp/server` の平坦形式の SHALL（無条件）を破る。
 *
 * ハンドラを直に呼ぶテストはこの段を素通りしてしまうため、ここだけは SDK と同じ手順
 * （`z.object(inputSchema).safeParse(args)`）で検証そのものを確かめる。
 */
export function acceptsEmptyArgs(inputSchema: ZodRawShape | undefined): boolean {
  // `inputSchema` を持たないツールは事前検証そのものが走らない（mcp.js 167-169 行）
  if (inputSchema === undefined) return true;
  return z.object(inputSchema).safeParse({}).success;
}

/**
 * ツールの結果から `structuredContent` を取り出す。取り出す前に、包まれていること自体を
 * 検証する。
 *
 * ツールは `outputSchema` を宣言しているので、`structuredContent` を持たない結果は
 * MCP SDK に弾かれ、**そのツールは1回も使えない**（実測 2026-08-27:
 * `MCP error -32602: Output validation error: Tool get-overview has an output schema
 * but no structured content was provided`）。素の返り値だけを見ていると、この状態でも
 * テストは全部通ってしまう。ここを通すことで、全ツールの全ケースがエンベロープの
 * 有無も併せて検証する。包むのは `server/utils/mcp/define-tool.ts`。
 */
export async function structuredResult(call: Promise<unknown>): Promise<unknown> {
  const result = await call;
  expect(result).toHaveProperty('structuredContent');
  return (result as { structuredContent: unknown }).structuredContent;
}

/** ツールハンドラのテスト用に `$fetch` が投げる失敗を組み立てる。 */
export function fetchErrorWith(status: number, data: unknown): unknown {
  return createFetchError({
    request: '/api/example',
    options: {},
    response: { status, statusText: 'Error', _data: data } as never,
  } as never);
}

/**
 * Nitro の全域 `$fetch` は unimport によって `#build/fetch.mjs` からの import に置き換わる
 * （`.nuxt/imports.d.ts`: `export { $fetch } from '#build/fetch.mjs'`）。バニラの vitest には
 * Nitro の実行時が無く、この仮想モジュールを解決すると baseURL の無い生の ofetch が出てくる
 * ため、相対パスの発行が Invalid URL で落ちる（実測）。テストは `vi.mock('#build/fetch.mjs', ...)`
 * でこの仮想モジュールごと差し替える。
 *
 * 使い方（呼び出し側のテストファイルの先頭、import より前に置く。`vi.mock` は hoist される）:
 * ```ts
 * vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }))
 * ```
 */
export function mockFetch(): ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> } {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> };
  fn.raw = vi.fn();
  return fn;
}

/**
 * ツール定義（`server/mcp/tools/*.ts` の default export）のハンドラを、
 * `extra.requestInfo.headers` を渡して直に呼ぶための最小の `extra`。
 *
 * `@nuxtjs/mcp-toolkit/server` は呼び出し側テストファイルの先頭で
 * `vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def) => def }))`
 * により丸ごと差し替える（バレル経由で `#nuxt-mcp-toolkit/tools.mjs` という
 * Nuxt 仮想モジュールを踏むため、素の vitest では解決できない・実測）。
 * これにより `defineMcpTool` は恒等関数になり、default export はツール定義
 * オブジェクトそのもの（`{ handler, ... }`）になる。
 */
export function withHeaders(headers: Record<string, string | string[] | undefined>): never {
  return { requestInfo: { headers } } as never;
}
