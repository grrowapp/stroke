/**
 * 稼働中の本家に対する実疎通。`yarn test:live` で走らせる。
 *
 * 通常の `yarn test` からは外してある（vitest.config.ts の exclude）。本家が動いていない
 * 環境で落ちても、それは本家が動いていないという事実であって stroke-board の不具合ではない。
 */

import { describe, expect, it } from 'vitest';

import { UpstreamRestClient } from './rest';

const baseUrl = process.env.NUXT_UPSTREAM_BASE_URL ?? 'http://127.0.0.1:5000';
const client = new UpstreamRestClient(baseUrl);

/** 稼働中の本家から適当なプロジェクトを1つ選ぶ。固定 ID を埋めるとこの環境でしか動かない */
async function anyProjectId(): Promise<string> {
  const list = (await fetch(`${baseUrl}/api/projects/list`).then((r) => r.json())) as {
    projectId: string;
  }[];
  const first = list[0];
  if (!first) throw new Error('本家にアクティブなプロジェクトが1件も無い');
  return first.projectId;
}

describe('本家 REST の読み取り', () => {
  it('プロジェクト情報が取れる', async () => {
    const result = await client.getProjectInfo(await anyProjectId());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.steering.documents).toHaveProperty('product');
  });

  it('spec 一覧が取れる', async () => {
    const result = await client.listSpecs(await anyProjectId());
    expect(result.ok).toBe(true);
  });

  it('保留中の承認依頼が取れる', async () => {
    const result = await client.listPendingApprovals(await anyProjectId());
    expect(result.ok).toBe(true);
  });

  it('ステアリング文書が取れる', async () => {
    const result = await client.getSteeringDocument(await anyProjectId(), 'tech');
    expect(result.ok || result.failure.kind === 'not-found').toBe(true);
  });

  it('知らない projectId は not-found として返る', async () => {
    const result = await client.getProjectInfo('definitely-not-a-project');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('not-found');
  });

  it('繋がらない先は unreachable として返る', async () => {
    const result = await new UpstreamRestClient('http://127.0.0.1:59999').getProjectInfo('x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('unreachable');
  });

  it('未設定は not-configured として返る', async () => {
    const result = await new UpstreamRestClient(null).getProjectInfo('x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('not-configured');
  });
});
