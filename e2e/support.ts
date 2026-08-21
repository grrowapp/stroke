/**
 * E2E の下ごしらえ。本家スタブの状態を動かす口と、テスト間で状態を戻す手順。
 */

import { writeFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { REGISTRY_PATH, STUB_PORT, registryContent } from '../playwright.config';

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
  stats: () => control<{ sockets: number; progressRequests: number }>('stats'),

  /** 完了数を1つ増やす */
  completeTask: (projectId: string, specName = 'auth-spec') =>
    control('complete-task', { projectId, specName }),

  /** タスクを着手中にする */
  startTask: (projectId: string, taskId: string, specName = 'auth-spec') =>
    control('start-task', { projectId, specName, taskId }),

  /** 承認依頼を立てる */
  requestApproval: (
    projectId: string,
    options: {
      id: string;
      title: string;
      filePath: string;
      category: 'spec' | 'steering';
      categoryName: string;
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
