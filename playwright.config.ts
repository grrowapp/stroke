import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

/**
 * E2E は本物の spec-workflow-mcp を使わない。
 *
 * 承認依頼やタスクの状態を動かすには本家へ書き込む必要があるが、stroke-board は
 * `.spec-workflow/` に書き込まないと決めている（docs/adr/0001）。テストのためにその線を
 * 越えない。代わりに実測した形と同じペイロードを返すスタブを使い、スタブが実物と
 * ずれていないことは `yarn test:live` が本物に対して確かめる。
 */

/*
 * ポートはワークツリーごとに変える。`stroke-board` は base2 / base3 / base4 の複数の
 * ワークツリーを並行して使っており、同じ値だと**別のワークツリーの e2e が起動した瞬間に
 * こちらの web サーバが落ちる**（実測: 2026-08-25、`[WebServer] Killed` が2回）。
 * playwright は `reuseExistingServer: false` で走るので、同時実行の検出も排他もしない。
 *
 * 百の位でワークツリーを分け、下2桁は 00 で揃える。
 * base2 = 3200/5200（宣言済み） / **base3 = 3300/5300（ここ）** / base4 = 3400/5400。
 */
export const STUB_PORT = 5300;
export const APP_PORT = 3300;

/** 走査対象と registry をここに作る */
export const E2E_ROOT = join(process.cwd(), '.e2e-tmp');
export const PROJECTS_PARENT = join(E2E_ROOT, 'projects');
export const SPEC_WORKFLOW_HOME = join(E2E_ROOT, 'home');
export const REGISTRY_PATH = join(SPEC_WORKFLOW_HOME, 'activeProjects.json');

/** アクティブ2件 + 未接続1件。アクティブが上・未接続が下の並びを確かめられる */
export const ACTIVE = [
  { projectId: 'ALPHAID000000001', name: 'alpha' },
  { projectId: 'BETAID0000000002', name: 'beta' },
];
export const DISCONNECTED = ['idle-project'];

/**
 * テスト間で通知の一覧を空に戻すために、registry を空にしてから戻す。
 * 空にするとアクティブ集合から消え、そのプロジェクトの通知が落ちる（既存の振る舞い）。
 * そのため `syncIntervalMs` を短くしてある。
 */
export const SYNC_INTERVAL_MS = 300;

export function registryContent(): string {
  return JSON.stringify(
    Object.fromEntries(
      ACTIVE.map((project) => [
        project.projectId,
        {
          projectId: project.projectId,
          projectPath: `/workspace/${project.name}`,
          // 走査結果との突き合わせはこれ（design.md 決定1）
          workflowRootPath: join(PROJECTS_PARENT, project.name),
          projectName: project.name,
          instances: [{ pid: process.pid, registeredAt: new Date().toISOString() }],
        },
      ]),
    ),
    null,
    2,
  );
}

for (const name of [...ACTIVE.map((project) => project.name), ...DISCONNECTED]) {
  mkdirSync(join(PROJECTS_PARENT, name, '.spec-workflow'), { recursive: true });
}

mkdirSync(SPEC_WORKFLOW_HOME, { recursive: true });
writeFileSync(REGISTRY_PATH, registryContent());

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node e2e/fixtures/upstream-stub.mjs ${STUB_PORT}`,
      url: `http://127.0.0.1:${STUB_PORT}/api/projects/list`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node .output/server/index.mjs',
      url: `http://127.0.0.1:${APP_PORT}/api/projects`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(APP_PORT),
        NUXT_UPSTREAM_BASE_URL: `http://127.0.0.1:${STUB_PORT}`,
        NUXT_PROJECTS_PARENT_PATH: PROJECTS_PARENT,
        NUXT_SPEC_WORKFLOW_HOME: SPEC_WORKFLOW_HOME,
        NUXT_SYNC_INTERVAL_MS: String(SYNC_INTERVAL_MS),
      },
    },
  ],
});
