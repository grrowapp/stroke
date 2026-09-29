/**
 * E2E の下ごしらえ。本家スタブの状態を動かす口と、テスト間で状態を戻す手順、
 * それに注釈の面（`app/components/review/AnnotateSource.vue`）を操作する口。
 *
 * **`test` はここから import する。** 素の `@playwright/test` のものではなく、画面の
 * 読み込みに1つ手当てを入れたもの（下の `test`）を配る。
 */

import { writeFileSync } from 'node:fs';

import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';

import { REGISTRY_PATH, STUB_PORT, registryContent } from '../../playwright.config';

/**
 * 画面の読み込みを見張る `test`。**ブラウザが読み込み途中の script を捨てたら、開き直す。**
 *
 * Chromium は OS が「ネットワークが変わった」と言うと、宛先に関わらず**その時点で飛んで
 * いるリクエストを全部落とす**（`net::ERR_NETWORK_CHANGED`）。相手が 127.0.0.1 でも落ちる。
 * 落ちたのが Nuxt の script だと Vue の app が mount されず、画面はサーバーが描いた markup の
 * まま固まる——`data-connected` は `false` から動かないし、teleport される面
 * （`app/layouts/stroke.vue` の `UModal`）に至っては DOM に現れない。**待ちを伸ばしても
 * 直らない**ので、開き直すしかない。
 *
 * 実測（2026-09-10）:
 *
 * - `resetBoard` の周期を 229 回繰り返したうち2回、`_nuxt/*.js` が 13 本まとめて
 *   `net::ERR_NETWORK_CHANGED` で落ち、`#__nuxt` に Vue の app が付かなかった。落ちたのは
 *   その2回だけで、どちらも 15 秒の接続待ちを使い切っている。残りの 227 回は 99〜457ms で
 *   繋がった
 * - **サーバー側は無関係だった。** 登録簿を書き戻してから 220ms で本家へ繋ぎ直し、そのまま
 *   15 秒間ずっと繋がったままだった（`server/utils/control/monitor.ts` に印を入れて計測）
 * - 元は**このマシンの USB Ethernet（`enxacde48001122`）が上下していること**である。落ちた
 *   1秒前に `ip monitor` が同じ口の IPv6 link-local アドレスの削除と再付与を記録している。
 *   口そのものを落とせば起きなくなるが、それは機械の設定であってこのリポジトリの話ではない
 *
 * 「遅いから待つ」ではない。**動かないものを、もう一度読み込ませる**手当てである。捨てられた
 * 画面の上では以後の判定が全部無意味になるので、そのまま進ませない。
 *
 * 拾うのは document と script の `net::ERR_NETWORK_CHANGED` **だけ**である。画像やアイコンが
 * 1つ落ちても画面は動くし、理由で絞らないと**別の画面へ移ったときの取り消し**
 * （`net::ERR_ABORTED`）まで拾ってしまう。あれは前の画面の読み込みが打ち切られただけで、
 * 開き直す理由が無い。
 */
const LOAD_ATTEMPTS = 3;

/** ブラウザが「ネットワークが変わった」として投げ捨てた印 */
const DISCARDED = 'net::ERR_NETWORK_CHANGED';

function watchDiscardedLoads(page: Page): void {
  const discarded: string[] = [];

  page.on('requestfailed', (request) => {
    const kind = request.resourceType();
    if (kind !== 'document' && kind !== 'script') return;
    if (request.failure()?.errorText !== DISCARDED) return;
    discarded.push(request.url());
  });

  /**
   * 読み込みを1つ包む。`load` は module script の取得が終わる（失敗も含む）まで来ないので、
   * `goto` / `reload` が返る時点では落ちたぶんの `requestfailed` は届いている。
   */
  const retry = async <T>(load: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt += 1) {
      discarded.length = 0;
      const result = await load();
      if (discarded.length === 0) return result;

      // 黙って開き直さない。落ちたときに「あの時これが起きていた」と辿れる印を残す
      console.warn(
        `[e2e] 画面の script をブラウザが捨てたので開き直す（${attempt}回目）: ${discarded.join(' / ')}`,
      );

      if (attempt === LOAD_ATTEMPTS) {
        throw new Error(
          `画面の script をブラウザが ${LOAD_ATTEMPTS} 回とも捨てた: ${discarded.join(' / ')}`,
        );
      }
    }
  };

  const goto = page.goto.bind(page);
  page.goto = (url, options) => retry(() => goto(url, options));

  const reload = page.reload.bind(page);
  page.reload = (options) => retry(() => reload(options));
}

