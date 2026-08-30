/**
 * 本家への発行が失敗したとき、何が起きたのかを取り違えずに返せているかを確かめる。
 *
 * 「届いた上で拒否された」を「届かない」に畳むと、呼び出し側は出し直せば直るのか
 * 環境の問題なのかを区別できなくなる（provide-operations-via-mcp design.md）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ofetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ofetch')>();
  return { ...actual, ofetch: vi.fn() };
});

const { createFetchError, ofetch } = await import('ofetch');
const { UpstreamRestClient } = await import('../../../../server/utils/upstream/rest');

const ofetchMock = vi.mocked(ofetch);

/** 本家が状態コード付きで応答したときに ofetch が投げる失敗 */
function fetchErrorWith(status: number, data: unknown): unknown {
  return createFetchError({
    request: '/api/example',
    options: {},
    response: { status, statusText: 'Error', _data: data } as never,
  } as never);
}

const client = new UpstreamRestClient('http://localhost:1234');

describe('UpstreamRestClient の失敗の分け方', () => {
  beforeEach(() => {
    ofetchMock.mockReset();
  });

  it('本家が 500 を返したら、届いた失敗として状態コードと本文を保つ', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(500, { error: 'Failed to get project info' }));

    const result = await client.getProjectInfo('PID1');

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'error-response',
        path: '/api/projects/PID1/info',
        status: 500,
        reason: expect.any(String),
        detail: 'Failed to get project info',
      },
    });
  });

  it('本家が 403 を返したときも同じ（4xx でも unreachable に畳まない）', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(403, { error: 'Forbidden' }));

    const result = await client.listProjects();

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'error-response',
        path: '/api/projects/list',
        status: 403,
        reason: expect.any(String),
        detail: 'Forbidden',
      },
    });
  });

  it('本家が 404 を返したら not-found（他のエラー応答と見せ方が違う）', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(404, { error: 'Project not found' }));

    const result = await client.getProjectInfo('PID1');

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'not-found', path: '/api/projects/PID1/info', detail: 'Project not found' },
    });
  });

  it('状態コードが取れない失敗（接続拒否）だけが unreachable になる', async () => {
    ofetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1234'));

    const result = await client.listProjects();

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'unreachable',
        path: '/api/projects/list',
        reason: 'connect ECONNREFUSED 127.0.0.1:1234',
      },
    });
  });

  it('本家の URL が未設定なら発行せず not-configured', async () => {
    const result = await new UpstreamRestClient(null).listProjects();

    expect(result).toEqual({ ok: false, failure: { kind: 'not-configured' } });
    expect(ofetchMock).not.toHaveBeenCalled();
  });

  it('応答は返ったが形が想定と違えば malformed', async () => {
    ofetchMock.mockResolvedValue({ projects: 'not an array' });

    const result = await client.listProjects();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('失敗するはずの呼び出しが成功した');
    expect(result.failure.kind).toBe('malformed');
  });

  it('保存（PUT）も取得と同じ分け方をする', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(500, { error: 'Failed to save document' }));

    const result = await client.saveSteeringDocument('PID1', 'product', '# product');

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'error-response',
        path: '/api/projects/PID1/steering/product',
        status: 500,
        reason: expect.any(String),
        detail: 'Failed to save document',
      },
    });
  });

  it('承認への応答（POST）も取得と同じ分け方をする', async () => {
    ofetchMock.mockRejectedValue(fetchErrorWith(500, { error: 'Failed to update approval' }));

    const result = await client.respondToApproval('PID1', 'AID1', 'approve', '');

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'error-response',
        path: '/api/projects/PID1/approvals/AID1/approve',
        status: 500,
        reason: expect.any(String),
        detail: 'Failed to update approval',
      },
    });
  });
});
