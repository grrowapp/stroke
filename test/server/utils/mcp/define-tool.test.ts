import { describe, expect, it, vi } from 'vitest';

// `@nuxtjs/mcp-toolkit/server` のバレルは Nuxt 仮想モジュール（`#nuxt-mcp-toolkit/tools.mjs`）
// を踏むので素の vitest では解決できない（support.ts と同じ理由）。`defineMcpTool` は
// 恒等関数に差し替え、`defineStrokeTool` の包み方だけを見る。
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

// 結果の整形は**モジュールの実物**を使う。ここを自前の模造品にすると、
// 「素のオブジェクトには structuredContent が付かない」という当の挙動を検証できない。
// 0.x 固定の依存なので、更新でこの path が変わればテストが落ちて気付ける。
const { normalizeToolResult } = await import(
  '../../../../node_modules/@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/results.js'
) as { normalizeToolResult: (result: unknown) => { structuredContent?: unknown; content?: unknown[] } };

const { defineStrokeTool } = await import('../../../../server/utils/mcp/define-tool');

describe('defineStrokeTool', () => {
  it('包んだ結果は normalizeToolResult を通しても structuredContent を保つ', async () => {
    const tool = defineStrokeTool({
      description: 'テスト用',
      inputSchema: {},
      handler: async () => ({ status: 200, overview: '概要' }),
    } as never);

    const normalized = normalizeToolResult(await tool.handler({} as never, {} as never));

    expect(normalized.structuredContent).toEqual({ status: 200, overview: '概要' });
  });

  it('包まずに素のオブジェクトを返すと structuredContent が落ちる（このバグの再現）', () => {
    const normalized = normalizeToolResult({ status: 200, overview: '概要' });

    // `outputSchema` を宣言したツールがこれを返すと、MCP SDK が
    // `Output validation error: ... no structured content was provided` で弾く。
    // 実測 2026-08-27。defineStrokeTool はこれを避けるために在る。
    expect(normalized.structuredContent).toBeUndefined();
  });
});
