import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals } from '../support';

/**
 * 対象は `server/api/sessions/[id]/activate.post.ts`（U15）。
 * spec は openspec/specs/api/session/activate（add-activated-phase）。
 *
 * **この endpoint は完成の判定を持たない**（ADR-0014）。成果物もファイルシステムも本家の
 * REST も `invocation` も見ず、`approved` → `activated` の一方向の遷移を記録するだけである。
 * 完成したかを決めるのは呼び手（invokeAi の `didWork`・起動時の書き上げ）で、その側の
 * テストが持つ。ここで見るのは責務の不成立（404・読めない・局面が違う）と、
 * **判定を持たないこと**——`.spec-workflow/` が無い `approved` でも受理すること——である。
 *
 * 対象のディレクトリは実物で置く（空のまま）。`state.json` の読み書きは差し替え、
 * `writeState` に渡った形を見る。
 */

const share = vi.hoisted(() => ({ root: '' }));

const { broadcastProjectCreation, readStrokeConfig } = vi.hoisted(() => ({
  broadcastProjectCreation: vi.fn(() => undefined),
  // 判定を持たない handler は保存先を知る必要が無い。**呼ばれないことを見るために置く**
  readStrokeConfig: vi.fn(() => ({ projectShareRoot: share.root })),
}));

vi.mock('../../../../server/utils/stroke/config', () => ({ readStrokeConfig }));

vi.mock('../../../../server/utils/control/board', () => ({
  broadcastProjectCreation,
}));

vi.mock('../../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    sessionExists: vi.fn(async () => true),
    readState: vi.fn(async () => APPROVED),
    writeState: vi.fn(async () => undefined),
  };
});

stubNitroGlobals();

const { default: activateHandler } = await import('../../../../server/api/sessions/[id]/activate.post');
const { readState, sessionExists, writeState } = await import(
  '../../../../server/utils/stroke/session-store'
);

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const sessionExistsMock = vi.mocked(sessionExists);

const NAME = 'made-app';
const APPROVED = {
  phase: 'approved',
  projectName: NAME,
  invocation: 'idle',
  retries: 1,
  runId: 'run-1',
} as const;

async function placeDir(...segments: string[]): Promise<void> {
  await mkdir(join(share.root, NAME, ...segments), { recursive: true });
}

describe('U15 POST /api/sessions/:id/activate', () => {
  beforeEach(async () => {
    share.root = await mkdtemp(join(tmpdir(), 'activate-'));
    await placeDir();
    broadcastProjectCreation.mockClear();
    readStrokeConfig.mockClear();
    readStateMock.mockReset().mockResolvedValue(APPROVED);
    writeStateMock.mockReset().mockResolvedValue(undefined);
    sessionExistsMock.mockReset().mockResolvedValue(true);
  });

  afterEach(async () => {
    await rm(share.root, { recursive: true, force: true });
  });

  it('approved の対象を受理し、phase だけを activated にして 204 を返す', async () => {
    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
    // 他のフィールド（invocation・retries・runId）は触らない
    expect(writeStateMock).toHaveBeenCalledWith(NAME, { ...APPROVED, phase: 'activated' });
  });

  it('受理したら成功の決着（done）を配信する。配信はここだけが出す', async () => {
    await activateHandler(fakeEvent(NAME, undefined) as never);

    expect(broadcastProjectCreation).toHaveBeenCalledWith(NAME, 'done');
  });

  /**
   * 判定を持たない（ADR-0014）。ここが成果物を数えていたころ、steering 工程には承認依頼を
   * 出す手段が無いのに承認依頼の有無で断っていて、文書を出し終えた実行がすべて `failed` →
   * `error` に倒れた（実機 2026-09-04）。完成したかは呼び手が決める。
   */
  it('成果物の有無を見ない。`.spec-workflow/` が1つも無い approved でも受理する', async () => {
    // 対象のディレクトリは在るが中は空（生成の依頼がまだ本家に受理されていない状態）
    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(writeStateMock).toHaveBeenCalledWith(NAME, { ...APPROVED, phase: 'activated' });
  });

  /**
   * 判定を持たないことの実証。成果物を数えるには保存先（`projectShareRoot`）が要るので、
   * **handler 自身が設定を1度も引かないことが、成果物を数える経路を持たないことの裏付けに
   * なる。** 成果物の有無で結果が変わらないことを見るだけでは、判定が別の材料で戻っても
   * 気づけない。（`sessionExists` などの依存はここでは差し替えているので、この否定が見て
   * いるのは handler が直接引き直す形の回帰である。）
   */
  it('保存先の設定を引かない。成果物を数える経路そのものを持たない', async () => {
    // 成果物ゼロの場合と、`.spec-workflow/` が在る場合の両方で引かない
    await activateHandler(fakeEvent(NAME, undefined) as never);
    expect(readStrokeConfig).not.toHaveBeenCalled();

    await placeDir('.spec-workflow', 'approvals', 'steering');
    await activateHandler(fakeEvent(NAME, undefined) as never);
    expect(readStrokeConfig).not.toHaveBeenCalled();
  });

  it('`.spec-workflow/` が空でも受理する。本家が動いていなくても判定は変わらない', async () => {
    await placeDir('.spec-workflow', 'approvals');
    await placeDir('.spec-workflow', 'steering');

    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
  });

  it('まだ昇格していない（proposed）対象は 409 phase で断り、何も書かず配信しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('まだ昇格していない'),
    });
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
  });

  it('ストローク中（stroking）の対象も 409 phase で断る', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('既に完成した（activated）対象は 409 で断り、何も変えない', async () => {
    readStateMock.mockResolvedValueOnce({ ...APPROVED, phase: 'activated' });

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('既に完成している'),
    });
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
  });

  it('存在しない id は 404 で、何も書かない', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(activateHandler(fakeEvent('missing', undefined) as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(readStateMock).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('state.json が読めなければ 409 phase で断り、書き換えない', async () => {
    readStateMock.mockRejectedValueOnce(new Error('state.json が壊れている'));

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('invocation は書かない。書くのは phase を変えた state の1回だけ', async () => {
    await activateHandler(fakeEvent(NAME, undefined) as never);

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect(writeStateMock.mock.calls[0]![1].invocation).toBe(APPROVED.invocation);
  });

  it('実行中（invocation が running）でも受理し、running のまま残す', async () => {
    // 叩くのは invokeAi が `idle` に変える前なので、対象の実行はまだ占有中である。
    // busy を見ると自分の実行に弾かれる。`invocation` は判定にも使わず、書き換えもしない
    const running = { ...APPROVED, invocation: 'running' } as const;
    readStateMock.mockResolvedValueOnce(running);

    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(writeStateMock).toHaveBeenCalledWith(NAME, { ...running, phase: 'activated' });
  });
});
