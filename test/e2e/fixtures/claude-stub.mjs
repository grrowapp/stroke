#!/usr/bin/env node
/**
 * E2E 用の claude スタブ。`runtimeConfig.claude.command` の差し替え先として使う
 * （`playwright.config.ts` の `NUXT_CLAUDE_COMMAND`）。
 *
 * 実物の claude は E2E では走らせない。それでも「実行の決着で局面が動く」
 * （change fix-rename-during-running-session）を確かめるには、提出してから終わる子プロセスが
 * 要る——決着を叩くのは invokeAi で、その引き金は子プロセスの output stream の成功
 * エンベロープだからである（openspec/specs/agent/invocation）。
 *
 * ## 何もしないのが既定である
 *
 * cwd に台本（`.claude-stub.json`）が無ければ、何も出さずに終了コード 0 で終わる。これは
 * 差し替え前の `/bin/true` とまったく同じ振る舞いで、成功エンベロープが出ないので実行は
 * `failed` になる。**既存の spec はこの既定の上に載っている**（`stroke-exit.spec.ts` の
 * 「claude は提出が無く failed」）ので、台本を置いた対象だけが別の振る舞いをする。
 *
 * ## 台本
 *
 * ```json
 * { "proposal": "<提出する本文>", "projectName": "<名前候補>" }
 * ```
 *
 * 台本が在れば、A7 へ proposal を提出し、`.claude-stub-submitted` を置き、
 * `.claude-stub-release` が現れるまで終わらない。**提出したがまだ終わっていない実行**を
 * テストから作るための握りで、その間に画面2 が開いていないことを見る。
 *
 * 台本は読んだ時点で消す。承認による改名は作業場所ごと運ぶので、消さないと昇格後の
 * steering の起動が同じ台本を拾って提出をやり直す。
 *
 * ## 子プロセスに何が届くか
 *
 * - 対象の id: `--resume` / `--session-id` の値（`server/utils/stroke/claude.ts`）
 * - 接続先: 環境変数 `STROKE_BASEURL`（同上。実際の待ち受けから組み立てられる）
 * - 起動の token: `--mcp-config` の JSON に載る `x-stroke-token` ヘッダ
 *   （`server/utils/stroke/invoke.ts`）。**提出にこれを添えないと、その提出は起動に
 *   属さないものとして記録されず、決着の材料にならない**（`submission-signal.ts`）
 *
 * 実物の claude はこれらを MCP ツール経由で使う。スタブはツールを立てず、同じ token を
 * 添えて endpoint を直接叩く——確かめたいのは提出の経路ではなく、提出と決着の順序である。
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** cwd に置かれる台本と、テストとの握りに使う2つの合図 */
const SCRIPT_FILE = '.claude-stub.json';
const SUBMITTED_FILE = '.claude-stub-submitted';
const RELEASE_FILE = '.claude-stub-release';

/** 合図を待つ上限。テスト側の timeout（30秒）より短くして、待ち切れなかったことを分かるようにする */
const RELEASE_TIMEOUT_MS = 20_000;
const RELEASE_POLL_INTERVAL_MS = 50;

/** `--flag value` の形の値を argv から拾う。無ければ undefined */
function flagValue(flag) {
  const at = process.argv.indexOf(flag);
  return at < 0 ? undefined : process.argv[at + 1];
}

/**
 * この起動の接続表 token。`--mcp-config` の JSON に、サーバー名を1つだけ持つ形で載っている。
 * サーバー名（`MCP_SERVER_NAME`）は知らなくてよいので、最初のエントリから読む。
 */
function connectionToken() {
  const raw = flagValue('--mcp-config');
  if (raw === undefined) return undefined;
  const servers = JSON.parse(raw).mcpServers ?? {};
  return Object.values(servers)[0]?.headers?.['x-stroke-token'];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 成功エンベロープ。**これが invokeAi にとっての完了の検知である**（`claude.ts` の `readEnvelope`） */
function succeed(conversationId) {
  process.stdout.write(
    `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: conversationId ?? null })}\n`,
  );
  process.exit(0);
}

/**
 * 作業場所。**消えていることがある。**
 *
 * 後始末（セッション・プロジェクトの削除）と巡回の起こし直しは重なりうるので、spawn の後に
 * cwd ごと消えた状態で起こされる。`process.cwd()` はそこで ENOENT を投げる。何も出さずに
 * 終わる——実行は「応答が成功として読み取れない」で `failed` になり、消えた対象は次の巡回で
 * 一覧から落ちる。
 */
let cwd;
try {
  cwd = process.cwd();
} catch {
  process.exit(0);
}

const scriptPath = join(cwd, SCRIPT_FILE);
if (!existsSync(scriptPath)) process.exit(0);

const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
// 一度きり。改名で運ばれた先の起動が拾い直さないように、読んだら消す
rmSync(scriptPath, { force: true });

const sessionId = flagValue('--resume') ?? flagValue('--session-id');
const baseUrl = process.env.STROKE_BASEURL;
const token = connectionToken();

if (sessionId === undefined || baseUrl === undefined || token === undefined) {
  process.stderr.write(
    `claude スタブが起動の材料を受け取れない: sessionId=${sessionId} baseUrl=${baseUrl} token=${token}\n`,
  );
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/strokes/${sessionId}/proposal`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-stroke-token': token },
  body: JSON.stringify({ proposal: script.proposal, projectName: script.projectName }),
});
if (!response.ok) {
  process.stderr.write(`claude スタブの提出が受理されない: ${response.status} ${await response.text()}\n`);
  process.exit(1);
}

// 提出は済んだ。まだ終わっていないこの状態を、テストがここで観測する
writeFileSync(join(cwd, SUBMITTED_FILE), '');

const deadline = Date.now() + RELEASE_TIMEOUT_MS;
while (!existsSync(join(cwd, RELEASE_FILE))) {
  if (Date.now() >= deadline) {
    process.stderr.write(`claude スタブが ${RELEASE_TIMEOUT_MS}ms 待っても終了の合図を受け取れない\n`);
    process.exit(1);
  }
  await sleep(RELEASE_POLL_INTERVAL_MS);
}

succeed(sessionId);
