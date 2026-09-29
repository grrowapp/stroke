import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shouldRetry } from '../../../server/utils/stroke/sweep';
import { stubNitroGlobals } from '../api/support';

/**
 * 対象は `server/handler/promote.ts`（U14 の実処理）。
 *
 * 昇格の段（openspec/specs/api/session/promote）。順序は「衝突確認 → 改名 → `phase` を書く」
 * のまま。**失敗の種類で判断の扱いが分かれる**——改名・`phase` の書き込みが失敗したら改名を
 * 戻して**判断は残し**（同じ判断のままやり直せる）、名前が衝突したときは**判断を取り下げてから**
 * 409 name-conflict を返す（その判断のままでは何度やり直しても昇格できないため。
 * openspec/specs/project/generation）。起動は要求せず、`invocation` を A8 経由で `failed` に
 * して巡回へ引き渡す。
 *
 * **実行の枠は U10 からここへ移した**（fix-rename-during-running-session）。改名する
 * のはこの段なので、対象になるのもここである。`running.ts` の実物は
 * `test/server/utils/stroke/running.test.ts` が見ているので、ここでは `beginRun` /
 * `endRun` をモックし、呼ばれ方（どのパスで占有するか・取れなければ何も変えないか・解放が
 * どこで起きるか）だけを見る。
 *
 * **枠が取れないときは 500 である。** 「実行中だから受け付けない」（409 busy）は契約から
 * 消えた——承認できる局面は実行の決着でしか立たないので、昇格が実行中に届くのは前提が
 * 崩れているということであり、理由を握りつぶさずに失敗として返す（ADR-0022）。
 *
 * 受理してよい局面か（昇格済みでないか・判断が記録されているか）は endpoint が持つので
 * ここには来ない（`test/server/api/sessions/promote/index.post.test.ts`）。
 */

const { assertNameAvailable, promoteSessionToProject, revertPromotion, broadcastProjectCreation, fetchMock, beginRun, endRun } =
  vi.hoisted(() => ({
    assertNameAvailable: vi.fn(async (_root: string, name: string) => `/share/${name}`),
    promoteSessionToProject: vi.fn(async (_root: string, _id: string, name: string) => `/share/${name}`),
    revertPromotion: vi.fn(async () => undefined),
    broadcastProjectCreation: vi.fn(() => undefined),
    fetchMock: vi.fn(async (..._args: unknown[]) => undefined),
    beginRun: vi.fn(async (path: string) => ({ started: true, key: `key:${path}` })),
    endRun: vi.fn(),
  }));

// 定数（`PROJECT_DOCS_DIR` など）は session-store が引くので本物を残し、動作だけ差し替える
vi.mock('../../../server/utils/stroke/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/project')>()),
  assertNameAvailable,
  promoteSessionToProject,
  revertPromotion,
}));

vi.mock('../../../server/utils/control/board', () => ({
  broadcastProjectCreation,
}));

// `sessionRunPath` / `projectRunPath` は fs を引かない純粋関数なので本物を残し、
// `beginRun` / `endRun` だけ差し替える
vi.mock('../../../server/utils/stroke/running', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/running')>()),
  beginRun,
  endRun,
}));

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    readState: vi.fn(async () => DECIDED),
    writeState: vi.fn(async () => undefined),
  };
});

// 取り下げの 409 は `conflict()`（`createError`）で作られたものを見分ける
stubNitroGlobals();
// A8 への内部 $fetch の観測点。U13（invoke-agent）が呼ばれないことも同じ口で見る
vi.stubGlobal('$fetch', fetchMock);

const { promote } = await import('../../../server/handler/promote');
const { readState, writeState } = await import('../../../server/utils/stroke/session-store');
const { conflict } = await import('../../../server/utils/stroke/conflict');
const { invokePath } = await import('../../../server/utils/stroke/invoke');
const { submissionPath } = await import('../../../server/utils/stroke/submission-path');
const { sessionRunPath } = await import('../../../server/utils/stroke/running');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const NAME = 'decided-app';
const DECIDED = {
  phase: 'proposed',
  currentQuestion: null,
  invocation: 'idle',
  retries: 0,
  decision: { projectName: NAME },
} as const;

/** 昇格1回分。名前は判断から取り出したものとして endpoint が渡す */
function run(name = NAME): Promise<void> {
  return promote('/share', SESSION, name);
}

