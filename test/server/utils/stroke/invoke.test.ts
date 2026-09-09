import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MCP_SERVER_NAME, UPSTREAM_APPROVALS_ALLOWED_TOOL, UPSTREAM_MCP_SERVER_NAME } from '../../../../server/utils/mcp/allowed-tools';
import { resolveConnection, type ConnectionContext } from '../../../../server/utils/mcp/connection-table';
import { MCP_TOOLS_HEADER } from '../../../../server/utils/mcp/exposed-tools';

/**
 * 起動が組み立てる `--mcp-config`（provide-operations-via-mcp）。見るのは、工程ごとに
 * 公開ツールが絞られること——自前 MCP サーバーはツールを1本残らず単一の `/mcp` に登録するので、
 * 絞らないと flontier の claude にも steering 専用のツールが見え、呼ばれて失敗する。
 *
 * あわせて `kick` の後始末（接続表への登録 → 実行終了で削除）も見る。token が消え残ると、
 * 終わった起動の token でツールを呼べてしまう（specs `server/session-management`
 * 「実行の終了（正常・異常とも）で無効になる」）。発行・登録・失効を行うのは invoke-agent
 * （`kick`）だけである。
 */

/** `readStrokeConfig` を throw させる細工。`buildRun` が同期的に落ちる経路を作るのに使う */
const config = vi.hoisted(() => ({ broken: false }));

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => {
    if (config.broken) throw new Error('設定を読めない');
    return {
      projectShareRoot: '/tmp/share',
      claude: {
        command: 'claude',
        args: ['--setting-sources', 'project'],
        workflowSchema: 'flontier-strokeflow',
        firstPrompt: 'first',
        continuePrompt: 'continue',
        steeringPrompt: 'steering',
        maxRetries: 2,
        timeoutMs: 1000,
        timeoutStepMs: 0,
        debugLogDir: '',
      },
      openspec: { bin: 'openspec', initArgs: 'init --yes' },
      wsPathPattern: '/ws/{channel}',
    };
  },
}));

/**
 * MCP の url に使う base URL は実際の待ち受けから組み立てる（provide-operations-via-mcp
 * 続き。`listen-address.ts`）。ここで見たいのは buildRun がその値をそのまま url・
 * STROKE_BASEURL に使うことだけなので、固定値を返す細工で足りる。
 */
vi.mock('../../../../server/utils/stroke/listen-address', () => ({
  currentApiBaseUrl: () => 'http://example.test:3399',
}));

/**
 * 実行そのものは差し替える。見たいのは `kick` の前後の後始末（token の登録・削除）と、
 * `kick` が `invokeAi` へ何を渡すかだけである——`invokeAi` 自身が組み立て失敗をどう
 * 記録するか（`failed`/`error`・回数の進め方）は `ai.test.ts` の責務。
 */
type InvokeAiOutcome = { built: Promise<void>, settled: Promise<void> };

const ai = vi.hoisted(() => ({
  invokeAi: vi.fn<(sessionId: string, retries: number, build: () => unknown) => InvokeAiOutcome>(),
}));

vi.mock('../../../../server/utils/stroke/ai', () => ({ invokeAi: ai.invokeAi }));

/** invoke.ts が叩く自分自身の endpoint（U15・U12）。`ai.test.ts` と同じ差し替え方 */
const $fetch = vi.hoisted(() => vi.fn());

vi.mock('#build/fetch.mjs', () => ({ $fetch }));

/** U15 に断られたときに読み直す `state.json`。既定は読めない（= 記録されていない） */
const store = vi.hoisted(() => ({ readState: vi.fn(async (): Promise<unknown> => { throw new Error('no state'); }) }));

vi.mock('../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../server/utils/stroke/session-store')>()),
  readState: store.readState,
}));

/**
 * steering の `didWork` が問い合わせる本家 REST（`upstreamClient` の `getProjectInfo` /
 * `listPendingApprovals` / `listProjects`）。`resolveProjectId` は `listProjects` の応答から
 * projectId を解決するので、こちらも同じ差し替えで駆動する。
 */
const upstream = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProjectInfo: vi.fn(),
  listPendingApprovals: vi.fn(),
}));

vi.mock('../../../../server/utils/control/upstream-proxy', async (importOriginal) => ({
  // `upstreamClient` だけを差し替え、同じモジュールの他の export（`toHttpError` など。
  // `invoke.ts` の import 先が間接的に使う）は本物のまま残す。factory で丸ごと置き換えると
  // 無い export へのアクセスで throw し、判定が warn の分岐ではなく例外の経路で false になる
  ...(await importOriginal<typeof import('../../../../server/utils/control/upstream-proxy')>()),
  upstreamClient: () => upstream,
}));

