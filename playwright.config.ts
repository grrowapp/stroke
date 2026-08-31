import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
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

/**
 * 待ち受けは**実行のたびに空きを OS から取る**。
 *
 * 同じマシンで作業ツリーを並べて動かすため、共通のポートにすると「既に使われている」で
 * 起動できないだけでなく、先に立っている別ツリーのアプリへテストが当たってしまう
 * （実測: 別ツリーの実行と混ざって通知の件数が合わなくなった。2026-08-25 には別ツリーの
 * e2e 起動でこちらの web サーバが2回落ちている。playwright は `reuseExistingServer: false`
 * で走るので、同時実行の検出も排他もしない）。
 *
 * **かつては作業ツリー名の固定表で割り当てていた。** 表に無いツリーはまとめて 1 つの
 * スロットへ落ちる作りだったため、`pre1`〜`pre7` の7本が同じ待ち受けを奪い合っていた
 * （実測 2026-08-31: pre3 の実行中は pre6 が起動できない）。ツリーを増やすたびに人が
 * 表を足す必要があり、足し忘れは衝突ではなく「他人のスタブを掴む」方向へ倒れることもある。
 *
 * スタブもアプリも実行のたびに立てて捨てるもので、**人がブラウザで繋ぎに行かない**。
 * 固定である必要はなく、空きを取れば衝突は原理的に起きない。人が繋ぐ dev サーバー
 * （3399 固定・`CLAUDE.md`）とは要件が違う。
 */
/**
 * 探し始める番号。**50000 から上だけを使う。**
 *
 * OS に任せる（`listen(0)`）と ephemeral の範囲から選ばれ、そこは他のプロセスが
 * 一時的な発信元として使う帯でもある。ここを避けて、E2E は 50000 以上に固定で寄せる。
 * どのポートを使ったかはログに出るので、人が見つけたいときも範囲が分かっていればよい。
 */
const PORT_SEARCH_START = 50000;

/** 上限。ここまで空きが無ければ、待ち受けではなく環境の問題として落とす */
const PORT_SEARCH_END = 60000;

/** その番号で待ち受けられるか。使用中なら false を返し、それ以外の失敗は投げる */
async function isFree(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(error);
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(true));
    });
  });
}

/**
 * `from` から上へ順に空きを探す。
 *
 * 控えてから閉じて渡すので、取ってから本番が待ち受けるまでの間に別のプロセスが
 * 割り込む隙は残る。順に上がる作りなので、同時に走る2本が同じ番号で止まり続けることは
 * ない——先に取った側が使い始めれば、次の実行はその上を見る。
 */
async function takeFreePort(from: number): Promise<number> {
  for (let port = from; port < PORT_SEARCH_END; port += 1) {
    if (await isFree(port)) return port;
  }
  throw new Error(`${from}〜${PORT_SEARCH_END} に空きポートが無い`);
}

/**
 * 決めた番号を環境変数へ控えて持ち回る。
 *
 * **この設定はワーカーでも読まれる。** `e2e/support.ts` などが `STUB_PORT` を import
 * するため、テストの実行プロセスごとにこのモジュールが評価し直される。空きを探す作りは
 * 評価のたびに違う番号を返すので、控えずに使うと webServer が握った番号とテストが
 * 見に行く番号がずれる（実測 2026-08-31: `TypeError: fetch failed` で 207 件が落ちた）。
 *
 * 環境変数は本体プロセスで先に決まり、ワーカーは fork 時にそれを引き継ぐ。固定表の頃は
 * 何度評価しても同じ値だったので、この持ち回りが要らなかった。
 */
async function resolvePort(key: string, from: number): Promise<number> {
  const controlled = process.env[key];
  if (controlled !== undefined && controlled !== '') return Number(controlled);

  const port = await takeFreePort(from);
  process.env[key] = String(port);
  return port;
}

export const STUB_PORT = await resolvePort('E2E_STUB_PORT', PORT_SEARCH_START);
export const APP_PORT = await resolvePort('E2E_APP_PORT', STUB_PORT + 1);

/** 走査対象と registry をここに作る */
export const E2E_ROOT = join(process.cwd(), '.e2e-tmp');
export const PROJECTS_PARENT = join(E2E_ROOT, 'projects');
export const SPEC_WORKFLOW_HOME = join(E2E_ROOT, 'home');
export const REGISTRY_PATH = join(SPEC_WORKFLOW_HOME, 'activeProjects.json');

/**
 * **E2E を本物へ向けて走らせない。**
 *
 * この設定は本家のスタブと使い捨ての保存先を前提にしている。稼働中の本家
 * （`localhost:5000`）や本物の `/opt/projects` を向いたまま走らせると、承認や却下が
 * 実物へ届き、テストのために `.spec-workflow/` を書き換えることになる。ADR-0001 が
 * 引いた「stroke-board は `.spec-workflow/` へ直接書かない」の線を、テストが越える。
 *
 * 環境変数で外から差し替えられる余地があるので、**起動する前にここで落とす**。
 * 本物に対して確かめるのは `yarn test:live` の役目で、あちらは別の設定を持つ。
 */
function refuseRealTargets(): void {
  const sandbox = [
    ['NUXT_PROJECT_SHARE_ROOT', PROJECTS_PARENT],
    ['NUXT_SPEC_WORKFLOW_HOME', SPEC_WORKFLOW_HOME],
  ] as const;

  for (const [key, expected] of sandbox) {
    const given = process.env[key];
    if (given !== undefined && given !== '' && given !== expected) {
      throw new Error(
        `E2E は使い捨ての保存先だけを使う。${key} が ${given} を指している（期待: ${expected}）。` +
          '本物に対して確かめるなら yarn test:live を使うこと',
      );
    }
  }

  // 保存先が作業ツリーの `.e2e-tmp` の下から出ていないこと。ここを外れると本物を消しうる
  for (const path of [PROJECTS_PARENT, SPEC_WORKFLOW_HOME]) {
    if (!path.startsWith(`${E2E_ROOT}/`)) {
      throw new Error(`E2E の保存先が .e2e-tmp の外を指している: ${path}`);
    }
  }

  // 上流は必ず自分で立てたスタブ。稼働中の本家へ向けない
  const upstream = process.env['NUXT_UPSTREAM_BASE_URL'];
  const stub = `http://127.0.0.1:${STUB_PORT}`;
  if (upstream !== undefined && upstream !== '' && upstream !== stub) {
    throw new Error(
      `E2E は本家のスタブだけを使う。NUXT_UPSTREAM_BASE_URL が ${upstream} を指している。` +
        '稼働中の本家へ向けて走らせない（ADR-0001）',
    );
  }
}

refuseRealTargets();

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
