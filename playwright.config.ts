import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { defineConfig } from '@playwright/test';

/**
 * E2E は本物の spec-workflow-mcp を使わない。
 *
 * 承認依頼やタスクの状態を動かすには本家へ書き込む必要があるが、stroke-board は
 * `.spec-workflow/` に書き込まないと決めている（docs/adr/0001）。テストのためにその線を
 * 越えない。代わりに実測した形と同じペイロードを返すスタブを使い、スタブが実物と
 * ずれていないことは `yarn test:live` が本物に対して確かめる。
 */

/**
 * 待ち受けは**作業ツリーごとに固定**する。
 *
 * 同じマシンで `base` / `base2` / … を並べて動かすため、共通のポートにすると
 * 「既に使われている」で起動できないだけでなく、先に立っている別ツリーのアプリへ
 * テストが当たってしまう（実測: 別ツリーの実行と混ざって通知の件数が合わなくなった。
 * 2026-08-25 には別ツリーの e2e 起動でこちらの web サーバが2回落ちている。
 * playwright は `reuseExistingServer: false` で走るので、同時実行の検出も排他もしない）。
 *
 * 割り当ては固定表で持つ。ハッシュで散らすと、どのツリーがどのポートかを人が引けない。
 */
const PORT_SLOT: Record<string, number> = {
  base: 1,
  base2: 2,
  // 3 は欠番。slot 3 の APP_PORT が dev サーバーの固定ポート 3399 と被るため（CLAUDE.md の Dev サーバー）
  base4: 4,
  mvp: 5,
  base3: 6,
};

/** 表に無い作業ツリーはまとめて 9 番。並列で使うなら表に足すこと。 */
const slot = PORT_SLOT[basename(process.cwd())] ?? 9;

/** base=5199/3199、base2=5299/3299、base3=5699/3699 … */
export const STUB_PORT = 5099 + slot * 100;
export const APP_PORT = 3099 + slot * 100;

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

/**
 * 承認まで進んだセッション。
 *
 * ストロークの往復は claude が要るので E2E では回せない。承認の一手前の状態を直接
 * 置いて、そこから先（承認 → 昇格 → 一覧へ戻る）だけを確かめる。
 *
 * `docs/proposal.md` を置くのは、承認がそれを前提にするためである（サーバーは書かない）。
 */
export const SEEDED_SESSION_ID = '11111111-2222-4333-8444-555555555555';
export const SEEDED_PROJECT_NAME = 'promoted-project';

const seeded = join(PROJECTS_PARENT, SEEDED_SESSION_ID);
mkdirSync(join(seeded, 'docs'), { recursive: true });
mkdirSync(join(seeded, 'openspec'), { recursive: true });
writeFileSync(join(seeded, 'openspec', 'config.yaml'), 'schema: flontier-strokeflow\n');
writeFileSync(join(seeded, 'docs', 'proposal.md'), '# 承認できる proposal\n\n本文。\n');
writeFileSync(join(seeded, 'overview.txt'), 'E2E のための概要\n');
writeFileSync(join(seeded, 'strokes.json'), '[{"proposal":true,"question":null,"answer":null}]\n');
writeFileSync(
  join(seeded, 'state.json'),
  `${JSON.stringify({ phase: 'proposed', currentQuestion: null, invocation: 'idle', retries: 0 }, null, 2)}\n`,
);

mkdirSync(SPEC_WORKFLOW_HOME, { recursive: true });
writeFileSync(REGISTRY_PATH, registryContent());

export default defineConfig({
  testDir: './test/e2e',
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
      command: `node test/e2e/fixtures/upstream-stub.mjs ${STUB_PORT}`,
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
        // 設定は `nuxt.config.ts` が正で、運用では環境変数から読まない
        // （docs/specs/core/settings-reference.md）。ただし Nuxt の `NUXT_*` 上書きは
        // 機構として残っており、E2E はそれを使って走査先を一時ディレクトリへ向ける。
        // 本物の `/opt/projects` に書かないための、テスト限定の差し替えである。
        NUXT_PROJECT_SHARE_ROOT: PROJECTS_PARENT,
        // 承認は昇格の直後に steering の claude を起こす（ADR 0011）。E2E で本物を
        // 走らせないよう、起動する実行ファイルだけ何もしないものに差し替える。
        NUXT_CLAUDE_COMMAND: '/bin/true',
        NUXT_SPEC_WORKFLOW_HOME: SPEC_WORKFLOW_HOME,
        NUXT_SYNC_INTERVAL_MS: String(SYNC_INTERVAL_MS),
      },
    },
  ],
});