/**
 * steering 工程の `--mcp-config` に並べる本家 MCP の env `SPEC_WORKFLOW_HOME` は、ポータルが
 * 登録簿を読むのと同じ値（`readServerConfig().specWorkflowHome`）から取る。ここで見たいのは
 * その値がそのまま env に載ることだけなので、固定値で足りる。
 */
const SPEC_WORKFLOW_HOME = '/tmp/spec-workflow-home';

vi.mock('../../../../server/utils/config', () => ({
  readServerConfig: () => ({
    upstreamBaseUrl: 'http://upstream.test',
    specWorkflowHome: SPEC_WORKFLOW_HOME,
    syncIntervalMs: 1000,
  }),
}));

/**
 * 接続表の token は `randomBytes` から作られる（`server/utils/mcp/connection-table.ts`）。
 * `kick` が発行した token を外から知りたいので、乱数だけを予測可能な値に差し替える。
 * 呼ぶたびに違う値になる性質（起動ごとに別の token）は保つ。
 */
const random = vi.hoisted(() => ({ issued: 0 }));

vi.mock('node:crypto', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:crypto')>(),
  randomBytes: (size: number) => Buffer.alloc(size, ++random.issued),
}));

/** 直前に発行された token。`kick` を呼んだ後に読む */
function issuedToken(): string {
  return Buffer.alloc(32, random.issued).toString('hex');
}

/** 接続表に載っていれば文脈を、載っていなければ null を返す（401 は ok:false の結果で来る） */
function registered(token: string): ConnectionContext | null {
  const resolved = resolveConnection({ 'x-stroke-token': token });
  return resolved.ok ? resolved.context : null;
}

const { buildRun, kick, kindOf } = await import('../../../../server/utils/stroke/invoke');

/** 用途を phase で渡す（add-activated-phase design D4）。テストの語彙は kind のまま残す */
const PHASE_OF = { stroke: 'stroking', steering: 'approved' } as const;
const { notifySubmission, forgetSubmissions } = await import('../../../../server/utils/stroke/submission-signal');

type McpConfig = {
  mcpServers: Record<string, {
    url?: string,
    headers?: Record<string, string>,
    command?: string,
    args?: string[],
    env?: Record<string, string>,
  }>,
};

/** 起動 args から `--mcp-config` の JSON をまるごと取り出す。 */
function mcpConfigOf(kind: 'stroke' | 'steering'): McpConfig {
  const run = buildRun({
    sessionId: 'session-1',
    cwd: '/tmp/share/session-1',
    phase: PHASE_OF[kind],
    retries: 0,
    token: 'token-1',
  });
  const at = run.launch.args.indexOf('--mcp-config');
  expect(at).not.toBe(-1);
  return JSON.parse(run.launch.args[at + 1]!) as McpConfig;
}

/** 起動 args から `--mcp-config` の JSON を取り出し、自前 MCP サーバーのエントリを返す。 */
function mcpToolServerEntryOf(kind: 'stroke' | 'steering') {
  const run = buildRun({
    sessionId: 'session-1',
    cwd: '/tmp/share/session-1',
    phase: PHASE_OF[kind],
    retries: 0,
    token: 'token-1',
  });
  const at = run.launch.args.indexOf('--mcp-config');
  expect(at).not.toBe(-1);

  const config = JSON.parse(run.launch.args[at + 1]!) as McpConfig;
  return config.mcpServers[MCP_SERVER_NAME]!;
}

/** 起動 args の `--allowedTools` の値。フラグが無ければ空にする（別の引数を見にいかない） */
function allowedToolsOf(kind: 'stroke' | 'steering'): string[] {
  const run = buildRun({
    sessionId: 'session-1',
    cwd: '/tmp/share/session-1',
    phase: PHASE_OF[kind],
    retries: 0,
    token: 'token-1',
  });
  const at = run.launch.args.indexOf('--allowedTools');
  return at === -1 ? [] : run.launch.args[at + 1]!.split(' ');
}

function exposedToolsOf(kind: 'stroke' | 'steering'): string[] {
  return mcpToolServerEntryOf(kind).headers[MCP_TOOLS_HEADER]!.split(',');
}

