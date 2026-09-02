import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals } from '../support';

/**
 * 対象は `server/api/sessions/[id]/activate.post.ts`（U15）。
 * spec は openspec/specs/api/session/activate（add-activated-phase）。
 *
 * 完成の根拠は `.spec-workflow/approvals/<category>/*.json` の存在だけ。承認依頼の中身も
 * 状態も読まず、本家の REST も呼ばない。`invocation` に触れず、busy も見ない。
 *
 * 承認依頼は実物のディレクトリで置く（判定がファイルシステムを読むため）。`state.json` の
 * 読み書きは差し替え、`writeState` に渡った形を見る。
 */

const share = vi.hoisted(() => ({ root: '' }));

const { broadcastProjectCreation } = vi.hoisted(() => ({
  broadcastProjectCreation: vi.fn(() => undefined),
}));

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: share.root }),
}));

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
  invocation: 'running',
  retries: 1,
  runId: 'run-1',
} as const;

/** 承認依頼のファイルを置く。category を問わない */
async function placeApproval(category: string, file = 'approval_1_abc.json', body = '{}'): Promise<void> {
  const dir = join(share.root, NAME, '.spec-workflow', 'approvals', category);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), body, 'utf8');
}

async function placeDir(...segments: string[]): Promise<void> {
  await mkdir(join(share.root, NAME, ...segments), { recursive: true });
}

describe('U15 POST /api/sessions/:id/activate', () => {
  beforeEach(async () => {
    share.root = await mkdtemp(join(tmpdir(), 'activate-'));
    broadcastProjectCreation.mockClear();
    readStateMock.mockReset().mockResolvedValue(APPROVED);
    writeStateMock.mockReset().mockResolvedValue(undefined);
    sessionExistsMock.mockReset().mockResolvedValue(true);
  });

  afterEach(async () => {
    await rm(share.root, { recursive: true, force: true });
  });

  it('承認依頼を持つ approved の対象を受理し、phase だけを activated にして 204 を返す', async () => {
    await placeApproval('steering');

    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
    // 他のフィールド（invocation・retries・runId）は触らない
    expect(writeStateMock).toHaveBeenCalledWith(NAME, { ...APPROVED, phase: 'activated' });
  });

  it('受理したら成功の決着（done）を配信する。配信はここだけが出す', async () => {
    await placeApproval('steering');

    await activateHandler(fakeEvent(NAME, undefined) as never);

    expect(broadcastProjectCreation).toHaveBeenCalledWith(NAME, 'done');
  });

  it('承認依頼の状態は問わない。却下済みの本文でも受理する', async () => {
    await placeApproval('steering', 'approval_2_rej.json', JSON.stringify({ status: 'rejected' }));

    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
  });

  it('category は steering に限らない', async () => {
    await placeApproval('some-spec');

    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
  });

  it('承認依頼が無ければ 409 phase で断り、何も書かず配信しない', async () => {
    // `.spec-workflow/` はできているが承認依頼は無い（本家 MCP が接続しただけの状態）
    await placeDir('.spec-workflow', 'approvals');

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('まだ完成していない'),
    });
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
  });

  it('category の中の隠しディレクトリ（.snapshots）や .json 以外は承認依頼と数えない', async () => {
    await placeDir('.spec-workflow', 'approvals', 'steering', '.snapshots');
    await writeFile(join(share.root, NAME, '.spec-workflow', 'approvals', 'steering', '.snapshots', 'x.json'), '{}');
    await writeFile(join(share.root, NAME, '.spec-workflow', 'approvals', 'steering', 'notes.md'), '');
    // approvals 直下のファイルも数えない
    await writeFile(join(share.root, NAME, '.spec-workflow', 'approvals', 'index.json'), '{}');

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('.spec-workflow/ が無ければ 409 phase', async () => {
    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('まだ昇格していない（proposed）対象は 409 で断り、承認依頼の有無を見ない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });
    await placeApproval('steering');

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('まだ昇格していない'),
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('既に完成した（activated）対象は 409 で断り、何も変えない', async () => {
    readStateMock.mockResolvedValueOnce({ ...APPROVED, phase: 'activated' });
    await placeApproval('steering');

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
    await placeApproval('steering');

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('invocation は書かない。書くのは phase を変えた state の1回だけ', async () => {
    await placeApproval('steering');

    await activateHandler(fakeEvent(NAME, undefined) as never);

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect(writeStateMock.mock.calls[0]![1].invocation).toBe(APPROVED.invocation);
  });
});
