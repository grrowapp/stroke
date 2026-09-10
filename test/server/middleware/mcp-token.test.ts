import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { createEvent, type H3Event } from 'h3';
import { describe, expect, it } from 'vitest';

import mcpToken from '../../../server/middleware/mcp-token';
import {
  issueConnectionToken,
  registerConnection,
  removeConnection,
  resolveConnection,
} from '../../../server/utils/mcp/connection-table';

/**
 * middleware を直に呼ぶための最小の `H3Event`。
 *
 * `event.path` は `node.req.url` から、ヘッダは `node.req.headers` から読まれるので、
 * 素の `IncomingMessage` に両方を載せれば足りる（h3 1.15 の `H3Event` / `getRequestHeaders`）。
 */
function eventFor(url: string, headers: Record<string, string> = {}): H3Event {
  const req = new IncomingMessage(new Socket());
  req.method = 'POST';
  req.url = url;
  Object.assign(req.headers, headers);
  return createEvent(req, new ServerResponse(req));
}

/** middleware に要求を通し、拒否されたときだけその error を返す（通したときは undefined）。 */
function rejectionFor(url: string, headers: Record<string, string> = {}): { statusCode?: number, message?: string } | undefined {
  try {
    mcpToken(eventFor(url, headers));
    return undefined;
  } catch (error) {
    return error as { statusCode?: number, message?: string };
  }
}

describe('MCP の受け口の token 検査', () => {
  it('有効な token を持つ要求は通す', () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    expect(rejectionFor('/mcp', { 'x-stroke-token': token })).toBeUndefined();

    removeConnection(token);
  });

  it('x-stroke-token ヘッダが無い要求は 401 で拒否する', () => {
    // 本文は接続文脈を既定値で補わず、欠落であることだけを伝える（ADR-0014）
    expect(rejectionFor('/mcp')).toMatchObject({
      statusCode: 401,
      message: 'x-stroke-token ヘッダが無い。',
    });
  });

  it('接続表に無い token の要求は 401 で拒否する', () => {
    expect(rejectionFor('/mcp', { 'x-stroke-token': 'never-issued' })).toMatchObject({
      statusCode: 401,
      message: '無効な token。',
    });
  });

  it('HTTP 401 を出すのはこの middleware で、接続表の照合そのものは throw しない', () => {
    // `resolveConnection` は結果で返す（ツールハンドラの中で throw すると結果の平坦形が
    // 崩れるため。specs mcp/server）。「有効な token を持たないツール呼び出しは HTTP 401 で
    // 拒否する」（specs server/session-management）を担うのはここだけになる
    expect(resolveConnection({})).toMatchObject({ ok: false, status: 401 });
    expect(rejectionFor('/mcp')).toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' });
  });

  it('クエリ付き・末尾スラッシュ付きも同じ受け口として検査する（radix3 が /mcp/ を /mcp へ寄せる）', () => {
    expect(rejectionFor('/mcp?transport=http')).toMatchObject({ statusCode: 401 });
    expect(rejectionFor('/mcp/')).toMatchObject({ statusCode: 401 });
  });

  it('/mcp 以外のパスは素通しする（token を持たなくても影響を受けない）', () => {
    for (const url of [
      '/',
      '/api/sessions',
      '/api/strokes/session-1/overview',
      '/mcp/deeplink',
      '/mcp/badge.svg',
      '/mcpx',
    ]) {
      expect(rejectionFor(url)).toBeUndefined();
    }
  });
});