describe('buildRun の --mcp-config', () => {
  it('flontier 工程の起動は steering 用のツールを公開しない', () => {
    expect(exposedToolsOf('stroke')).toEqual([
      'get-guide',
      'get-overview',
      'get-strokes',
      'get-send-back',
      'send-question',
      'submit-document',
    ]);
    expect(exposedToolsOf('stroke')).not.toContain('get-steering-guide');
  });

  it('steering 工程の起動は flontier 専用のツールを公開しない', () => {
    expect(exposedToolsOf('steering')).toEqual(['get-steering-guide', 'get-steering', 'submit-document']);
    expect(exposedToolsOf('steering')).not.toContain('get-guide');
  });

  /**
   * **承認依頼のための本家 MCP の配線**（update-invoke-agent-responsibility-boundary design D4）。
   *
   * steering 工程は `--mcp-config` に自前 MCP と本家 spec-workflow の MCP を並べる。本家を
   * 並べる目的は承認依頼（`approvals`）だけで、生成は `kick` が P2（`POST /api/projects`）で
   * 起動前に済ませる（openspec/specs/project/generation「昇格したプロジェクトを本家に存在させる
   * のは生成の依頼だけであり、AI のプロセスではない」）。
   */
  it('steering 工程の --mcp-config に自前 MCP と本家 MCP を並べる', () => {
    const config = mcpConfigOf('steering');
    expect(Object.keys(config.mcpServers).sort()).toEqual([MCP_SERVER_NAME, UPSTREAM_MCP_SERVER_NAME].sort());
  });

  it('本家 MCP は stdio で、cwd＝昇格先を引数に、ポータルと同じ登録簿の場所を env に持つ', () => {
    const entry = mcpConfigOf('steering').mcpServers[UPSTREAM_MCP_SERVER_NAME]!;
    expect(entry.command).toBe('npx');
    expect(entry.args).toEqual(['-y', '@pimzino/spec-workflow-mcp@latest', '/tmp/share/session-1']);
    expect(entry.env).toEqual({ SPEC_WORKFLOW_HOME });
  });

  it('flontier 工程には本家 MCP を渡さない', () => {
    expect(Object.keys(mcpConfigOf('stroke').mcpServers)).toEqual([MCP_SERVER_NAME]);
    const run = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      phase: PHASE_OF.stroke,
      retries: 0,
      token: 'token-1',
    });
    const joined = [run.launch.command, ...run.launch.args].join(' ');
    expect(joined).not.toContain('spec-workflow-mcp');
    expect(joined).not.toContain('SPEC_WORKFLOW_HOME');
  });

  /**
   * 起動時の後始末（`reap-match.ts`）は argv に cwd の JSON 文字列が含まれるかで steering の
   * claude を見分ける。本家 MCP エントリの `npx` 引数にも cwd は載るが、照合はヘッダに拠る
   * ——本家の配線が変わっても照合が壊れないようにするため。サーバーはこのヘッダを読まない。
   */
  it('自前 MCP エントリのヘッダに cwd を載せる（後始末の照合の手がかり）', () => {
    for (const kind of ['stroke', 'steering'] as const) {
      expect(mcpToolServerEntryOf(kind).headers!['x-stroke-cwd']).toBe('/tmp/share/session-1');
    }
  });

  it('両工程とも自前 MCP のツールを --allowedTools に足す', () => {
    // **肯定で見る。** 否定だけだと、`--allowedTools` を丸ごと落としても
    // `indexOf` が -1 を返して別の引数を見にいき、テストが通ってしまう
    // （変異試験で確認。santa-method レビュー指摘 9周目 2026-08-31）。
    // これが落ちるということは、claude が MCP ツールを1本も呼べないということである
    for (const kind of ['stroke', 'steering'] as const) {
      expect(allowedToolsOf(kind)).toContain('mcp__stroke-board');
    }
  });

  it('submit-document は両工程で公開される', () => {
    expect(exposedToolsOf('stroke')).toContain('submit-document');
    expect(exposedToolsOf('steering')).toContain('submit-document');
  });

  it('steering 工程は --allowedTools に自前 MCP と本家の approvals だけを載せる', () => {
    const run = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      phase: 'approved',
      retries: 0,
      token: 'token-1',
    });
    // 肯定で見る。フラグが1本だけ在り、許可は自前ツール一式と本家の `approvals` の2つだけ
    expect(run.launch.args.filter(arg => arg === '--allowedTools')).toHaveLength(1);
    expect(allowedToolsOf('steering')).toEqual(['mcp__stroke-board', UPSTREAM_APPROVALS_ALLOWED_TOOL]);
  });

  it('flontier 工程には本家 MCP を許可しない（配ってもいない）', () => {
    // 肯定で見る。許可は自前ツール一式だけで、`STEERING_ALLOWED_TOOLS` が flontier 側へ
    // 渡っていれば `mcp__specworkflow__approvals` が並んでここが落ちる。`not.toContain` では
    // 要素の完全一致でしか比べず、実際の要素名（`__approvals` 付き）を見逃す
    expect(allowedToolsOf('stroke')).toEqual(['mcp__stroke-board']);
  });

  it('工程で分けるのはヘッダだけで、url と token の渡し方は変わらない', () => {
    for (const kind of ['stroke', 'steering'] as const) {
      const entry = mcpToolServerEntryOf(kind);
      expect(entry.url).toBe('http://example.test:3399/mcp');
      expect(entry.headers['x-stroke-token']).toBe('token-1');
    }
  });
});