export const test = base.extend({
  page: async ({ page }, use) => {
    watchDiscardedLoads(page);
    await use(page);
  },
});

export { expect };

export const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;

export const ALPHA = 'ALPHAID000000001';
export const BETA = 'BETAID0000000002';

async function control<T = void>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${STUB_URL}/__control/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`スタブの ${action} が失敗した: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export const stub = {
  /** スタブの状態を初期値に戻す */
  reset: () => control('reset'),

  /** stroke-board がスタブへ出したリクエストの計数。基準が揃ったかの判定に使う */
  stats: () =>
    control<{
      sockets: number;
      progressRequests: number;
      /**
       * 直近に届いた承認への応答。何を送ったかを確かめるのに使う。
       *
       * `annotations` / `comments` は差し戻し（needs-revision）だけが持つ。
       * 承認・却下では null になる。
       */
      lastApprovalAction: {
        id: string;
        action: string;
        response: string | null;
        annotations: string | null;
        comments: unknown[] | null;
      } | null;
      /** `POST /api/projects/add` で受けた登録の依頼（届いた順）。生成（P2）が出したもの */
      registrations: Array<{ projectPath: string }>;
    }>('stats'),

  /** 本家が登録の依頼を受け付けない状況を作る（500 で断る）。`false` で戻す */
  refuseRegistration: (refuse: boolean) => control('refuse-registration', { refuse }),

  /** 完了数を1つ増やす */
  completeTask: (projectId: string, specName = 'auth-spec') =>
    control('complete-task', { projectId, specName }),

  /** タスクを着手中にする */
  startTask: (projectId: string, taskId: string, specName = 'auth-spec') =>
    control('start-task', { projectId, specName, taskId }),

  /**
   * 承認依頼を立てる。
   *
   * `content` を渡すと、その承認の対象文書の中身になる（本家がファイルから読むものに
   * あたる）。渡さなければ既定の本文が返る。改行の表現や前置きを持つ文書を試すために
   * 仕込む口で、**アプリ側にテスト専用の抜け道は足していない**。
   */
  requestApproval: (
    projectId: string,
    options: {
      id: string;
      title: string;
      filePath: string;
      category: 'spec' | 'steering';
      categoryName: string;
      content?: string;
    },
  ) => control('request-approval', { projectId, ...options }),

  /** 承認依頼を保留中でなくする。承認か却下かは観測できない */
  resolveApproval: (projectId: string, id: string) => control('resolve-approval', { projectId, id }),

  /** 再描画用の同期信号。通知にしてはいけない */
  steeringUpdate: (projectId: string) => control('steering-update', { projectId }),
};

/**
 * A9: 実行の決着。その実行で提出されたものに応じて局面を切り替え、画面へ届ける。
 *
 * **本来これを叩くのは invokeAi だけである**（openspec/specs/agent/invocation）。E2E で
 * 実物の claude を起こすのは `stroke-settlement.spec.ts` の1本だけで、それ以外の spec は
 * 段取りをエージェント側の口（A5・A7）から直接作る。段取りには実行が無く決着も走らないので、
 * 呼び手の代わりにここから叩く——A8（`invocation` の書き込み）や U15（完成の記録）を
 * `stroke-exit.spec.ts` が直接叩いているのと同じ扱いである。
 *
 * これを通さないと画面2 は開かない。A5・A7 は提出を記録するだけで phase を動かさず、配信も
 * しなくなったためで（change fix-rename-during-running-session）、`proposed` が立つのも
 * W1・W2 が流れるのも決着の時点だけである。
 */
export async function settleRun(
  request: APIRequestContext,
  sessionId: string,
  submitted: 'question' | 'proposal',
): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/settlement`, {
    data: { submitted },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** tasks を持つ spec の数 × アクティブなプロジェクト数。基準が揃った判定に使う */
const EXPECTED_PROGRESS_REQUESTS = 2;

/** 接続の切り替わりを待つ上限。下の基準待ちと揃える（`resetBoard` の docblock） */
const CONNECTION_TIMEOUT_MS = 15_000;

/**
 * 通知の一覧を空に戻し、基準を作り直させる。
 *
 * registry を空にするとアクティブ集合から消え、そのプロジェクトの通知が落ちて接続も切れる。
 * 戻すと再接続して基準を作り直す。どちらも stroke-board の既存の振る舞いで、テスト専用の
 * 抜け道をアプリ側に足していない。
 *
 * 「接続済み」表示だけでは足りない。あれは1つでも基準が整えば立つので、もう一方の
 * プロジェクトの基準がまだのうちに通知を起こすと取りこぼす。スタブが受けた
 * `tasks/progress` の回数で、両方の基準が揃ったことを確定的に待つ。
 *
 * **接続の切り替わりの上限は 15 秒。** 下の基準待ちと揃えてある。ここが長いのは遅いからでは
 * ない——実測（2026-09-10、この周期を 229 回繰り返した）では registry を書き戻してから表示が
 * `true` になるまで 99〜457ms（中央 286ms）で、余白は元から十分にある。伸ばす方向で直そうと
 * していたのは、**待っても動かない画面**（上の `test` の docblock。ブラウザが script を
 * 捨てた場合）を待ちの問題と取り違えていたためで、あれは開き直しで受けるようになった。
 *
 * **ここに backoff は効いていない。** かつてこの docblock には「再接続の待ちが spec を
 * またいで積み上がる」と書いてあったが、そうはならない。registry を空にすると監視対象から
 * 外れて socket は閉じられ、書き戻すと**別の socket が作り直される**
 * （`server/utils/control/monitor.ts` の `sync` → `watch`）。作り直された socket の待ちは
 * 初期値から始まる。実測（2026-09-09、`scheduleReconnect` に印を入れて全体の 77 件まで
 * 計測）でも再接続の予約は一度も通らず、close から接続が戻るまでは毎回 3〜5 秒——その大半は
 * registry を書き戻すまでの間——だった。
 *
 * backoff の上限そのものは 5 秒へ下げてある（`server/utils/upstream/socket.ts` の
 * `MAX_BACKOFF_MS`）。効くのは本家が落ちたまま監視対象に残り続けた場合で、この関数の
 * 切っては繋ぐ経路ではない。
 */
export async function resetBoard(
  page: Page,
  options: {
    /**
     * 切断している間に本家の状態を動かす。ここで起こした変化は接続時の基準に取り込まれ、
     * 通知にならない。「stroke-board が繋ぐ前から起きていたこと」を作るのに使う。
     */
    whileDisconnected?: () => Promise<void>;
  } = {},
): Promise<void> {
  await stub.reset();

  writeFileSync(REGISTRY_PATH, '{}');
  await page.goto('/notifications');
  await expect(page.getByTestId('upstream-connection')).toHaveAttribute('data-connected', 'false', {
    timeout: CONNECTION_TIMEOUT_MS,
  });
  await expect(page.getByTestId('notification-row')).toHaveCount(0);

  await options.whileDisconnected?.();

  writeFileSync(REGISTRY_PATH, registryContent());
  await expect(page.getByTestId('upstream-connection')).toHaveAttribute('data-connected', 'true', {
    timeout: CONNECTION_TIMEOUT_MS,
  });

  await expect
    .poll(async () => (await stub.stats()).progressRequests, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(EXPECTED_PROGRESS_REQUESTS);
}

/**
 * 面の上で範囲を選び、注釈の面に選択が起きたことを伝える。
 *
 * 範囲は**面に出ている字の並び**（text ノードを前から繋いだもの）の上で指す。`word` を渡せば
 * その語の最初の出現、`start` / `end` を渡せばその文字数。生テキストの面は書いてある通りの字
 * なので、そこでは生テキストのオフセットと一致する。整形された本文の面では一致しない——
 * 面が何番と答えるかは位置の口が決めるので、**こちらから位置を教えない**。
 *
 * 選択を作ってから、ブラウザ自身の `selectionchange` が届くのを待つ。注釈の面は
 * `useTextSelection` でそれを追っており、届く前に `mouseup` を送ると選択が無いものとして
 * 扱われる。その後、人の操作と同じ順（`mouseup` → `click`）で送る。
 */
export async function selectIn(
  page: Page,
  testId: string,
  target: { word: string } | { start: number; end: number },
): Promise<void> {
  await page.evaluate(
    async ({ testId, target }) => {
      const surface = document.querySelector(`[data-testid="${testId}"]`);
      if (surface === null) throw new Error(`面（${testId}）が出ていない`);

      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
      const pieces: { node: Text; start: number }[] = [];
      let text = '';
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        pieces.push({ node: node as Text, start: text.length });
        text += (node as Text).data;
      }

      let start: number;
      let end: number;
      if ('word' in target) {
        start = text.indexOf(target.word);
        if (start < 0) throw new Error(`面に「${target.word}」が出ていない`);
        end = start + target.word.length;
      } else {
        start = target.start;
        end = target.end;
      }

      /** 面の先頭からの文字数を `Range` の端へ。始まりは後ろ寄り、終わりは前寄りに採る */
      const pointAt = (offset: number, side: 'start' | 'end'): { node: Text; offset: number } => {
        for (const piece of pieces) {
          const length = piece.node.data.length;
          const inside = side === 'start' ? offset < piece.start + length : offset <= piece.start + length;
          if (inside && offset >= piece.start) return { node: piece.node, offset: offset - piece.start };
        }
        throw new Error(`面の ${offset} 文字目に当たる字が無い`);
      };

      const head = pointAt(start, 'start');
      const tail = pointAt(end, 'end');
      const range = document.createRange();
      range.setStart(head.node, head.offset);
      range.setEnd(tail.node, tail.offset);

      const current = window.getSelection();
      if (current === null) throw new Error('選択を作れない');

      const changed = new Promise<void>((resolve) => {
        const done = (): void => {
          document.removeEventListener('selectionchange', done);
          resolve();
        };
        document.addEventListener('selectionchange', done);
        setTimeout(done, 500);
      });

      current.removeAllRanges();
      current.addRange(range);
      await changed;

      surface.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      surface.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },
    { testId, target },
  );
}

/**
 * 塗られている字。
 *
 * 塗りは CSS Custom Highlight API で、本文の要素を作らない（`<mark>` は無い）。
 * どこが塗られているかは `CSS.highlights` に入っている `Range` を読む。名前は色ごと
 * （`sb-annotation-<色名>`）で、一覧から辿った範囲は `sb-annotation-focus`。
 *
 * 面が2つ載っているとき（承認画面のプレビューは `v-show` で残る）は、同じ字が面の数だけ入る。
 */
export async function painted(page: Page, name = 'yellow'): Promise<string[]> {
  return page.evaluate((highlightName) => {
    const highlight = CSS.highlights.get(highlightName);
    if (highlight === undefined) return [];
    const out: string[] = [];
    highlight.forEach((range) => out.push(range.toString()));
    return out.sort();
  }, `sb-annotation-${name}`);
}

/**
 * 本文へのコメントを1件付ける。モーダルが開いてから本文を入れて確定する。
 *
 * モーダルは題で引く。ストロークの画面は器そのものが fullscreen の `UModal`（dialog）なので、
 * 役割だけで引くと器に当たる。
 */
export async function addSelectionComment(page: Page, body: string): Promise<void> {
  const modal = page.getByRole('dialog', { name: 'この箇所にコメント' });
  await expect(modal).toBeVisible();
  await modal.getByRole('textbox').fill(body);
  await modal.getByRole('button', { name: '付ける' }).click();
  await expect(modal).toHaveCount(0);
}
