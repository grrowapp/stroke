import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

import { PORT_SEARCH_START, reservePort } from './test/e2e/port-reservation';

/**
 * E2E は本物の spec-workflow-mcp を使わない。
 *
 * 承認依頼やタスクの状態を動かすには本家へ書き込む必要があるが、stroke-board は
 * `.spec-workflow/` に書き込まないと決めている（docs/adr/0001）。テストのためにその線を
 * 越えない。代わりに実測した形と同じペイロードを返すスタブを使い、スタブが実物と
 * ずれていないことは `yarn test:live` が本物に対して確かめる。
 */

/**
 * 待ち受けは**実行のたびに空きを取る**（固定値を持たない）。
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
 * （番号を決めるのは `package.json` の `dev` と `nuxt.config.ts` の `devServer.port`。
 * `CLAUDE.md`）とは要件が違う。
 */
/**
 * 空きの探し方そのものは `test/e2e/port-reservation.ts` にある。
 *
 * **かつてはここに「空きか probe して、閉じてから番号を返す」だけの関数を置いていた。**
 * 確保になっていない（TOCTOU）ことを旧コメントは認めたうえで「順に上がる作りなので、
 * 同時に走る2本が同じ番号で止まり続けることはない」と正当化していたが、それは後から
 * 始まった実行にしか当てはまらない。ほぼ同時に始まった2本は、どちらもまだ誰も listen して
 * いない 50000 を見て揃って同じ番号を選ぶ。実測 2026-09-09: 別ツリー
 * （`update-session-api-handler`）の実行と 50000 番が重なり、
 * `connect ECONNREFUSED 127.0.0.1:50000` で 39 件が落ちた。
 *
 * いまは番号ごとの予約ファイルを排他作成して確保する。切り出したのは、その当たり外れを
 * 素の vitest で固定するためである（`test/e2e/port-reservation.test.ts`）。
 */

/**
 * 決めた番号を環境変数へ控えて持ち回る。
 *
 * **この設定はワーカーでも読まれる。** `test/e2e/support.ts` などが `STUB_PORT` を import
 * するため、テストの実行プロセスごとにこのモジュールが評価し直される。空きを探す作りは
 * 評価のたびに違う番号を返すので、控えずに使うと webServer が握った番号とテストが
 * 見に行く番号がずれる（実測 2026-08-31: `TypeError: fetch failed` で 207 件が落ちた）。
 *
 * 環境変数は本体プロセスで先に決まり、ワーカーは fork 時にそれを引き継ぐ。固定表の頃は
 * 何度評価しても同じ値だったので、この持ち回りが要らなかった。
 *
 * **控えがあるワーカーは予約を取らない。** 予約を持つのは本体プロセスだけで、解放も
 * そこの終了時に走る（`port-reservation.ts` の exit hook）。ワーカーが取り直すと番号が
 * ずれるうえ、予約もワーカーの数だけ残ることになる。
 */
async function resolvePort(key: string, from: number): Promise<number> {
  const controlled = process.env[key];
  if (controlled !== undefined && controlled !== '') return Number(controlled);

  const { port } = await reservePort(from);
  process.env[key] = String(port);
  return port;
}

export const STUB_PORT = await resolvePort('E2E_STUB_PORT', PORT_SEARCH_START);
export const APP_PORT = await resolvePort('E2E_APP_PORT', STUB_PORT + 1);

/**
 * 走査対象と registry をここに作る。
 *
 * **この設定ファイルの隣に固定する。** `process.cwd()` から組むと、別の場所から `-c` で
 * この設定を指して起動したとき、その場所の `.e2e-tmp` を作り——下で丸ごと消すようになった
 * ので——消す。消す先を作業ツリーの中に固定できるのは、この定義だけである。
 */
export const E2E_ROOT = join(dirname(fileURLToPath(import.meta.url)), '.e2e-tmp');
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

/**
 * 保存先に種をまく。走査対象（アクティブ2件 + 未接続1件）・承認まで進んだセッション・registry。
 *
 * 作り直しに強い形（`recursive` な mkdir と同じ内容の書き出し）なので、何度呼んでも同じ
 * 状態になる。この設定は worker プロセスでも評価されるため、実際に何度も呼ばれる。
 */
export function seedStore(): void {
  for (const name of [...ACTIVE.map((project) => project.name), ...DISCONNECTED]) {
    mkdirSync(join(PROJECTS_PARENT, name, '.spec-workflow'), { recursive: true });
  }

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
}