/**
 * `buildRun` が渡す `didWork` の読み先（update-invoke-agent-responsibility-boundary design D2・D3）。
 *
 * steering は実行の終わりに本家 REST へ問い合わせ、**終了時点の本家の状態**で答える——
 * 3本の文書（`info` の `steering.documents`）と、生成中なら加えて3件の承認依頼
 * （pending の一覧の `filePath`）。起動ごとの記録は無く、MCP ツールも記録しない
 * （`docs/specs/mcp/contract.md`）。flontier は既存どおり対象の `sessionId` で数える
 * （`notifySubmission` / `submissionCount`）——ここが変わっていないことも合わせて見る。
 */
describe('buildRun の didWork', () => {
  const PROJECT = { projectId: 'PID-A', projectName: 'project-a', projectPath: '/opt/projects/project-a' };

  /** 本家の `info` の応答。3本の有無だけを試験ごとに変える */
  function info(documents: { product: boolean, tech: boolean, structure: boolean }) {
    return {
      ok: true,
      value: {
        ...PROJECT,
        steering: { exists: Object.values(documents).some(Boolean), documents },
        version: '2.2.5',
      },
    };
  }

  /** 本家の pending の承認依頼。`filePath` だけが判定に効く */
  function approval(name: string) {
    return {
      id: `approval_${name}`,
      title: `ステアリング: ${name}.md の承認`,
      filePath: `.spec-workflow/steering/${name}.md`,
      type: 'document',
      status: 'pending',
      createdAt: '2026-09-09T00:00:00.000Z',
      category: 'steering',
      categoryName: 'steering',
    };
  }

  const ALL_THREE = { product: true, tech: true, structure: true };

  function steeringRun(phase: 'approved' | 'activated') {
    return buildRun({
      sessionId: 'project-a',
      cwd: '/opt/projects/project-a',
      phase,
      retries: 0,
      runId: phase === 'activated' ? 'run-1' : undefined,
      token: 'token-1',
    });
  }

  let warn: ReturnType<typeof vi.spyOn>;

  /** false の理由がどの分岐から出たかを固定する。例外の経路で false になっても通らないように */
  function expectWarnedWith(phrase: string) {
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('steering の完成を確認できない'),
      [expect.stringContaining(phrase)],
    );
  }

  beforeEach(() => {
    upstream.listProjects.mockReset().mockResolvedValue({ ok: true, value: [PROJECT] });
    upstream.getProjectInfo.mockReset().mockResolvedValue(info(ALL_THREE));
    upstream.listPendingApprovals.mockReset().mockResolvedValue({
      ok: true,
      value: [approval('product'), approval('tech'), approval('structure')],
    });
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    forgetSubmissions('session-1');
    warn.mockRestore();
  });

  it('生成中（approved）: 3本の文書と3件の承認依頼が本家に揃っていれば作業あり', async () => {
    // **これが完成の判定そのもの**で、true なら呼び出し元が U15 を叩く
    // （add-activated-phase design D4・`ai.ts` の成功経路。U15 は判定を持たない = ADR-0014）
    const run = steeringRun('approved');

    expect(run.recordCompletion).toBeDefined();
    expect(await run.didWork!()).toBe(true);
    expect(upstream.getProjectInfo).toHaveBeenCalledWith('PID-A');
    expect(upstream.listPendingApprovals).toHaveBeenCalledWith('PID-A');
  });

  it('生成中（approved）: 承認依頼が2件しか無ければ作業なし', async () => {
    upstream.listPendingApprovals.mockResolvedValue({ ok: true, value: [approval('product'), approval('tech')] });

    expect(await steeringRun('approved').didWork!()).toBe(false);
    expectWarnedWith('承認依頼が出ていない steering 文書: structure');
  });

  it('生成中（approved）: 文書が2本しか無ければ、承認依頼を見るまでもなく作業なし', async () => {
    upstream.getProjectInfo.mockResolvedValue(info({ product: true, tech: true, structure: false }));

    expect(await steeringRun('approved').didWork!()).toBe(false);
    expect(upstream.listPendingApprovals).not.toHaveBeenCalled();
    expectWarnedWith('本家に無い steering 文書: structure');
  });

  it('生成中（approved）: 承認依頼の filePath が steering の3本と一致しなければ数えない', async () => {
    // spec の承認依頼（別の category）や、別の名前の文書は steering の3本の代わりにならない
    upstream.listPendingApprovals.mockResolvedValue({
      ok: true,
      value: [
        approval('product'),
        approval('tech'),
        { ...approval('requirements'), filePath: '.spec-workflow/specs/auth/requirements.md', category: 'spec' },
      ],
    });

    expect(await steeringRun('approved').didWork!()).toBe(false);
    expectWarnedWith('承認依頼が出ていない steering 文書: structure');
  });

  it('生成中（approved）: filePath が一致しても category が steering でなければ数えない', async () => {
    // 照合は `filePath` の形だけに依存しない。category を見るので、spec の承認依頼が
    // 同じ相対パスを持っていても steering の承認依頼の代わりにならない
    upstream.listPendingApprovals.mockResolvedValue({
      ok: true,
      value: [approval('product'), approval('tech'), { ...approval('structure'), category: 'spec' }],
    });

    expect(await steeringRun('approved').didWork!()).toBe(false);
    expectWarnedWith('承認依頼が出ていない steering 文書: structure');
  });

  it('生成中（approved）: 承認依頼が1件も無ければ作業なし（終了前にユーザーが承認を済ませていた・文書だけ揃えて終わった）', async () => {
    // 本家の一覧は pending だけを返す。承認済みで消えていても、承認依頼を出さずに終わって
    // いても、ここからは区別できず、どちらも `failed` に倒して起動し直す（design D3 の既知の制約）
    upstream.listPendingApprovals.mockResolvedValue({ ok: true, value: [] });

    expect(await steeringRun('approved').didWork!()).toBe(false);
    expectWarnedWith('承認依頼が出ていない steering 文書: product, tech, structure');
  });

  it('本家の info の形が違えば作業なし（確かめられないものを完成と扱わない）', async () => {
    upstream.getProjectInfo.mockResolvedValue({
      ok: false,
      failure: { kind: 'malformed', path: '/api/projects/PID-A/info', reason: 'steering が無い' },
    });

    expect(await steeringRun('approved').didWork!()).toBe(false);
    expect(upstream.listPendingApprovals).not.toHaveBeenCalled();
    // 例外の経路ではなく、info の失敗の分岐から false になっている。理由に本家の種別と reason が残る
    expectWarnedWith('本家の info を取れない: malformed（steering が無い）');
  });

  it('1回の判定で本家へ問い合わせるのは各 1 回だけ（定期の呼び出しではない）', async () => {
    // openspec/specs/upstream-connection「invoke-agent の終了時の1度の確認」。判定は
    // 実行の終わりに1回だけ本家を見る。同じ endpoint を繰り返し叩かない
    expect(await steeringRun('approved').didWork!()).toBe(true);

    expect(upstream.listProjects).toHaveBeenCalledTimes(1);
    expect(upstream.getProjectInfo).toHaveBeenCalledTimes(1);
    expect(upstream.listPendingApprovals).toHaveBeenCalledTimes(1);
  });

  it('完成済み（activated）: 3本の文書が在れば、承認依頼が無くても作業あり', async () => {
    // 承認依頼は既に承認されて pending から消えていてよい（design D3）。U15 も叩かない
    upstream.listPendingApprovals.mockResolvedValue({ ok: true, value: [] });
    const run = steeringRun('activated');

    expect(run.recordCompletion).toBeUndefined();
    expect(await run.didWork!()).toBe(true);
    expect(upstream.listPendingApprovals).not.toHaveBeenCalled();
  });

  it('完成済み（activated）: 文書が欠けていれば作業なし', async () => {
    upstream.getProjectInfo.mockResolvedValue(info({ product: true, tech: false, structure: true }));

    expect(await steeringRun('activated').didWork!()).toBe(false);
    expectWarnedWith('本家に無い steering 文書: tech');
  });

  it('本家の一覧に対象のプロジェクトが無ければ作業なし（projectId を解決できない）', async () => {
    upstream.listProjects.mockResolvedValue({ ok: true, value: [] });

    expect(await steeringRun('approved').didWork!()).toBe(false);
    expect(upstream.getProjectInfo).not.toHaveBeenCalled();
    expectWarnedWith('projectId を解決できない');
  });

  it('本家に届かなければ作業なし（確かめられないものを完成と扱わない）', async () => {
    // 3つの問い合わせのそれぞれで、例外の経路ではなくその段の分岐から false になることを固定する
    upstream.listProjects.mockResolvedValue({ ok: false, failure: { kind: 'unreachable', path: '/api/projects/list', reason: 'ECONNREFUSED' } });
    expect(await steeringRun('approved').didWork!()).toBe(false);
    expectWarnedWith('projectId を解決できない');

    upstream.listProjects.mockResolvedValue({ ok: true, value: [PROJECT] });
    upstream.getProjectInfo.mockResolvedValue({ ok: false, failure: { kind: 'unreachable', path: '/api/projects/PID-A/info', reason: 'ECONNREFUSED' } });
    expect(await steeringRun('approved').didWork!()).toBe(false);
    expectWarnedWith('本家の info を取れない: unreachable（ECONNREFUSED）');

    upstream.getProjectInfo.mockResolvedValue(info(ALL_THREE));
    upstream.listPendingApprovals.mockResolvedValue({ ok: false, failure: { kind: 'not-configured' } });
    expect(await steeringRun('approved').didWork!()).toBe(false);
    expectWarnedWith('本家の承認依頼の一覧を取れない: not-configured');

    expect(warn).not.toHaveBeenCalledWith(expect.anything(), [expect.stringContaining('本家への問い合わせで例外')]);
  });

  it('本家への問い合わせが例外で落ちても throw せず作業なし', async () => {
    // ここが投げると `runBuiltInvocation` の成功経路が途中で落ち、`invocation` が running のまま残る
    upstream.getProjectInfo.mockRejectedValue(new Error('fetch failed'));

    await expect(steeringRun('approved').didWork!()).resolves.toBe(false);
    expectWarnedWith('本家への問い合わせで例外: fetch failed');
  });

  it('flontier の起動は対象の sessionId で数える（変わっていない）', async () => {
    const run = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      phase: 'stroking',
      retries: 0,
      token: 'token-1',
    });

    expect(run.didWork).toBeDefined();
    expect(await run.didWork!()).toBe(false);

    notifySubmission('session-1');
    expect(await run.didWork!()).toBe(true);

    // flontier は本家に問い合わせない
    expect(upstream.listProjects).not.toHaveBeenCalled();
  });
});

