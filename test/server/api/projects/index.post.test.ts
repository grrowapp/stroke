import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { stubNitroGlobals, type FakeEvent } from '../support';

/**
 * 対象は `server/api/projects/index.post.ts`（P2）。
 * spec は openspec/specs/api/project/generate（update-project-generation-via-upstream-rest）。
 *
 * 見るのは3つ。(1) 親の直下1階層の絶対パスだけを受理し、本家の登録の REST へそのまま
 * 依頼して 204 を返すこと。(2) 形に合わないパスは 400 で断り、本家へは何も依頼しないこと。
 * (3) 本家に届かない・断られた・形が違うときは 503 / 502 で、何も変えないこと。
 *
 * **判定を持たない。** `state.json` を読まず、phase も `invocation` も書かず、上層へ配信
 * しない（ADR-0014）。session-store と board はまるごと差し替えて、呼ばれないことを見る。
 */

const SHARE_ROOT = '/opt/share';

const { registerProject, readState, writeState, broadcastProjectCreation } = vi.hoisted(() => ({
  registerProject: vi.fn(),
  readState: vi.fn(async () => { throw new Error('読まれてはならない'); }),
  writeState: vi.fn(async () => { throw new Error('書かれてはならない'); }),
  broadcastProjectCreation: vi.fn(() => undefined),
}));

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: SHARE_ROOT }),
}));

vi.mock('../../../../server/utils/control/upstream-proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/utils/control/upstream-proxy')>();
  return { ...actual, upstreamClient: () => ({ registerProject }) };
});

vi.mock('../../../../server/utils/stroke/session-store', () => ({ readState, writeState }));
vi.mock('../../../../server/utils/control/board', () => ({ broadcastProjectCreation }));

stubNitroGlobals();

const { default: generateHandler } = await import('../../../../server/api/projects/index.post');

const PROJECT_PATH = join(SHARE_ROOT, 'made-app');

function eventWith(body: unknown): FakeEvent {
  return { params: {}, body, status: undefined };
}

async function statusOf(body: unknown): Promise<number> {
  try {
    const response = await generateHandler(eventWith(body) as never);
    return (response as Response).status;
  } catch (error) {
    return (error as { statusCode: number }).statusCode;
  }
}

describe('P2 POST /api/projects', () => {
  beforeEach(() => {
    registerProject.mockReset();
    registerProject.mockResolvedValue({ ok: true, value: { projectId: 'PID1' } });
    readState.mockClear();
    writeState.mockClear();
    broadcastProjectCreation.mockClear();
  });

  it('親の直下のパスなら本家へそのパスで1回依頼し、204 を返す', async () => {
    const response = await generateHandler(eventWith({ projectPath: PROJECT_PATH }) as never);

    expect((response as Response).status).toBe(204);
    expect(registerProject).toHaveBeenCalledTimes(1);
    expect(registerProject).toHaveBeenCalledWith(PROJECT_PATH);
  });

  it('本家が登録済みのパスにも受理する（本家が同じ id を返す）', async () => {
    registerProject.mockResolvedValue({ ok: true, value: { projectId: 'EXISTING' } });

    expect(await statusOf({ projectPath: PROJECT_PATH })).toBe(204);
  });

  it('書き方が違うだけの直下のパスは受理し、本家へは渡されたまま送る', async () => {
    // 判定は正規化して行うが、本家へ送るのは受け取った値そのもの（`join` は畳むので字面で組む）
    const spelled = `${SHARE_ROOT}/other/../made-app`;
    expect(await statusOf({ projectPath: spelled })).toBe(204);
    expect(registerProject).toHaveBeenCalledWith(spelled);
  });

  describe('親の直下1階層でないパスは 400 で断り、本家へ依頼しない', () => {
    it.each([
      ['本文が無い', undefined],
      ['projectPath が無い', {}],
      ['文字列でない', { projectPath: 42 }],
      ['空', { projectPath: '' }],
      ['相対パス', { projectPath: 'made-app' }],
      ['親の外', { projectPath: '/home/vagrant/work/made-app' }],
      ['親そのもの', { projectPath: SHARE_ROOT }],
      ['末尾スラッシュ付きの親', { projectPath: `${SHARE_ROOT}/` }],
      ['2階層下', { projectPath: join(SHARE_ROOT, 'made-app', 'docs') }],
      ['親を抜けて戻る（畳むと親そのもの）', { projectPath: `${SHARE_ROOT}/../share/made-app/..` }],
      ['直下に見えて親の外へ抜ける', { projectPath: `${SHARE_ROOT}/made-app/../../etc` }],
    ])('%s', async (_label, body) => {
      expect(await statusOf(body)).toBe(400);
      expect(registerProject).not.toHaveBeenCalled();
    });
  });

  describe('本家に届かない・断られた', () => {
    it('本家の URL が未設定なら 503', async () => {
      registerProject.mockResolvedValue({ ok: false, failure: { kind: 'not-configured' } });
      expect(await statusOf({ projectPath: PROJECT_PATH })).toBe(503);
    });

    it('本家に届かなければ 503', async () => {
      registerProject.mockResolvedValue({
        ok: false,
        failure: { kind: 'unreachable', path: '/api/projects/add', reason: 'ECONNREFUSED' },
      });
      expect(await statusOf({ projectPath: PROJECT_PATH })).toBe(503);
    });

    it('本家が登録をエラーで返せば 503', async () => {
      registerProject.mockResolvedValue({
        ok: false,
        failure: { kind: 'error-response', path: '/api/projects/add', status: 500, reason: 'boom' },
      });
      expect(await statusOf({ projectPath: PROJECT_PATH })).toBe(503);
    });

    it('本家に登録の口が無ければ（404）も 503。作成の要求に「対象が無い」を返さない', async () => {
      registerProject.mockResolvedValue({
        ok: false,
        failure: { kind: 'not-found', path: '/api/projects/add', detail: 'Not Found' },
      });
      expect(await statusOf({ projectPath: PROJECT_PATH })).toBe(503);
    });

    it('本家の応答の形が違えば 502', async () => {
      registerProject.mockResolvedValue({
        ok: false,
        failure: { kind: 'malformed', path: '/api/projects/add', reason: 'projectId が無い' },
      });
      expect(await statusOf({ projectPath: PROJECT_PATH })).toBe(502);
    });
  });

  it('どの経路でも state.json を読まず、書かず、上層へ配信しない', async () => {
    await statusOf({ projectPath: PROJECT_PATH });
    registerProject.mockResolvedValue({ ok: false, failure: { kind: 'not-configured' } });
    await statusOf({ projectPath: PROJECT_PATH });
    await statusOf({ projectPath: 'made-app' });

    expect(readState).not.toHaveBeenCalled();
    expect(writeState).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
  });
});
