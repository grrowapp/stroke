import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ofetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ofetch')>();
  return { ...actual, ofetch: vi.fn() };
});

import { createFetchError, ofetch } from 'ofetch';

import { classifySteeringFailure } from '../../../../server/utils/mcp/upstream-fetch';
import { describeUpstreamFailure } from '../../../../server/utils/mcp/upstream-failure';
import { UpstreamRestClient } from '../../../../server/utils/upstream/rest';

describe('describeUpstreamFailure', () => {
  it('not-found（本家は到達できて「無い」と答えた）は unreachable に潰さず実ステータスを保持する', () => {
    const result = describeUpstreamFailure({ kind: 'not-found', path: '/api/projects/PID1/info' });
    expect(result).toEqual({ status: 404, errorCode: 'upstream_error', error: '対象が見つからない' });
  });

  it('not-found で本家の実応答本文（detail）が取れていれば、固定文言で上書きせずそのまま使う', () => {
    const result = describeUpstreamFailure({
      kind: 'not-found',
      path: '/api/projects/PID1/info',
      detail: 'Project not found',
    });
    expect(result).toEqual({ status: 404, errorCode: 'upstream_error', error: 'Project not found' });
  });

  it('error-response（本家が 500 で応答した）は unreachable に潰さず実ステータスを保持する', () => {
    const result = describeUpstreamFailure({
      kind: 'error-response',
      path: '/api/projects/PID1/info',
      status: 500,
      reason: '[GET] "/api/projects/PID1/info": 500 Error',
      detail: 'Failed to get project info',
    });
    expect(result).toEqual({ status: 500, errorCode: 'upstream_error', error: 'Failed to get project info' });
  });

  it('error-response の 400（本家が引数を拒否した）は validation_error にする', () => {
    // upstream-fetch.ts の classifySteeringFailure が本家の 400 を validation_error に
    // 写すので、ここで upstream_error にすると同じ状況に2つの errorCode が付く。
    // get-steering は1回の実行で両方の経路を通る（specs mcp/server「同じ状況には全ツールで
    // 同じ errorCode を使う」SHALL）
    const result = describeUpstreamFailure({
      kind: 'error-response',
      path: '/api/projects/PID1/info',
      status: 400,
      reason: '[GET] "/api/projects/PID1/info": 400 Bad Request',
      detail: 'Invalid project id',
    });
    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: 'Invalid project id' });
  });

  it('error-response で本家の応答本文が取れなければ、発行時のメッセージを使う', () => {
    const result = describeUpstreamFailure({
      kind: 'error-response',
      path: '/api/projects/list',
      status: 403,
      reason: '[GET] "/api/projects/list": 403 Forbidden',
    });
    expect(result).toEqual({
      status: 403,
      errorCode: 'upstream_error',
      error: '[GET] "/api/projects/list": 403 Forbidden',
    });
  });

  it('unreachable（本家に届かない）は 502 に固定する', () => {
    const result = describeUpstreamFailure({ kind: 'unreachable', path: '/api/projects/PID1/info', reason: 'ECONNREFUSED' });
    expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: '本家に繋がらない: ECONNREFUSED' });
    // 同じ状況（接続不可）を、もう一方の経路（upstreamFetch → classifySteeringFailure）が
    // どう写すか。get-steering は1回の実行で両方を通るので、ここが割れてはならない
    // （santa-method レビュー指摘 7周目 2026-08-30）
    expect(classifySteeringFailure(new Error('ECONNREFUSED'))).toEqual(result);
  });

  it('not-configured（本家の URL 未設定）も unreachable として扱う', () => {
    const result = describeUpstreamFailure({ kind: 'not-configured' });
    expect(result).toEqual({
      status: 502,
      errorCode: 'unreachable',
      error: '本家ダッシュボードの URL が設定されていない',
    });
  });

  it('malformed（本家は 2xx で答えたが形が違う）は unreachable に潰さず upstream_malformed にする', () => {
    const result = describeUpstreamFailure({ kind: 'malformed', path: '/api/projects/PID1/info', reason: '型が違う' });
    expect(result).toEqual({
      status: 502,
      errorCode: 'upstream_malformed',
      error: '本家のペイロードが想定と違う: 型が違う',
    });
  });
});

/**
 * kind を直に与えるだけでは、`UpstreamRestClient` が例外をどの kind に写すかの段が
 * 抜ける。以前はそこで 404 以外の全失敗が `unreachable` に畳まれており、本家が 500 を
 * 返しても結果は 502 `unreachable` になっていた。ここは本家の応答から結果までを通す。
 */
describe('本家の応答から MCP ツールの結果まで', () => {
  const ofetchMock = vi.mocked(ofetch);
  const client = new UpstreamRestClient('http://localhost:1234');

  function fetchErrorWith(status: number, data: unknown): unknown {
    return createFetchError({
      request: '/api/example',
      options: {},
      response: { status, statusText: 'Error', _data: data } as never,
    } as never);
  }

  beforeEach(() => {
    ofetchMock.mockReset();
  });

  it('本家が 500 を返したら 500 upstream_error（到達しているので unreachable ではない）', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(500, { error: 'Failed to get project info' }));

    const result = await client.getProjectInfo('PID1');
    if (result.ok) throw new Error('失敗するはずの呼び出しが成功した');

    expect(describeUpstreamFailure(result.failure)).toEqual({
      status: 500,
      errorCode: 'upstream_error',
      error: 'Failed to get project info',
    });
  });

  it('本家が 400 を返したら 400 validation_error（upstream-fetch の分類と同じ値）', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(400, { error: 'Invalid steering document name' }));

    const result = await client.getProjectInfo('PID1');
    if (result.ok) throw new Error('失敗するはずの呼び出しが成功した');

    expect(describeUpstreamFailure(result.failure)).toEqual({
      status: 400,
      errorCode: 'validation_error',
      error: 'Invalid steering document name',
    });
    // 同じ状況（本家の 400）を、もう一方の経路（upstreamFetch → classifySteeringFailure）が
    // どう写すか。get-steering は1回の実行で両方を通るので、ここが割れてはならない
    expect(classifySteeringFailure(fetchErrorWith(400, { error: 'Invalid steering document name' }))).toEqual({
      status: 400,
      errorCode: 'validation_error',
      error: 'Invalid steering document name',
    });
  });

  it('本家が 403 を返したら 403 upstream_error', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(403, { error: 'Forbidden' }));

    const result = await client.listProjects();
    if (result.ok) throw new Error('失敗するはずの呼び出しが成功した');

    expect(describeUpstreamFailure(result.failure)).toEqual({
      status: 403,
      errorCode: 'upstream_error',
      error: 'Forbidden',
    });
  });

  it('本家が 2xx で想定外の形を返したら upstream_malformed（稼働しているので unreachable ではない）', async () => {
    ofetchMock.mockResolvedValue({ projects: [] });

    const result = await client.listProjects();
    if (result.ok) throw new Error('失敗するはずの呼び出しが成功した');

    const described = describeUpstreamFailure(result.failure);
    expect(described.errorCode).toBe('upstream_malformed');
    expect(described.status).toBe(502);
  });

  it('本家に届かないときだけ 502 unreachable', async () => {
    ofetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1234'));

    const result = await client.listProjects();
    if (result.ok) throw new Error('失敗するはずの呼び出しが成功した');

    expect(describeUpstreamFailure(result.failure)).toEqual({
      status: 502,
      errorCode: 'unreachable',
      error: '本家に繋がらない: connect ECONNREFUSED 127.0.0.1:1234',
    });
  });
});
