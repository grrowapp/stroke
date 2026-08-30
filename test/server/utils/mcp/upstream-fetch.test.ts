import { createFetchError } from 'ofetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { documentContentSchema } from '../../../../server/utils/upstream/schema';

/**
 * `readServerConfig` は `#imports` の `useRuntimeConfig` を踏むので、丸ごと差し替えて
 * baseURL だけを与える。
 */
vi.mock('../../../../server/utils/config', () => ({ readServerConfig: vi.fn() }));

const { classifySteeringFailure, upstreamFetch } = await import('../../../../server/utils/mcp/upstream-fetch');
const { readServerConfig } = await import('../../../../server/utils/config');

const readServerConfigMock = vi.mocked(readServerConfig);

const UPSTREAM_BASE_URL = 'http://upstream.test';
const STEERING_PATH = '/api/projects/PID1/steering/product';

function fetchErrorWith(status: number, data: unknown): unknown {
  return createFetchError({
    request: '/api/example',
    options: {},
    response: { status, statusText: 'Error', _data: data } as never,
  } as never);
}

/**
 * 本家の応答を組み立てる。
 *
 * `ofetch` の本文の解釈（content-type の判定と `destr`）を実物のまま通したいので、
 * `ofetch` をモックせず `fetch` を差し替える。素の `ofetch` で本文だけを受けていた頃の
 * 取りこぼし（2xx なのに形が違う本文）は、ここを通さないと再現しない。
 */
function upstreamResponse(status: number, body: BodyInit | null, contentType = 'application/json'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

const fetchMock = vi.fn();

/** `upstreamFetch` が投げた失敗を、ツールが返すのと同じ形（分類を通した後）で見る。 */
async function failureOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return classifySteeringFailure(error);
  }
  throw new Error('失敗すべき呼び出しが成功した。');
}

describe('upstreamFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    readServerConfigMock.mockReset();
    readServerConfigMock.mockReturnValue({ upstreamBaseUrl: UPSTREAM_BASE_URL } as ReturnType<typeof readServerConfig>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('想定の形の 200 なら、実ステータスと検証済みの本文を返す', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(200, JSON.stringify({
      content: '# product',
      lastModified: '2026-08-30T00:00:00.000Z',
    })));

    const result = await upstreamFetch(STEERING_PATH, documentContentSchema);

    expect(result).toEqual({ status: 200, data: { content: '# product' } });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${UPSTREAM_BASE_URL}${STEERING_PATH}`);
  });

  it('200 以外の成功（201）でも、その status をそのまま載せる', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(201, JSON.stringify({ success: true, message: 'saved' })));

    const result = await upstreamFetch(STEERING_PATH, z.unknown(), {
      method: 'PUT',
      body: { content: '# product' },
    });

    expect(result).toEqual({ status: 201, data: { success: true, message: 'saved' } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ content: '# product' }) });
  });

  it('本文を使わない発行（z.unknown()）は、本文の無い 204 でも成功として扱う', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(204, null));

    const result = await upstreamFetch(STEERING_PATH, z.unknown(), { method: 'PUT', body: { content: '# product' } });

    expect(result).toEqual({ status: 204, data: undefined });
  });

  it('200 だが空ボディなら upstream_malformed（content 欠落のまま成功にしない）', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(200, ''));

    expect(await failureOf(upstreamFetch(STEERING_PATH, documentContentSchema))).toEqual({
      status: 502,
      errorCode: 'upstream_malformed',
      error: expect.stringContaining('本家のペイロードが想定と違う'),
    });
  });

  it('200 だが本文が HTML なら upstream_malformed', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(200, '<html><body>proxy</body></html>', 'text/html'));

    expect(await failureOf(upstreamFetch(STEERING_PATH, documentContentSchema))).toEqual({
      status: 502,
      errorCode: 'upstream_malformed',
      error: expect.stringContaining('本家のペイロードが想定と違う'),
    });
  });

  it('200 だが想定と違う形の JSON なら upstream_malformed', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(200, JSON.stringify({ document: '# product' })));

    expect(await failureOf(upstreamFetch(STEERING_PATH, documentContentSchema))).toEqual({
      status: 502,
      errorCode: 'upstream_malformed',
      error: expect.stringContaining('本家のペイロードが想定と違う'),
    });
  });

  it('200 だが本文が null でも TypeError にせず upstream_malformed にする', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(200, 'null'));

    const failure = await failureOf(upstreamFetch(STEERING_PATH, documentContentSchema));

    expect(failure).toEqual({
      status: 502,
      errorCode: 'upstream_malformed',
      error: expect.stringContaining('本家のペイロードが想定と違う'),
    });
    // `document.content` を無防備に読んで TypeError → unreachable に落ちていた経路
    expect(failure).not.toMatchObject({ errorCode: 'unreachable' });
  });

  it('本文の無い 204 は、形を要求する取得では upstream_malformed になる', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(204, null));

    expect(await failureOf(upstreamFetch(STEERING_PATH, documentContentSchema))).toEqual({
      status: 502,
      errorCode: 'upstream_malformed',
      error: expect.stringContaining('本家のペイロードが想定と違う'),
    });
  });

  it('本家がエラー応答を返したら形の検証まで進まず、実ステータスを保つ', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(500, JSON.stringify({ error: 'Failed to save steering document' })));

    expect(await failureOf(upstreamFetch(STEERING_PATH, documentContentSchema))).toEqual({
      status: 500,
      errorCode: 'upstream_error',
      error: 'Failed to save steering document',
    });
  });

  // 文言は `describeUpstreamFailure`（`upstream-proxy.ts` の `toHttpError` 由来）と同一。
  // `get-steering` は1回の実行で両方の経路を通りうるので、同じ原因の `error` を割らない
  it('本家の URL が未設定なら、発行せず unreachable(502) にする', async () => {
    readServerConfigMock.mockReturnValue({ upstreamBaseUrl: null } as ReturnType<typeof readServerConfig>);

    expect(await failureOf(upstreamFetch(STEERING_PATH, documentContentSchema))).toEqual({
      status: 502,
      errorCode: 'unreachable',
      error: '本家ダッシュボードの URL が設定されていない',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('classifySteeringFailure', () => {
  it('400 は validation_error として実応答をそのまま持つ', () => {
    const result = classifySteeringFailure(fetchErrorWith(400, { error: 'Invalid steering document name' }));
    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: 'Invalid steering document name' });
  });

  it('本家が到達できて答えた 500 は unreachable に潰さず実ステータスを保持する', () => {
    const result = classifySteeringFailure(fetchErrorWith(500, { error: 'Failed to save steering document' }));
    expect(result).toEqual({ status: 500, errorCode: 'upstream_error', error: 'Failed to save steering document' });
  });

  it('status を持たない失敗（接続不可）は unreachable(502) にし、文言も describeUpstreamFailure と揃える', () => {
    // `get-steering` は1回の実行で両方の経路を通りうる。同じ原因（接続不可）の error が
    // 割れると受け手が別の失敗と読むので、`toHttpError` の語彙へ寄せる
    // （santa-method レビュー指摘 7周目 2026-08-30）
    const result = classifySteeringFailure(new Error('connect ECONNREFUSED'));
    expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: '本家に繋がらない: connect ECONNREFUSED' });
  });
});
