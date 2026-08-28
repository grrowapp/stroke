import { WebSocket } from 'ws';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { APP_PORT } from '../../playwright.config';

/**
 * 配信先が切れてもシステムは動き続ける
 * （openspec/specs/agent-question・openspec/specs/proposal-review）。
 *
 * 確かめるのは症状であって内部の作りではない。判定は「サーバーが応答を続けているか」の
 * 1点で行い、配信の中身もハンドラの実装も見ない。
 *
 * **ここが見ているのはビルド済みサーバーである。** playwright は `.output` を立てるので、
 * dev だけで起きる停止（`nuxt.config.ts` の `hooks.listen` を参照）はここでは再現しない。
 * 実測でも、修正の前後どちらでもこの2件は通る。dev 側の確認は別口
 * （`yarn check:ws-disconnect`）が受け持つ。
 *
 * それでもこれを置くのは、ビルド済みサーバーが異常切断に耐えることが独立した契約であり、
 * 将来ハンドラに `await` や送信が足されたときに崩れうるためである。
 */

/** 繋いでは切るを繰り返す回数。1回では通り抜けることがあるので繰り返して当てる */
const ROUNDS = 20;

/** 話題タグ12字・問い本文20字・選択肢の説明50字までが契約（server/utils/stroke/question.ts） */
const QUESTION = {
  header: '保存の方式',
  detail: 'ここまでに決まったこと: 記録はファイルに置く。',
  question: '保存方式をどうするか',
  options: [
    { label: '同期で書く', description: '書き終わるまで待つ。取りこぼしが起きない', recommended: true },
    { label: '非同期で書く', description: '待たずに返す。速いが取りこぼしが起きうる' },
  ],
};

async function startSession(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/strokes', {
    data: { overview: 'E2E: 切断でサーバーが止まらないことを確かめる' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { sessionId } = (await response.json()) as { sessionId: string };
  return sessionId;
}

/** A5: 今の1問を提出する。これが無いと W1 の接続時配信そのものが発火しない */
async function submitQuestion(request: APIRequestContext, sessionId: string): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/question`, { data: QUESTION });
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** A7: proposal を提出する。これが無いと W2 の接続時配信そのものが発火しない */
async function submitProposal(request: APIRequestContext, sessionId: string): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/proposal`, {
    data: { proposal: '# 提案\n\nE2E の proposal 本文。', projectName: 'e2e-ws-disconnect' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * 繋がった瞬間に相手が消える状態を作る。
 *
 * `terminate()` は閉じる挨拶を送らずにソケットを落とす。ブラウザのリロード・タブを
 * 閉じる操作で起きることと同じで、サーバーは接続時配信を送ろうとした時点で相手を
 * 失っている。`close()` だと挨拶の往復を待つぶん、この隙が作りにくい。
 */
function connectThenVanish(sessionId: string, channel: 'question' | 'proposal'): Promise<void> {
  return new Promise((resolve) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${APP_PORT}/api/strokes/${sessionId}/ws/${channel}`,
    );

    const finish = (): void => {
      socket.removeAllListeners();
      resolve();
    };

    socket.on('open', () => {
      socket.terminate();
      finish();
    });

    // サーバーが既に止まっていれば接続そのものが失敗する。判定は呼び出し側で行う
    socket.on('error', finish);
  });
}

/** 症状の判定はこの1点。止まっていれば繋がらない */
async function serverResponds(request: APIRequestContext): Promise<boolean> {
  const response = await request
    .get('/api/projects', { failOnStatusCode: false })
    .catch(() => null);
  return response?.ok() ?? false;
}

test.describe('配信先が切れてもシステムは動き続ける', () => {
  let created: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const sessionId of created) {
      await request.post(`/api/strokes/${sessionId}/delete`).catch(() => undefined);
    }
    created = [];
  });

  test('W2: proposal の配信先が繋いだ直後に消えても応答を続ける', async ({ request }) => {
    const sessionId = await startSession(request);
    created.push(sessionId);
    await submitProposal(request, sessionId);

    for (let round = 0; round < ROUNDS; round += 1) {
      await connectThenVanish(sessionId, 'proposal');
    }

    expect(await serverResponds(request), 'W2 の切断でサーバーが止まった').toBe(true);
  });

  test('W1: 問いの配信先が繋いだ直後に消えても応答を続ける', async ({ request }) => {
    const sessionId = await startSession(request);
    created.push(sessionId);
    await submitQuestion(request, sessionId);

    for (let round = 0; round < ROUNDS; round += 1) {
      await connectThenVanish(sessionId, 'question');
    }

    expect(await serverResponds(request), 'W1 の切断でサーバーが止まった').toBe(true);
  });
});
