import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: sendQuestionTool } = await import('../../../../server/mcp/tools/send-question');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { $fetch } = await import('#build/fetch.mjs') as unknown as {
  $fetch: ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> },
};
const sendQuestionHandler = (args: unknown, headers: Record<string, string>) => structuredResult(sendQuestionTool.handler(args as never, withHeaders(headers)));

const QUESTION = { header: 'h', detail: 'd', question: 'q', options: [] };

describe('send-question', () => {
  beforeEach(() => {
    $fetch.mockClear();
    $fetch.raw.mockClear();
  });

  it('A5 の実際の応答ステータスをそのまま返す（受理は本文なしの204）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockResolvedValueOnce({ status: 204 });

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 204 });
    expect($fetch.raw).toHaveBeenCalledWith(
      '/api/strokes/session-1/question',
      expect.objectContaining({ method: 'POST', body: QUESTION }),
    );
    removeConnection(token);
  });

  it('送信先の検証に通らないと 400 validation_error として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(400, { message: '問いの構造として読み取れない。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: '問いの構造として読み取れない。' });
    removeConnection(token);
  });

  it('違反の一覧が付いた 400 の本文も、書き換えずにそのまま届ける', async () => {
    // 受け口は違反を全件返す（openspec/specs/api/request-validation）。ツールが要約したり
    // 切り詰めたりすると、送り手は何を直せばよいか分からないまま送り直すことになる
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    const body = '問いの構造として読み取れない。'
      + 'header: 話題タグは12字まで。（現在 13）'
      + ' / options.0.description: 選択肢の説明は50字まで。（現在 51）';
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(400, { message: body }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: body });
    removeConnection(token);
  });

  it('セッションが無いと 404 session_not_found として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-missing' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

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

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'unexpected_status', error: 'Cannot find any route matching.' });
    removeConnection(token);
  });

  it('steering 接続から呼ばれても throw せず 400 connection_mismatch を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({
      status: 400,
      errorCode: 'connection_mismatch',
      error: 'この接続は flontier 工程向けではない。',
    });
    expect($fetch.raw).not.toHaveBeenCalled();
    removeConnection(token);
  });

  it('承認済みセッションには 409 phase_conflict として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-approved' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(409, { message: '承認済みのセッションには提出できない。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 409, errorCode: 'phase_conflict', error: '承認済みのセッションには提出できない。' });
    removeConnection(token);
  });

  it('想定外のステータスは unexpected_status として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(500, { message: '想定外の失敗。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: '想定外の失敗。' });
    removeConnection(token);
  });

  it('inputSchema は引数なしの呼び出しを通す（SDK の事前検証で弾かせない）', () => {
    // 必須にすると SDK がハンドラより前に McpError(InvalidParams) を投げ、結果が status も
    // errorCode も持たなくなる（specs mcp/server の平坦形式の SHALL は無条件）
    expect(acceptsEmptyArgs(sendQuestionTool.inputSchema)).toBe(true);
  });

  it('項目を省いた呼び出しも A5 へそのまま渡し、A5 の 400 と違反箇所を載せる', async () => {
    // 検証の正は送信先にある（specs mcp/tools/question「ツール側で引数の値の検証を行って
    // 送信を止めてはならない」MUST NOT）。ツール側で止めると、送り手は何を直せばよいかを
    // 代行先の文言として受け取れない
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    const body = '問いの構造として読み取れない。'
      + 'header: 話題タグが無い。'
      + ' / question: 問いの本文が無い。'
      + ' / options: 選択肢が無い。';
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(400, { message: body }));

    const result = await sendQuestionHandler({}, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: body });
    expect($fetch.raw).toHaveBeenCalledWith(
      '/api/strokes/session-1/question',
      expect.objectContaining({ method: 'POST', body: {} }),
    );
    removeConnection(token);
  });

  it('token が無効でも throw せず 401 unauthorized を返し、A5 を叩かない', async () => {
    // throw すると status も errorCode も持たない isError テキストになり、結果の平坦形が
    // 崩れる（specs mcp/server は無条件）。HTTP 401 は middleware が担う
    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': 'never-issued' });

    expect(result).toEqual({ status: 401, errorCode: 'unauthorized', error: '無効な token。' });
    expect($fetch.raw).not.toHaveBeenCalled();
  });
});