/** $fetch に渡された path の一覧 */
function fetchedPaths(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

/**
 * `assertNameAvailable` が保存先に同名を見つけたときに投げるもの。
 * 理由の印（`data.reason`）まで含めて実物と同じ口（`conflict()`）で作る——受け口はこの印で
 * 「取り下げる失敗」と「判断を残す失敗」を分けるので、印の無い 409 で代用すると空振りする。
 */
function nameConflict(): unknown {
  return conflict('name-conflict', `/share/${NAME} は既に存在する。別の名前を確定すること。`);
}

function resetMocks(): void {
  assertNameAvailable.mockReset().mockImplementation(async (_root, name) => `/share/${name}`);
  promoteSessionToProject.mockReset().mockImplementation(async (_root, _id, name) => `/share/${name}`);
  revertPromotion.mockClear();
  broadcastProjectCreation.mockClear();
  fetchMock.mockReset().mockResolvedValue(undefined);
  readStateMock.mockReset().mockResolvedValue(DECIDED);
  writeStateMock.mockReset().mockResolvedValue(undefined);
  beginRun.mockReset().mockImplementation(async (path: string) => ({ started: true, key: `key:${path}` }));
  endRun.mockReset();
}

describe('promote', () => {
  beforeEach(resetMocks);

  it('渡された名前で「占有 → 衝突確認 → 改名 → phase を書く → 解放」の順に昇格する', async () => {
    const order: string[] = [];
    beginRun.mockImplementation(async (path: string) => {
      order.push('begin');
      return { started: true, key: `key:${path}` };
    });
    assertNameAvailable.mockImplementation(async (_root, name) => {
      order.push('assert');
      return `/share/${name}`;
    });
    promoteSessionToProject.mockImplementation(async (_root, _id, name) => {
      order.push('rename');
      return `/share/${name}`;
    });
    writeStateMock.mockImplementation(async () => {
      order.push('write');
    });
    endRun.mockImplementation(() => {
      order.push('end');
    });

    await run();

    expect(order).toEqual(['begin', 'assert', 'rename', 'write', 'end']);
    expect(assertNameAvailable).toHaveBeenCalledWith('/share', NAME);
    expect(promoteSessionToProject).toHaveBeenCalledWith('/share', SESSION, NAME);
    // `approved` は改名後の場所へ、`invocation` の初期値つきで書く
    expect(writeStateMock).toHaveBeenCalledWith(NAME, {
      phase: 'approved',
      projectName: NAME,
      invocation: 'idle',
      retries: 0,
      // 始めた利用者を引き継ぐ。この test の保存先には `state.json` が無いので null
      startedBy: null,
    });
    expect(revertPromotion).not.toHaveBeenCalled();
  });

  /**
   * 提出の記録は起動（接続 token）単位になったので、昇格が旧 id の分を落とす必要は無くなった
   * ——捨てるのは起動の終わり（`kick` の `.finally`）である
   * （change fix-rename-during-running-session・`submission-signal.ts`）。
   */
  it('昇格した瞬間に生成中を配信する', async () => {
    await run();

    expect(broadcastProjectCreation).toHaveBeenCalledWith(NAME, 'in-progress');
  });

  it('起動は要求しない。invoke-agent を叩かない', async () => {
    await run();

    expect(fetchedPaths().some((path) => path.includes('/invoke-agent'))).toBe(false);
    expect(fetchedPaths()).not.toContain(invokePath(NAME, `/share/${NAME}`));
  });

  it('昇格の完了時点で invocation を failed にする。A8 を通し、writeState では書かない', async () => {
    await run();

    // 内部 token の header が足されるので、中身は method と body だけを見る
    expect(fetchMock).toHaveBeenCalledWith(submissionPath(NAME), expect.objectContaining({
      method: 'POST',
      body: { invocation: 'failed' },
    }));
    // `writeState` が書いた `invocation` は初期値の `idle` だけ。`failed` は A8 の仕事
    for (const [, state] of writeStateMock.mock.calls) {
      expect(state.invocation).toBe('idle');
    }
    // 巡回が拾う値である（起動の段を巡回へ引き渡す）
    expect(shouldRetry('failed')).toBe(true);
  });

  it('A8 の呼び出しを待ち切ってから返る', async () => {
    let settle: () => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          settle = () => resolve(undefined);
        }),
    );

    let settled = false;
    const pending = run().then(() => {
      settled = true;
    });

    // A8 を叩いたのに、その応答が返るまでは昇格も返らない
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(submissionPath(NAME), expect.anything()));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    settle();
    await pending;
    expect(settled).toBe(true);
  });

  it('A8 が失敗しても昇格は巻き戻さない', async () => {
    fetchMock.mockRejectedValueOnce(new Error('A8 down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(run()).resolves.toBeUndefined();

    expect(revertPromotion).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('phase の書き込みに失敗したら改名を戻し、判断には触れない', async () => {
    writeStateMock.mockRejectedValueOnce(new Error('disk full'));

    await expect(run()).rejects.toThrow('disk full');

    expect(revertPromotion).toHaveBeenCalledWith('/share', NAME, SESSION);
    // セッション側の state.json は書き換えない = 判断はそのまま残る
    expect(writeStateMock.mock.calls.some(([id]) => id === SESSION)).toBe(false);
    // 配信も引き渡しも起きない
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('改名に失敗したら phase を書かず、判断には触れない。同じ判断のままやり直せる', async () => {
    promoteSessionToProject.mockRejectedValueOnce(Object.assign(new Error('rename failed'), { statusCode: 500 }));

    await expect(run()).rejects.toThrow('rename failed');
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(revertPromotion).not.toHaveBeenCalled();

    // 同じ判断で2回目。今度は通る
    await expect(run()).resolves.toBeUndefined();
    expect(promoteSessionToProject).toHaveBeenLastCalledWith('/share', SESSION, NAME);
  });

  it('衝突は改名の前に弾き、判断を取り下げてから 409 name-conflict を返す', async () => {
    assertNameAvailable.mockRejectedValueOnce(nameConflict());

    await expect(run()).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'name-conflict' },
    });

    // 判断を取り下げた = セッションの state から `decision` が消えている。`phase` は動かない
    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect(writeStateMock).toHaveBeenCalledWith(SESSION, {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 0,
    });
    for (const [, written] of writeStateMock.mock.calls) {
      expect(written).not.toHaveProperty('decision');
    }

    // 改名も、配信も、A8 への引き渡しも起きない
    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(revertPromotion).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('改名の直前の二度目の衝突確認で弾かれても、同じように取り下げてから 409 を返す', async () => {
    // `promoteSessionToProject` は改名の直前にもう一度 `assertNameAvailable` を通す
    // （`utils/stroke/project.ts`）。1回目の確認と改名の間に同じ名前が現れる並びがあるので、
    // そこから出た衝突も同じ扱いにする
    promoteSessionToProject.mockRejectedValueOnce(nameConflict());

    await expect(run()).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'name-conflict' },
    });

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect(writeStateMock).toHaveBeenCalledWith(SESSION, {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 0,
    });
    // 改名は成立していないので巻き戻しは要らない。配信も引き渡しも起きない
    expect(revertPromotion).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    // 占有の解放はこちらの経路でも起きる
    expect(endRun).toHaveBeenCalledWith(`key:${sessionRunPath('/share', SESSION)}`);
  });

  it('衝突で取り下げたときも占有は解放する。取り下げは解放より前（占有の中）で起きる', async () => {
    const order: string[] = [];
    assertNameAvailable.mockImplementationOnce(async () => {
      order.push('assert');
      throw nameConflict();
    });
    writeStateMock.mockImplementationOnce(async () => {
      order.push('withdraw');
    });
    endRun.mockImplementation(() => {
      order.push('end');
    });

    await expect(run()).rejects.toMatchObject({ statusCode: 409 });

    expect(order).toEqual(['assert', 'withdraw', 'end']);
    expect(endRun).toHaveBeenCalledWith(`key:${sessionRunPath('/share', SESSION)}`);
  });

  it('取り下げた後に別の名前で承認し直せば、その名前で昇格する', async () => {
    assertNameAvailable.mockRejectedValueOnce(nameConflict());
    await expect(run()).rejects.toMatchObject({ statusCode: 409 });

    // サーバが書いた「判断なし」の state（上のケースで検証済み）へ、画面が別の名前で
    // 下し直した判断（U10）が載った状態。取り下げ済みなので U10 は重ねての判断にならない
    expect(writeStateMock).toHaveBeenCalledWith(SESSION, {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 0,
    });

    await expect(run('decided-app-2')).resolves.toBeUndefined();
    expect(promoteSessionToProject).toHaveBeenCalledWith('/share', SESSION, 'decided-app-2');
  });

  it('理由の印が name-conflict でない 409 では取り下げない。status だけで判定していない', async () => {
    assertNameAvailable.mockRejectedValueOnce(conflict('phase', 'この操作は今の phase に当てはまらない。'));

    await expect(run()).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });

    expect(writeStateMock).not.toHaveBeenCalled();
    expect(promoteSessionToProject).not.toHaveBeenCalled();
  });

  it('名前の形が不正（400）なら判断は取り下げない。衝突ではないので、やり直す対象は判断ではない', async () => {
    assertNameAvailable.mockRejectedValueOnce(
      Object.assign(new Error('プロジェクト名に使えない文字が含まれている。'), { statusCode: 400 }),
    );

    await expect(run()).rejects.toMatchObject({ statusCode: 400 });

    // セッション側の state.json は書き換えない = 判断はそのまま残る
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(promoteSessionToProject).not.toHaveBeenCalled();
  });

  it('取り下げは読み直してから書く。読み直した時点で判断が無ければ何も書かない', async () => {
    // 取り下げの直前の読み直し。冒頭の読み（endpoint が持つ）との間に承認（U10）の
    // 取り下げが入った並び——U10 は実行の枠を取らないので、占有の中でも判断は
    // 入れ替わりうる
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });
    assertNameAvailable.mockRejectedValueOnce(nameConflict());

    await expect(run()).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'name-conflict' },
    });

    expect(readStateMock).toHaveBeenCalledTimes(1);
    // 取り下げの目的は既に達しているので、スナップショットを書き戻さない
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('読み直した判断が別の名前なら取り下げない。衝突していない判断を消さない', async () => {
    // 間に承認（U10）が別の名前で判断を下し直した並び——U10 は実行の枠を取らず
    // `withStateLock` も取らないので、この占有では止まらない。新しい判断の名前は衝突して
    // いないので、消す根拠が無い
    readStateMock.mockResolvedValueOnce({ ...DECIDED, decision: { projectName: 'decided-app-2' } });
    assertNameAvailable.mockRejectedValueOnce(nameConflict());

    await expect(run()).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'name-conflict' },
    });

    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('取り下げの書き込みが失敗したら、その失敗を返す。409 で上書きしない', async () => {
    assertNameAvailable.mockRejectedValueOnce(nameConflict());
    writeStateMock.mockRejectedValueOnce(new Error('disk full'));

    await expect(run()).rejects.toThrow('disk full');
    expect(promoteSessionToProject).not.toHaveBeenCalled();
  });
});

