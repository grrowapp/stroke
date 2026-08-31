import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MCP_SERVER_NAME } from '../../../../server/utils/mcp/allowed-tools';
import { resolveConnection, type ConnectionContext } from '../../../../server/utils/mcp/connection-table';
import { MCP_TOOLS_HEADER } from '../../../../server/utils/mcp/exposed-tools';

/**
 * 起動が組み立てる `--mcp-config`（provide-operations-via-mcp）。見るのは、工程ごとに
 * 公開ツールが絞られること——自前 MCP サーバーは6ツールすべてを単一の `/mcp` に登録するので、
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
        apiBaseUrl: 'http://example.test:3399',
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

/** 実行そのものは差し替える。見たいのは `kick` の前後の後始末だけである */
const ai = vi.hoisted(() => ({ invokeAi: vi.fn<(sessionId: string, run: unknown) => Promise<void>>() }));

vi.mock('../../../../server/utils/stroke/ai', () => ({ invokeAi: ai.invokeAi }));

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

const { buildRun, kick } = await import('../../../../server/utils/stroke/invoke');

type McpConfig = {
  mcpServers: Record<string, { url: string, headers: Record<string, string> }>,
};

/** 起動 args から `--mcp-config` の JSON を取り出し、自前 MCP サーバーのエントリを返す。 */
function mcpToolServerEntryOf(kind: 'stroke' | 'steering') {
  const run = buildRun({
    sessionId: 'session-1',
    cwd: '/tmp/share/session-1',
    kind,
    retries: 0,
    token: 'token-1',
  });
  const at = run.launch.args.indexOf('--mcp-config');
  expect(at).not.toBe(-1);

  const config = JSON.parse(run.launch.args[at + 1]!) as McpConfig;
  return config.mcpServers[MCP_SERVER_NAME]!;
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

  it('submit-document は両工程で公開される', () => {
    expect(exposedToolsOf('stroke')).toContain('submit-document');
    expect(exposedToolsOf('steering')).toContain('submit-document');
  });

  it('steering 工程は本家 MCP も --allowedTools に載せる（配るだけで呼べない状態にしない）', () => {
    const run = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      kind: 'steering',
      retries: 0,
      token: 'token-1',
    });
    const at = run.launch.args.indexOf('--allowedTools');
    const value = run.launch.args[at + 1]!;

    expect(value.split(' ')).toContain('mcp__specworkflow');
    expect(value.split(' ')).toContain('mcp__stroke-board');
    expect(run.launch.args.filter(arg => arg === '--allowedTools')).toHaveLength(1);

    // 本家 MCP は `--mcp-config` の mcpServers にも同じ名前で並ぶ（名前がずれると許可が効かない）
    const configAt = run.launch.args.indexOf('--mcp-config');
    const config = JSON.parse(run.launch.args[configAt + 1]!) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(config.mcpServers)).toContain('specworkflow');
  });

  it('flontier 工程には本家 MCP を許可しない（配ってもいない）', () => {
    const run = buildRun({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      kind: 'stroke',
      retries: 0,
      token: 'token-1',
    });
    const at = run.launch.args.indexOf('--allowedTools');

    expect(run.launch.args[at + 1]!.split(' ')).not.toContain('mcp__specworkflow');
  });

  it('工程で分けるのはヘッダだけで、url と token の渡し方は変わらない', () => {
    for (const kind of ['stroke', 'steering'] as const) {
      const entry = mcpToolServerEntryOf(kind);
      expect(entry.url).toBe('http://example.test:3399/mcp');
      expect(entry.headers['x-stroke-token']).toBe('token-1');
    }
  });
});

describe('kick の接続表の後始末', () => {
  beforeEach(() => {
    config.broken = false;
    ai.invokeAi.mockReset();
    ai.invokeAi.mockResolvedValue(undefined);
  });

  it('実行中はエントリが残る（消すのが早すぎない）', async () => {
    let finish = (): void => {};
    ai.invokeAi.mockImplementationOnce(async () => await new Promise<void>((resolve) => { finish = resolve; }));

    const running = kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', kind: 'stroke', retries: 0 });
    const token = issuedToken();

    // 起動が走っている間は、その token でツールを呼べなければならない
    expect(registered(token)).toEqual({ sessionId: 'session-1' });

    finish();
    await running;
    expect(registered(token)).toBeNull();
  });

  it('steering の起動は projectPath の文脈で登録される', async () => {
    let finish = (): void => {};
    ai.invokeAi.mockImplementationOnce(async () => await new Promise<void>((resolve) => { finish = resolve; }));

    const running = kick({ sessionId: 'project-a', cwd: '/opt/projects/project-a', kind: 'steering', retries: 0 });
    const token = issuedToken();

    expect(registered(token)).toEqual({ projectPath: '/opt/projects/project-a' });

    finish();
    await running;
    expect(registered(token)).toBeNull();
  });

  it('正常終了でエントリが消える', async () => {
    await kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', kind: 'stroke', retries: 0 });

    expect(registered(issuedToken())).toBeNull();
  });

  it('異常終了（invokeAi の reject）でもエントリが消える', async () => {
    ai.invokeAi.mockRejectedValueOnce(new Error('起動できない'));

    await expect(kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', kind: 'stroke', retries: 0 }))
      .rejects.toThrow('起動できない');
    expect(registered(issuedToken())).toBeNull();
  });

  it('buildRun が同期的に throw してもエントリが消え、reject した promise が返る', async () => {
    config.broken = true;

    // 素の throw ではなく reject で返る（呼び出し元の `.catch()/.finally()` が付く）
    const kicked = kick({ sessionId: 'session-1', cwd: '/tmp/share/session-1', kind: 'stroke', retries: 0 });
    const token = issuedToken();

    await expect(kicked).rejects.toThrow('設定を読めない');
    expect(ai.invokeAi).not.toHaveBeenCalled();
    expect(registered(token)).toBeNull();
  });
});