/**
 * **実行は既知の保存先から始まる**（openspec/specs/tooling/e2e-harness）。
 *
 * 前の run が後始末に失敗して残したもの（承認済みのプロジェクト等）は、次の run で一覧の
 * 行数を狂わせる（fix-e2e-project-residue）。種をまく前に `.e2e-tmp` を**丸ごと**消す。
 * 名前で選んで消さない——規約から外れた残骸を見逃す。
 *
 * **消すのは本体プロセスの評価だけ。** この設定は worker プロセスでも評価される
 * （Playwright 自身が worker で config を読み直す。`playwright/lib/worker/workerProcessEntry.js`
 * の `deserializeConfig`。加えて `support.ts` などが定数を import する）。worker でも消すと、
 * 種をまいた後の保存先を worker の起動のたびに消して作り直す。worker では
 * `TEST_PARALLEL_INDEX` が config を読むより前に立つ（同ファイル）ので、無いときだけ消す。
 *
 * **`globalSetup` には置かない。** Playwright は `webServer` を立ててから `globalSetup` を
 * 走らせる（`playwright/lib/runner/index.js` の `createGlobalSetupTasks`）。サーバが立った後に
 * 消すと、まき直すまでの隙間にサーバが空の保存先を読む。ここ（config の評価）は
 * `yarn test:e2e`（`playwright test`）ではサーバの起動より前である。
 *
 * 消す先は `E2E_ROOT` そのもので、この設定ファイルの隣の `.e2e-tmp` に固定されている
 * （上の定義）。`refuseRealTargets()` が守るのは、サーバと種の書き先が `E2E_ROOT` の下から
 * 出ていないことと、環境変数での差し替えであって、消す先の所在ではない。
 *
 * 落ちた run の残骸は次の run が始まるまで残るので、調べたければその前に見る。
 * `playwright test --list` も config を評価するので、一覧を出すだけでも消える。
 */
if (process.env['TEST_PARALLEL_INDEX'] === undefined) {
  rmSync(E2E_ROOT, { recursive: true, force: true });
}
seedStore();

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  /**
   * テスト1件の上限。
   *
   * **45秒。** 30秒だった頃、`approval-annotation.spec.ts` の長い1件が混雑時に 28.8 秒まで
   * 伸びて時間切れになった（単独で走らせれば通る。実測 2026-09-09）。この spec は本文を
   * 描画してから範囲を選び、指摘を付けて確かめるまでを1件でやるので、他の実行と機械を
   * 分け合っているときは素で30秒に迫る。上限が実測とほぼ同じだと、遅い日にだけ落ちる。
   *
   * 個々の待ちには別に上限が置いてある（`support.ts` の接続待ちなど）ので、ここを伸ばしても
   * 固まったテストが放置されるわけではない。
   */
  timeout: 45_000,
  /**
   * 判定1つあたりの待ちの上限。
   *
   * **15秒。** playwright の既定は5秒で、混雑した機械ではそれが持たない。teleport される面
   * （`app/layouts/stroke.vue` の `UModal`）は SSR の HTML に出ないので
   * （実測: `/strokes/<id>` の応答に `agent-question-text` も `stroke-modal` も無い）、
   * その面を見る判定はどれも「ページを読み込んでハイドレーションが済むまで」を待つことになる。
   *
   * 実測（2026-09-10、`/strokes/<id>` を 30 回開いて、`goto` が返ってから
   * `agent-question-text` が出るまでを測った）:
   *
   * | 機械の混み具合（load average / 8 core） | p50 | 最大 |
   * | --- | --- | --- |
   * | 8 前後（他の作業ツリーの E2E と並走。n=100） | 1.4 秒 | 1.7 秒 |
   * | 15 前後（さらに負荷を掛けた。n=30） | 3.3 秒 | 4.0 秒 |
   *
   * 混んだ側の最大は 4.0 秒で、既定の5秒に**余白がほとんど無い**。ここが実測とほぼ同じだと、
   * 遅い日にだけ落ちる——テストごとの上限を 30 秒から 45 秒へ上げたのと同じ理由である（上）。
   *
   * 15 秒にしたのは、いちばん混んだときの実測（4.0 秒）に対して3倍以上の余白を取りつつ、
   * テスト1件の上限（45 秒）の中に収まる値だからである。`support.ts` の接続待ち
   * （`CONNECTION_TIMEOUT_MS`）とも揃う。
   *
   * **待ちを伸ばしても直らないものが別にある。** ブラウザが読み込み途中の script を捨てると
   * 画面は永久に動かない。それは待ちの問題ではないので、`support.ts` の `test` が
   * 読み込み直しで受けている（あちらの docblock）。
   */
  expect: { timeout: 15_000 },
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
        // 走らせないよう、起動する実行ファイルだけスタブに差し替える。
        //
        // **既定は何もしない。** 台本（`.claude-stub.json`）を置かれていない対象では、
        // 何も出さずに終了コード 0 で終わる——かつてここに書いていた `/bin/true` と
        // まったく同じで、成功エンベロープが出ないので実行は `failed` になる。台本を
        // 置いた対象だけが提出して終わる（`test/e2e/fixtures/claude-stub.mjs`）。
        NUXT_CLAUDE_COMMAND: join(dirname(fileURLToPath(import.meta.url)), 'test/e2e/fixtures/claude-stub.mjs'),
        NUXT_SPEC_WORKFLOW_HOME: SPEC_WORKFLOW_HOME,
        NUXT_SYNC_INTERVAL_MS: String(SYNC_INTERVAL_MS),
      },
    },
  ],
});
