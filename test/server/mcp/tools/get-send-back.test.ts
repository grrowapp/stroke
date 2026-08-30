import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getSendBackTool } = await import('../../../../server/mcp/tools/get-send-back');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { $fetch } = await import('#build/fetch.mjs') as unknown as {
  $fetch: ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> },
};
const getSendBackHandler = (headers: Record<string, string>) => structuredResult(getSendBackTool.handler({}, withHeaders(headers)));

const PAYLOAD = { response: '要約', comments: [], annotations: '{}', nextSteps: ['直す'] };

describe('get-send-back', () => {
  beforeEach(() => {
    $fetch.mockClear();
    $fetch.raw.mockClear();
  });

  it('A4 が 200 を返せば status:200 と指摘一式を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockResolvedValueOnce({ status: 200, _data: PAYLOAD });

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, ...PAYLOAD });
    expect($fetch.raw).toHaveBeenCalledWith('/api/strokes/session-1/send-back');
    removeConnection(token);
  });

  it('A4 が 200 以外の成功を返せば、その実ステータスをそのまま載せる', async () => {
    // status は定数ではなく代行先の実応答から導く（specs mcp/server「代行先が応答を
    // 返したなら、その status を保持する」SHALL）
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockResolvedValueOnce({ status: 203, _data: PAYLOAD });

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 203, ...PAYLOAD });
    removeConnection(token);
  });

  it('差し戻しがまだ無いと no_send_back として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: '差し戻しはまだ無い。' }));

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'no_send_back', error: '差し戻しはまだ無い。' });
    removeConnection(token);
  });

  it('セッションが無いと同じ404でも session_not_found として区別する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-missing' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'session_not_found', error: 'そのセッションは無い。' });
    removeConnection(token);
  });

  it('steering 接続から呼ばれても throw せず 400 connection_mismatch を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({
      status: 400,
      errorCode: 'connection_mismatch',
      error: 'この接続は flontier 工程向けではない。',
    });
    expect($fetch.raw).not.toHaveBeenCalled();
    removeConnection(token);
  });

  it('既知の2文言でない 404 は no_send_back に寄せず unexpected_status とする', async () => {
    // ルート不一致などの見覚えのない 404 まで「差し戻しはまだ無い」に畳むと、受け手は存在
    // しない原因を直そうとする（specs mcp/server「契約に載せた状況へ無理に寄せてはならない」
    // MUST NOT）
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'Cannot find any route matching.' }));

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'unexpected_status', error: 'Cannot find any route matching.' });
    removeConnection(token);
  });

  it('inputSchema は引数なしの呼び出しを通す（SDK の事前検証で弾かせない）', () => {
    // 必須項目があると SDK がハンドラより前に McpError(InvalidParams) を投げ、結果が status も
    // errorCode も持たなくなる（specs mcp/server の平坦形式の SHALL は無条件）
    expect(acceptsEmptyArgs(getSendBackTool.inputSchema)).toBe(true);
  });

  it('破損データで 500 が返っても no_send_back に誤ラベルしない', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(500, { message: 'state.json が壊れている。' }));

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: 'state.json が壊れている。' });
    removeConnection(token);
  });

  it('token が無効でも throw せず 401 unauthorized を返し、A4 を叩かない', async () => {
    // throw すると status も errorCode も持たない isError テキストになり、結果の平坦形が
    // 崩れる（specs mcp/server は無条件）。HTTP 401 は middleware が担う
    const result = await getSendBackHandler({ 'x-stroke-token': 'never-issued' });

    expect(result).toEqual({ status: 401, errorCode: 'unauthorized', error: '無効な token。' });
    expect($fetch.raw).not.toHaveBeenCalled();
  });
});
