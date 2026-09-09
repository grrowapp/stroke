/**
 * E2E の下ごしらえ。本家スタブの状態を動かす口と、テスト間で状態を戻す手順、
 * それに注釈の面（`app/components/review/AnnotateSource.vue`）を操作する口。
 */

import { writeFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { REGISTRY_PATH, STUB_PORT, registryContent } from '../../playwright.config';

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

/** tasks を持つ spec の数 × アクティブなプロジェクト数。基準が揃った判定に使う */
const EXPECTED_PROGRESS_REQUESTS = 2;

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
  await page.goto('/');
  await expect(page.getByTestId('upstream-connection')).toHaveAttribute('data-connected', 'false');
  await expect(page.getByTestId('notification-row')).toHaveCount(0);

  await options.whileDisconnected?.();

  writeFileSync(REGISTRY_PATH, registryContent());
  await expect(page.getByTestId('upstream-connection')).toHaveAttribute('data-connected', 'true');

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