/**
 * phase から導くもの（add-activated-phase design D4）。用途（kind）・完成の記録
 * （`recordCompletion`）・会話の続き先はすべて `invoke.ts` の1箇所で決まる。
 */
describe('buildRun の phase からの導出', () => {
  it('昇格後（approved / activated）は steering、それ以外はストローク', () => {
    expect(kindOf('stroking')).toBe('stroke');
    expect(kindOf('proposed')).toBe('stroke');
    expect(kindOf('approved')).toBe('steering');
    expect(kindOf('activated')).toBe('steering');
  });

  it('生成中（approved）の steering だけが完成の記録を持つ', () => {
    const generating = buildRun({
      sessionId: 'project-a',
      cwd: '/opt/projects/project-a',
      phase: 'approved',
      retries: 0,
      token: 'token-1',
    });
    const completed = buildRun({
      sessionId: 'project-a',
      cwd: '/opt/projects/project-a',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
      token: 'token-1',
    });
    const stroke = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      phase: 'stroking',
      retries: 0,
      token: 'token-1',
    });

    expect(generating.recordCompletion).toBeDefined();
    expect(completed.recordCompletion).toBeUndefined();
    expect(stroke.recordCompletion).toBeUndefined();
  });

  it('完成済み（activated）の起こし直しも steering の定型で、会話の続き先を引き継ぐ', async () => {
    const run = buildRun({
      sessionId: 'project-a',
      cwd: '/opt/projects/project-a',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
      token: 'token-1',
    });

    expect(run.prompts).toEqual({ first: 'steering', continue: 'steering' });
    expect(run.conversationId).toBe('run-1');
    expect(await run.hasConversation()).toBe(true);
  });

  it('完成の記録は U15 を叩き、2xx なら true・それ以外は false', async () => {
    $fetch.mockReset();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const run = buildRun({
        sessionId: 'project-a',
        cwd: '/opt/projects/project-a',
        phase: 'approved',
        retries: 0,
        token: 'token-1',
      });

      $fetch.mockResolvedValueOnce(undefined);
      expect(await run.recordCompletion!()).toBe(true);
      expect($fetch).toHaveBeenCalledWith('/api/sessions/project-a/activate', { method: 'POST' });

      // 409（局面が違う）も不達も「記録できていない」
      $fetch.mockRejectedValueOnce(Object.assign(new Error('まだ昇格していない'), { statusCode: 409 }));
      expect(await run.recordCompletion!()).toBe(false);
      $fetch.mockRejectedValueOnce(new Error('fetch failed'));
      expect(await run.recordCompletion!()).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('U15 に断られても、既に完成が記録されていれば受理と同じに扱う', async () => {
    // 起動後に別の書き手（起動時の書き上げ）が activated を書いた。U15 は「既に完成している」で
    // 断るが、目的は果たされている。断られたら phase を読み直して決め、文言には頼らない
    $fetch.mockReset();
    store.readState.mockReset();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const run = buildRun({
        sessionId: 'project-a',
        cwd: '/opt/projects/project-a',
        phase: 'approved',
        retries: 0,
        token: 'token-1',
      });

      $fetch.mockRejectedValueOnce(Object.assign(new Error('既に完成している'), { statusCode: 409 }));
      store.readState.mockResolvedValueOnce({ phase: 'activated', projectName: 'project-a', invocation: 'running' });
      expect(await run.recordCompletion!()).toBe(true);

      // まだ approved のままなら、断られたとおり false
      $fetch.mockRejectedValueOnce(Object.assign(new Error('まだ完成していない'), { statusCode: 409 }));
      store.readState.mockResolvedValueOnce({ phase: 'approved', projectName: 'project-a', invocation: 'running' });
      expect(await run.recordCompletion!()).toBe(false);
    } finally {
      store.readState.mockReset().mockImplementation(async () => { throw new Error('no state'); });
      warn.mockRestore();
    }
  });
});

