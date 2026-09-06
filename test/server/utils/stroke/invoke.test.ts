import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MCP_SERVER_NAME } from '../../../../server/utils/mcp/allowed-tools';
import { resolveConnection, type ConnectionContext } from '../../../../server/utils/mcp/connection-table';
import { MCP_TOOLS_HEADER } from '../../../../server/utils/mcp/exposed-tools';

/**
 * 起動が組み立てる `--mcp-config`（provide-operations-via-mcp）。見るのは、工程ごとに
 * 公開ツールが絞られること——自前 MCP サーバーはツールを1本残らず単一の `/mcp` に登録するので、
 * 絞らないと flontier の claude にも steering 専用のツールが見え、呼ばれて失敗する。
 *
 * あわせて `kick` の後始末（接続表への登録 → 実行終了で削除）も見る。token が消え残ると、
 * 終わった起動の token でツールを呼べてしまう（specs `server/session-management`
 * 「実行の終了（正常・異常とも）で無効になる」）。
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
 * ポータル側の設定。`readServerConfig` は `useRuntimeConfig()` を通るので、Nitro の外では
 * 解決できない。ここで見たいのは**その値が本家 MCP の `env` に載ること**だけである
 */
vi.mock('../../../../server/utils/config', () => ({
  readServerConfig: () => ({
    upstreamBaseUrl: 'http://example.test:5000',
    projectsParentPath: '/tmp/share',
    specWorkflowHome: '/tmp/share/.spec-workflow-mcp',
    syncIntervalMs: 30000,
  }),
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
const {
  notifySubmission,
  forgetSubmissions,
  recordLaunchSubmission,
  hasLaunchSubmission,
  forgetLaunchSubmission,
} = await import('../../../../server/utils/stroke/submission-signal');

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

  it('本家 MCP に SPEC_WORKFLOW_HOME を渡す（渡さないと steering 工程が成立しない）', () => {
    // 本家 MCP は起動時に「動いているプロジェクト」の登録簿へ自分を書き、dashboard の
    // 一覧はその登録簿を読む。場所を決めるのがこの環境変数で、未設定だと既定の
    // `~/.spec-workflow-mcp` へ書く。**書き手と読み手が別の登録簿を見ていた**ので、
    // 昇格したてのプロジェクトは一覧に現れず `project_not_registered` が返り続けていた
    // （実測 2026-08-31）
    const upstream = mcpConfigOf('steering').mcpServers['specworkflow']!;

    expect(upstream.env).toEqual({ SPEC_WORKFLOW_HOME: '/tmp/share/.spec-workflow-mcp' });
    // ポータルが読む値と同じ1つを使う。ここで別の解決規則を書くとまた割れる
    expect(upstream.args).toEqual(['-y', '@pimzino/spec-workflow-mcp@latest', '/tmp/share/session-1']);
  });

  it('flontier 工程には本家 MCP を渡さない', () => {
    expect(Object.keys(mcpConfigOf('stroke').mcpServers)).toEqual([MCP_SERVER_NAME]);
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

  it('steering 工程は --allowedTools に自前 MCP だけを載せ、本家 MCP は載せない（配線とは別）', () => {
    const run = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      phase: 'approved',
      retries: 0,
      token: 'token-1',
    });
    // 肯定で見る。フラグが1本だけ在り、自前ツールは載っている
    expect(run.launch.args.filter(arg => arg === '--allowedTools')).toHaveLength(1);
    expect(allowedToolsOf('steering')).toContain('mcp__stroke-board');
    // その上で、本家 MCP は載っていないことを見る
    expect(allowedToolsOf('steering')).not.toContain('mcp__specworkflow');

    // 本家 MCP は `--mcp-config` の mcpServers には引き続き並ぶ（配線は続けるため）。
    // 許可（--allowedTools）と配線（--mcp-config）が別であることが、テストの上でも読める
    const configAt = run.launch.args.indexOf('--mcp-config');
    const config = JSON.parse(run.launch.args[configAt + 1]!) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(config.mcpServers)).toContain('specworkflow');
  });

  it('flontier 工程には本家 MCP を許可しない（配ってもいない）', () => {
    // `allowedToolsOf` はフラグが無ければ空を返すので、フラグごと落ちたときに
    // 別の引数を見にいって否定が通ってしまうことがない
    expect(allowedToolsOf('stroke')).not.toContain('mcp__specworkflow');
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
 * `buildRun` が渡す `didWork` の読み先（fix-steering-empty-completion）。
 *
 * steering は本家 REST へ直接届くため対象の id に結びつける経路が無く、この起動の
 * token を単位にした記録（`submission-signal.ts` の `recordLaunchSubmission` /
 * `hasLaunchSubmission`）を読む。flontier は既存どおり対象の `sessionId` で数える
 * （`notifySubmission` / `submissionCount`）——ここが変わっていないことも合わせて見る。
 */
describe('buildRun の didWork', () => {
  afterEach(() => {
    forgetSubmissions('session-1');
    forgetLaunchSubmission('token-1');
    forgetLaunchSubmission('token-2');
  });

  it('完成済み（activated）の steering も起動単位の記録を読む', () => {
    // 生成中（approved）でも完成済みでも、`didWork` は同じ起動単位の記録を読む。
    // 生成中では**これが完成の判定そのもの**で、false なら U15 を叩かずに `failed` に倒れる
    // （add-activated-phase design D4・`ai.ts` の成功経路。U15 は判定を持たない = ADR-0014）
    const run = buildRun({
      sessionId: 'project-a',
      cwd: '/opt/projects/project-a',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
      token: 'token-1',
    });

    expect(run.recordCompletion).toBeUndefined();
    expect(run.didWork).toBeDefined();
    expect(run.didWork!()).toBe(false);

    recordLaunchSubmission('token-1');
    expect(run.didWork!()).toBe(true);
  });

  it('別の起動（token）の受理は自分の作業にならない', () => {
    // 起動単位で数える理由そのもの（design.md D1「起動をまたいだ持ち越しが構造的に
    // 起こらない」）。同じ対象の別の起動が受理していても、この起動は空振りのままである
    const run = buildRun({
      sessionId: 'project-a',
      cwd: '/opt/projects/project-a',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
      token: 'token-1',
    });

    recordLaunchSubmission('token-2');
    expect(run.didWork!()).toBe(false);

    recordLaunchSubmission('token-1');
    expect(run.didWork!()).toBe(true);
  });

  it('steering の起動は起動単位（token）の提出記録を読む', () => {
    const run = buildRun({
      sessionId: 'project-a',
      cwd: '/opt/projects/project-a',
      phase: 'approved',
      retries: 0,
      token: 'token-1',
    });

    expect(run.didWork).toBeDefined();
    // まだ何も受理されていない起動では false
    expect(run.didWork!()).toBe(false);

    // submit-document の steering 分岐が受理したときと同じ記録
    recordLaunchSubmission('token-1');
    expect(run.didWork!()).toBe(true);
  });

  it('flontier の起動は対象の sessionId で数える（変わっていない）', () => {
    const run = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      phase: 'stroking',
      retries: 0,
      token: 'token-1',
    });

    expect(run.didWork).toBeDefined();
    expect(run.didWork!()).toBe(false);

    // steering 用の起動単位の記録（token）を足しても flontier 側は反応しない
    // ——2つのキーが混ざっていないことの裏返しの確認
    recordLaunchSubmission('token-1');
    expect(run.didWork!()).toBe(false);

    notifySubmission('session-1');
    expect(run.didWork!()).toBe(true);
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

  it('実行が終わると起動単位の提出記録も片付く（次の起動が前の起動の提出を数えない）', async () => {
    const { settled } = kick({ sessionId: 'project-a', cwd: '/opt/projects/project-a', phase: 'approved', retries: 0 });
    const token = issuedToken();

    // submit-document の steering 分岐が受理を記録した状況をシミュレートする
    recordLaunchSubmission(token);
    expect(hasLaunchSubmission(token)).toBe(true);

    await settled;

    // removeConnection(token) と同じ .finally で捨てる（design.md D1）
    expect(hasLaunchSubmission(token)).toBe(false);
  });

  it('kick は組み立て方（build）を invokeAi へ渡すだけで、自分では呼ばない', () => {
    config.broken = true;
    let capturedBuild: (() => unknown) | undefined;
    ai.invokeAi.mockImplementationOnce((_sessionId, _retries, build) => {
      capturedBuild = build;
      return { built: Promise.resolve(), settled: Promise.resolve() };
    });

    // config.broken の下でも kick 自体は同期的に throw しない
    expect(() => kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', phase: 'stroking', retries: 0 }))
      .not.toThrow();

    // 渡された組み立て方を呼べば、buildRun と同じ理由で同期的に throw する
    expect(capturedBuild).toBeDefined();
    expect(() => capturedBuild!()).toThrow('設定を読めない');
  });
});
