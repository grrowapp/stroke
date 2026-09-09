import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getStrokesTool } = await import('../../../../server/mcp/tools/get-strokes');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { $fetch } = await import('#build/fetch.mjs') as unknown as {
  $fetch: ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> },
};
const getStrokesHandler = (headers: Record<string, string>) => structuredResult(getStrokesTool.handler({}, withHeaders(headers)));

const STROKES = [{ proposal: false, question: { header: 'h', detail: 'd', question: 'q', options: [] }, answer: { kind: 'free', value: 'a' } }];

describe('get-strokes', () => {
  beforeEach(() => {
    $fetch.mockClear();
    $fetch.raw.mockClear();
  });

  it('U3 が 200 を返せば status:200 と時系列の記録一覧を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockResolvedValueOnce({ status: 200, _data: { strokes: STROKES } });

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, strokes: STROKES });
    expect($fetch.raw).toHaveBeenCalledWith('/api/sessions/session-1/strokes');
    removeConnection(token);
  });

  it('U3 が 200 以外の成功を返せば、その実ステータスをそのまま載せる', async () => {
    // status は定数ではなく代行先の実応答から導く（specs mcp/server「代行先が応答を
    // 返したなら、その status を保持する」SHALL）
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockResolvedValueOnce({ status: 203, _data: { strokes: STROKES } });

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 203, strokes: STROKES });
    removeConnection(token);
  });

  it('セッションが無いと 404 を返し、session_not_found として整形する', async () => {
    // 同じ状況（代行先の 404）には全ツールで同じ errorCode を使う（specs mcp/server）
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-missing' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'session_not_found', error: 'そのセッションは無い。' });
    removeConnection(token);
  });

  it('既知の文言でない 404 は session_not_found に寄せず unexpected_status とする', async () => {
    // ルート不一致などの見覚えのない 404 まで「そのセッションは無い」に畳むと、受け手は
    // 存在しない原因を直そうとする（specs mcp/server「契約に載せた状況へ無理に寄せては
    // ならない」MUST NOT）。get-overview / get-send-back と同じ守り
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'Cannot find any route matching.' }));

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'unexpected_status', error: 'Cannot find any route matching.' });
    removeConnection(token);
  });

  it('steering 接続から呼ばれても throw せず 400 connection_mismatch を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({
      status: 400,
      errorCode: 'connection_mismatch',
      error: 'この接続は flontier 工程向けではない。',
    });
    expect($fetch.raw).not.toHaveBeenCalled();
    removeConnection(token);
  });

  it('inputSchema は引数なしの呼び出しを通す（SDK の事前検証で弾かせない）', () => {
    // 必須項目があると SDK がハンドラより前に McpError(InvalidParams) を投げ、結果が status も
    // errorCode も持たなくなる（specs mcp/server の平坦形式の SHALL は無条件）
    expect(acceptsEmptyArgs(getStrokesTool.inputSchema)).toBe(true);
  });

  it('破損データで 500 が返っても session_not_found に誤ラベルしない', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(500, { message: 'strokes.json が壊れている。' }));

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: 'strokes.json が壊れている。' });
    removeConnection(token);
  });

  it('token が無効でも throw せず 401 unauthorized を返し、U3 を叩かない', async () => {
    // throw すると status も errorCode も持たない isError テキストになり、結果の平坦形が
    // 崩れる（specs mcp/server は無条件）。HTTP 401 は middleware が担う
    const result = await getStrokesHandler({ 'x-stroke-token': 'never-issued' });

    expect(result).toEqual({ status: 401, errorCode: 'unauthorized', error: '無効な token。' });
    expect($fetch.raw).not.toHaveBeenCalled();
  });
});
