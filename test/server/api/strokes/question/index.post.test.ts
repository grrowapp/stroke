import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/strokes/[id]/question/index.post.ts`（A5）。テストの位置はソースの構造を
 * 写すが、**Endpoint 名のディレクトリを持つものは `[id]` の段を挟まない。**
 *
 * `[id]` の段を書くのは、名前空間の直下の handler（`<namespace>/index.<method>.ts`）と
 * `[id]` の直下の handler（`<namespace>/[id]/index.<method>.ts`）を区別する必要があるとき
 * だけである——`sessions/[id]/index.delete.test.ts` と
 * `projects/[projectId]/index.delete.test.ts` がその形。Endpoint 名のディレクトリ
 * （`question/`・`answer/` …）はその名前で区別が付くので要らない
 * （`fix-session-api-namespace` design「テストの移動」）。
 *
 * **かつてここには「vitest の `include` は glob なので `[id]` は文字クラスとして解釈され、
 * そこに置いたテストは1本も拾われない」と書いてあったが、現在の設定では成り立たない。**
 * `vitest.config.ts` の `include` は角括弧を含まない pattern で、角括弧はテスト側の
 * ファイル path にしかないため文字クラスにならない。実際
 * `test/server/api/projects/[projectId]/index.delete.test.ts` は収集されて通る
 * （`fix-session-api-layout` で実測）。
 *
 * **見るのは準備と後始末だけである**——読み取れない問いの 400、承認以降の 409、通ったときに
 * handler へ渡すもの（接続 token を含む）と 204 の返し方。残すことと、決着で流すことの実処理は
 * `test/server/handler/question.test.ts`。
 */

const { submitQuestion } = vi.hoisted(() => ({ submitQuestion: vi.fn(async () => undefined) }));

vi.mock('../../../../../server/handler/question', () => ({ submitQuestion }));

// ステータスの観測点。理由は `../../support.ts` の `stubNitroGlobals` に書いてある
vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => STROKING),
}));

stubNitroGlobals();

const { default: questionHandler } = await import('../../../../../server/api/strokes/[id]/question/index.post');
const { readState } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);

const QUESTION = {
  header: '保存方式',
  detail: 'どこに置くかまでは決まったが、形式が未確定である。',
  question: '保存方式をどうするか',
  options: [{ label: 'JSON', description: '1ファイルに丸ごと持つ' }],
};
const STROKING = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;
/** その提出を起こした claude の接続（`x-stroke-token`）。endpoint は素通しするだけ */
const TOKEN = 'launch-token-1';

describe('A5 POST /api/strokes/:id/question', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(STROKING);
    submitQuestion.mockClear();
  });

  /**
   * 受理と記録で完結する操作は本文を持たない 204 を返す
   * （`docs/specs/api/contract.md` A5「output: 本文なし（204）」）。
   *
   * **食い違いはソースの側にしか出ない。** ここを 200 と書いても、本文なし（`return null`）の
   * 応答は h3 の `sendNoContent` を通り、200 は既定の 204 に落ちて線の上では 204 になる
   * （`node_modules/h3/dist/index.mjs` の `sendNoContent` / `sanitizeStatusCode`）。
   * 出ないぶん、読んだ側が揃って 200 だと思い込む——代行する MCP ツールの注釈も、その
   * テストの期待値も、長く 200 を書いていた。ここで留めるのはソースが述べるステータスである。
   */
  it('受理したら handler へ渡し、本文なしの 204 を返す', async () => {
    const event = fakeEvent('session-1', QUESTION, { 'x-stroke-token': TOKEN });

    const body = await questionHandler(event as never);

    // 断った後の状態をそのまま渡す——問い以外を動かさないのは handler の役目である。
    // 接続 token も素通しする——決着が「何が提出されたか」を読む記録に使う
    expect(submitQuestion).toHaveBeenCalledWith('session-1', STROKING, expect.objectContaining({
      question: '保存方式をどうするか',
    }), TOKEN);
    // ハンドラは status を自分で持った Response を返す（`setResponseStatus` + 裸の null は
    // h3 に捨てられる）。観測点は event ではなく返り値である
    expect(body).toBeInstanceOf(Response);
    expect((body as Response).status).toBe(204);
    expect(await (body as Response).text()).toBe('');
  });

  /**
   * token を持たない要求も受理する。起動の外から直に叩かれたもので、記録の対象にならない
   * だけである（判定は `submission-signal.ts` が持つ）。endpoint は有無を見ない。
   */
  it('接続 token を持たない要求も受理し、handler へは undefined を渡す', async () => {
    await questionHandler(fakeEvent('session-1', QUESTION) as never);

    expect(submitQuestion).toHaveBeenCalledWith('session-1', STROKING, expect.anything(), undefined);
  });

  it('読み取れない問いは 400 で弾き、handler を呼ばない', async () => {
    const event = fakeEvent('session-1', { ...QUESTION, options: [] });

    await expect(questionHandler(event as never)).rejects.toThrow('問いの構造として読み取れない。');
    expect(submitQuestion).not.toHaveBeenCalled();
    expect(event.status).toBeUndefined();
  });

  it('承認済みのセッションには 409 を返し、handler を呼ばない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', QUESTION);

    await expect(questionHandler(event as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('承認済みのセッションには提出できない。'),
    });
    expect(submitQuestion).not.toHaveBeenCalled();
    expect(event.status).toBeUndefined();
  });

  it('完成した（activated）プロジェクトにも 409 を返し、handler を呼ばない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', QUESTION);

    await expect(questionHandler(event as never)).rejects.toThrow('承認済みのセッションには提出できない。');
    expect(submitQuestion).not.toHaveBeenCalled();
  });
});
