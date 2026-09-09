import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/activate.ts`（U15 の実処理）。
 * spec は openspec/specs/api/session/activate（add-activated-phase）。
 *
 * **完成の判定を持たない**（ADR-0014）。成果物もファイルシステムも本家の REST も
 * `invocation` も見ず、endpoint が渡した局面（`from`）に当てはまるときだけ `activated` を
 * 記録する。完成したかを決めるのは呼び手（invokeAi の `didWork`・起動時の書き上げ）で、
 * その側のテストが持つ。ここで見るのは、記録の中身と、当てはまらなかったときに観測した
 * ものを返すこと、そして**判定を持たないこと**——`.spec-workflow/` が無い `approved` でも
 * 記録すること——である。
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

vi.mock('../../../server/utils/stroke/config', () => ({ readStrokeConfig }));

vi.mock('../../../server/utils/control/board', () => ({
  broadcastProjectCreation,
}));

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    readState: vi.fn(async () => APPROVED),
    writeState: vi.fn(async () => undefined),
  };
});

const { recordActivation } = await import('../../../server/handler/activate');
const { readState, writeState } = await import('../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);

const NAME = 'made-app';
const FROM = ['approved'] as const;
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

describe('recordActivation', () => {
  beforeEach(async () => {
    share.root = await mkdtemp(join(tmpdir(), 'activate-'));
    await placeDir();
    broadcastProjectCreation.mockClear();
    readStrokeConfig.mockClear();
    readStateMock.mockReset().mockResolvedValue(APPROVED);
    writeStateMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(share.root, { recursive: true, force: true });
  });

  it('from に当てはまる対象の phase だけを activated にする', async () => {
    const result = await recordActivation(NAME, FROM as never);

    expect(result).toEqual({ ok: true });
    // 他のフィールド（invocation・retries・runId）は触らない
    expect(writeStateMock).toHaveBeenCalledWith(NAME, { ...APPROVED, phase: 'activated' });
  });

  it('記録できたら成功の決着（done）を配信する。配信はここだけが出す', async () => {
    await recordActivation(NAME, FROM as never);

    expect(broadcastProjectCreation).toHaveBeenCalledWith(NAME, 'done');
  });

  /**
   * 判定を持たない（ADR-0014）。ここが成果物を数えていたころ、steering 工程には承認依頼を
   * 出す手段が無いのに承認依頼の有無で断っていて、文書を出し終えた実行がすべて `failed` →
   * `error` に倒れた（実機 2026-09-04）。完成したかは呼び手が決める。
   */
  it('成果物の有無を見ない。`.spec-workflow/` が1つも無い approved でも記録する', async () => {
    // 対象のディレクトリは在るが中は空（生成の依頼がまだ本家に受理されていない状態）
    const result = await recordActivation(NAME, FROM as never);

    expect(result).toEqual({ ok: true });
    expect(writeStateMock).toHaveBeenCalledWith(NAME, { ...APPROVED, phase: 'activated' });
  });

  /**
   * 判定を持たないことの実証。成果物を数えるには保存先（`projectShareRoot`）が要るので、
   * **handler 自身が設定を1度も引かないことが、成果物を数える経路を持たないことの裏付けに
   * なる。** 成果物の有無で結果が変わらないことを見るだけでは、判定が別の材料で戻っても
   * 気づけない。
   */
  it('保存先の設定を引かない。成果物を数える経路そのものを持たない', async () => {
    // 成果物ゼロの場合と、`.spec-workflow/` が在る場合の両方で引かない
    await recordActivation(NAME, FROM as never);
    expect(readStrokeConfig).not.toHaveBeenCalled();

    await placeDir('.spec-workflow', 'approvals', 'steering');
    await recordActivation(NAME, FROM as never);
    expect(readStrokeConfig).not.toHaveBeenCalled();
  });

  it('`.spec-workflow/` が空でも記録する。本家が動いていなくても判定は変わらない', async () => {
    await placeDir('.spec-workflow', 'approvals');
    await placeDir('.spec-workflow', 'steering');

    expect(await recordActivation(NAME, FROM as never)).toEqual({ ok: true });
  });

  it('from に当てはまらない局面は観測したものを返し、何も書かず配信しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    expect(await recordActivation(NAME, FROM as never)).toEqual({ ok: false, observed: 'proposed' });
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
  });

  it('ストローク中（stroking）も同じく観測したものを返す', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    expect(await recordActivation(NAME, FROM as never)).toEqual({ ok: false, observed: 'stroking' });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('既に完成した（activated）対象は activated を返し、何も変えない', async () => {
    readStateMock.mockResolvedValueOnce({ ...APPROVED, phase: 'activated' });

    expect(await recordActivation(NAME, FROM as never)).toEqual({ ok: false, observed: 'activated' });
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
  });

  it('state.json が読めなければ unreadable を返し、書き換えない', async () => {
    readStateMock.mockRejectedValueOnce(new Error('state.json が壊れている'));

    expect(await recordActivation(NAME, FROM as never)).toEqual({ ok: false, observed: 'unreadable' });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('invocation は書かない。書くのは phase を変えた state の1回だけ', async () => {
    await recordActivation(NAME, FROM as never);

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect(writeStateMock.mock.calls[0]![1].invocation).toBe(APPROVED.invocation);
  });

  it('実行中（invocation が running）でも記録し、running のまま残す', async () => {
    // 叩くのは invokeAi が `idle` に変える前なので、対象の実行はまだ占有中である。
    // busy を見ると自分の実行に弾かれる。`invocation` は判定にも使わず、書き換えもしない
    const running = { ...APPROVED, invocation: 'running' } as const;
    readStateMock.mockResolvedValueOnce(running);

    expect(await recordActivation(NAME, FROM as never)).toEqual({ ok: true });
    expect(writeStateMock).toHaveBeenCalledWith(NAME, { ...running, phase: 'activated' });
  });
});