describe('promote — 実行の枠（U10 から移した。fix-rename-during-running-session）', () => {
  beforeEach(resetMocks);

  it('対象の作業場所（セッション id・改名前の実体）を beginRun で占有する', async () => {
    await run();

    expect(beginRun).toHaveBeenCalledWith(sessionRunPath('/share', SESSION));
  });

  /**
   * **`busy` は返さない。** 承認できる局面（`proposed`）は proposal を提出した実行の決着でしか
   * 立たないので、昇格が実行中に届くこと自体が前提の崩れである。「待てば通る」理由を持たせずに
   * 500 で返す（ADR-0022・`server/utils/stroke/conflict.ts`「`busy` は無い」）。
   */
  it('枠が取れなければ 500 を投げ、何も変わらない（改名・phase 書き込み・配信・A8 のいずれも起きない）', async () => {
    beginRun.mockResolvedValueOnce({ started: false } as never);

    await expect(run()).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining('対象で実行が走っている。'),
    });

    expect(assertNameAvailable).not.toHaveBeenCalled();
    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('枠を取れずに断ったときは解放もしない。他人の実行の枠を外さない', async () => {
    beginRun.mockResolvedValueOnce({ started: false } as never);

    await expect(run()).rejects.toMatchObject({ statusCode: 500 });

    // 枠を取れていないので、解放も起きようがない
    expect(endRun).not.toHaveBeenCalled();
  });

  it('占有は改名・phase 書き込みの直後、steering の起動（U13）を叩く前に解放される', async () => {
    await run();

    // beginRun が返したキーで解放する
    expect(endRun).toHaveBeenCalledWith(`key:${sessionRunPath('/share', SESSION)}`);
    // 解放後の対象へ、以後の呼び出し（= 呼び手が直後に叩く U13 の beginRun）が
    // 同じキーで占有できる状態になっている
    expect(endRun).toHaveBeenCalledTimes(1);
  });

  it('phase の書き込みに失敗して改名を戻しても、占有は解放される', async () => {
    writeStateMock.mockRejectedValueOnce(new Error('disk full'));

    await expect(run()).rejects.toThrow('disk full');

    expect(endRun).toHaveBeenCalledWith(`key:${sessionRunPath('/share', SESSION)}`);
  });
});