describe('kick の接続表の後始末', () => {
  beforeEach(() => {
    config.broken = false;
    ai.invokeAi.mockReset();
    ai.invokeAi.mockReturnValue({ built: Promise.resolve(), settled: Promise.resolve() });
  });

  it('実行中はエントリが残る（消すのが早すぎない）', async () => {
    let finish = (): void => {};
    ai.invokeAi.mockImplementationOnce(() => ({
      built: Promise.resolve(),
      settled: new Promise<void>((resolve) => { finish = resolve; }),
    }));

    const { settled } = kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', phase: 'stroking', retries: 0 });
    const token = issuedToken();

    // 起動が走っている間は、その token でツールを呼べなければならない
    expect(registered(token)).toEqual({ sessionId: 'session-1' });

    finish();
    await settled;
    expect(registered(token)).toBeNull();
  });

  it('steering の起動は projectPath の文脈で登録される', async () => {
    let finish = (): void => {};
    ai.invokeAi.mockImplementationOnce(() => ({
      built: Promise.resolve(),
      settled: new Promise<void>((resolve) => { finish = resolve; }),
    }));

    const { settled } = kick({ sessionId: 'project-a', cwd: '/opt/projects/project-a', phase: 'approved', retries: 0 });
    const token = issuedToken();

    expect(registered(token)).toEqual({ projectPath: '/opt/projects/project-a' });

    finish();
    await settled;
    expect(registered(token)).toBeNull();
  });

  it('正常終了でエントリが消える', async () => {
    const { settled } = kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', phase: 'stroking', retries: 0 });
    await settled;

    expect(registered(issuedToken())).toBeNull();
  });

  it('異常終了（settled の reject）でもエントリが消える', async () => {
    ai.invokeAi.mockReturnValueOnce({ built: Promise.resolve(), settled: Promise.reject(new Error('起動できない')) });

    const { settled } = kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', phase: 'stroking', retries: 0 });
    await expect(settled).rejects.toThrow('起動できない');
    expect(registered(issuedToken())).toBeNull();
  });

  /**
   * 組み立てに失敗しても（fix-idle-stuck-on-run-build-failure）、`kick` の役割は変わらない
   * ——token の登録・削除は `settled` に紐づき、`built` が失敗を運ぶ。組み立てそのものが
   * `failed`/`error` をどう書き分けるかは `invokeAi` の中（`ai.test.ts`）で見る。
   */
  it('組み立てに失敗しても、記録を書き終えたところ（settled）でエントリが消える', async () => {
    ai.invokeAi.mockReturnValueOnce({
      built: Promise.reject(new Error('設定を読めない')),
      // invokeAi は組み立て失敗の記録を書き終えると settled を resolve する（reject しない）
      settled: Promise.resolve(),
    });

    const { built, settled } = kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', phase: 'stroking', retries: 0 });
    const token = issuedToken();

    await expect(built).rejects.toThrow('設定を読めない');
    await settled;
    expect(registered(token)).toBeNull();
  });

  it('kick は組み立て方（build）を invokeAi へ渡すだけで、自分では呼ばない', async () => {
    config.broken = true;
    let capturedBuild: (() => unknown) | undefined;
    ai.invokeAi.mockImplementationOnce((_sessionId, _retries, build) => {
      capturedBuild = build;
      return { built: Promise.resolve(), settled: Promise.resolve() };
    });

    // config.broken の下でも kick 自体は同期的に throw しない
    expect(() => kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', phase: 'stroking', retries: 0 }))
      .not.toThrow();

    // 渡された組み立て方を呼べば、buildRun と同じ理由で失敗する
    expect(capturedBuild).toBeDefined();
    await expect(capturedBuild!()).rejects.toThrow('設定を読めない');
  });
});

/**
 * 生成の依頼（update-project-generation-via-upstream-rest design D2）。
 *
 * steering の起動は、材料を組み立てる中で **AI を起動する前に** P2（`POST /api/projects`）へ
 * cwd を依頼する。受理されなければ材料を返さず reject し、`invokeAi` が「起動の材料を
 * 組み立てられない」として記録する（`ai.test.ts`）。初回か継続かを問わず毎回依頼する
 * （本家の登録は dashboard の再起動で消えるため）。
 */
describe('kick の組み立て方（build）が生成を依頼する', () => {
  /** `kick` が invokeAi へ渡した組み立て方を捕まえる */
  function captureBuild(options: Parameters<typeof kick>[0]): () => Promise<unknown> {
    let captured: (() => unknown) | undefined;
    ai.invokeAi.mockImplementationOnce((_sessionId, _retries, build) => {
      captured = build;
      return { built: Promise.resolve(), settled: Promise.resolve() };
    });
    kick(options);
    expect(captured).toBeDefined();
    return captured as () => Promise<unknown>;
  }

  beforeEach(() => {
    config.broken = false;
    ai.invokeAi.mockReset();
    $fetch.mockReset();
    $fetch.mockResolvedValue(undefined);
  });

  it('steering: /api/projects へ cwd を POST してから材料を返す', async () => {
    const build = captureBuild({ sessionId: 'project-a', cwd: '/opt/projects/project-a', phase: 'approved', retries: 0 });

    const run = await build() as { cwd: string };

    expect($fetch).toHaveBeenCalledTimes(1);
    expect($fetch).toHaveBeenCalledWith('/api/projects', { method: 'POST', body: { projectPath: '/opt/projects/project-a' } });
    expect(run.cwd).toBe('/opt/projects/project-a');
  });

  it('steering: 続きの起動（runId あり）でも毎回依頼する', async () => {
    const build = captureBuild({
      sessionId: 'project-a', cwd: '/opt/projects/project-a', phase: 'activated', retries: 1, runId: 'run-1',
    });

    await build();

    expect($fetch).toHaveBeenCalledWith('/api/projects', { method: 'POST', body: { projectPath: '/opt/projects/project-a' } });
  });

  it('steering: 依頼が受理されなければ材料を返さず reject する', async () => {
    $fetch.mockRejectedValueOnce(Object.assign(new Error('本家に繋がらない'), { statusCode: 503 }));
    const build = captureBuild({ sessionId: 'project-a', cwd: '/opt/projects/project-a', phase: 'approved', retries: 0 });

    await expect(build()).rejects.toThrow('本家に繋がらない');
  });

  it('stroke: 生成を依頼しない', async () => {
    const build = captureBuild({ sessionId: 'session-1', cwd: '/tmp/share/session-1', phase: 'stroking', retries: 0 });

    await build();

    expect($fetch).not.toHaveBeenCalled();
  });
});
