import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isOwnLaunch, matchesTarget } from '../../../../server/utils/stroke/reap-match'

/**
 * 「自分が起こした claude か」「どの対象の実行か」の argv 照合
 * （`fix-orphan-run-on-restart` design.md Decision 1・Decision 2）。
 *
 * 前半は純粋な文字列照合の単体テスト。後半（tasks 1.4）は、実際の組み立て
 * （`invoke.ts` の `buildRun` + `claude.ts` の `runClaude` が足す `--session-id` /
 * `--resume`）と照合が**同じ事実を見ていること**を、`node` を claude の代わりに実際に
 * 起こして確かめる——`claude.test.ts` と同じ手口（本物の `claude` は起動しない）。
 */

describe('isOwnLaunch（単体）', () => {
  it('--mcp-config の url に自分の apiBaseUrl が載っていれば true', () => {
    const argv = 'claude -p --mcp-config {"mcpServers":{"stroke-board":{"type":"http","url":"http://localhost:3599/mcp","headers":{}}}}'
    expect(isOwnLaunch(argv, 'http://localhost:3599')).toBe(true)
  })

  it('別インスタンスの apiBaseUrl（ポート違い）では false', () => {
    const argv = 'claude -p --mcp-config {"mcpServers":{"stroke-board":{"type":"http","url":"http://localhost:3599/mcp","headers":{}}}}'
    expect(isOwnLaunch(argv, 'http://localhost:3399')).toBe(false)
  })
})

describe('matchesTarget（単体）', () => {
  it('stroke: --session-id に会話 id が載っていれば true（初回）', () => {
    expect(matchesTarget('claude -p --session-id abc-123 --', { kind: 'stroke', sessionId: 'abc-123' })).toBe(true)
  })

  it('stroke: --resume に会話 id が載っていれば true（継続）', () => {
    expect(matchesTarget('claude -p --resume abc-123 --', { kind: 'stroke', sessionId: 'abc-123' })).toBe(true)
  })

  it('stroke: 別の会話 id では false', () => {
    expect(matchesTarget('claude -p --session-id abc-123 --', { kind: 'stroke', sessionId: 'xyz-999' })).toBe(false)
  })

  it('steering: cwd が --mcp-config の npx args に載っていれば true（初回・runId 無し）', () => {
    const argv = 'claude -p --mcp-config {"mcpServers":{"specworkflow":{"command":"npx","args":["-y","@pimzino/spec-workflow-mcp@latest","/opt/projects/my-project"]}}}'
    expect(matchesTarget(argv, { kind: 'steering', cwd: '/opt/projects/my-project' })).toBe(true)
  })

  it('steering: 別の cwd では false', () => {
    const argv = 'claude -p --mcp-config {"mcpServers":{"specworkflow":{"args":["-y","x","/opt/projects/my-project"]}}}'
    expect(matchesTarget(argv, { kind: 'steering', cwd: '/opt/projects/other-project' })).toBe(false)
  })

  it('steering: runId が渡されていれば --resume でも一致する', () => {
    expect(matchesTarget('claude -p --resume run-id-1 --', { kind: 'steering', cwd: '/nope', runId: 'run-id-1' })).toBe(true)
  })
})

/**
 * 実際の組み立てとの一致（tasks 1.4）。`claude.command` を `node` に差し替え、
 * `runClaude` に実際に起こさせた子プロセスへ、自分の `process.argv`（buildRun が組んだ
 * `--mcp-config` などが `-p` 以降として付いてくる）をファイルへ書かせて拾う。
 */

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({
    projectShareRoot: '/tmp/share',
    claude: {
      command: 'node',
      args: ['--setting-sources', 'project'],
      apiBaseUrl: 'http://example.test:3599',
      workflowSchema: 'flontier-strokeflow',
      firstPrompt: 'first',
      continuePrompt: 'continue',
      steeringPrompt: 'steering',
      maxRetries: 2,
      timeoutMs: 30000,
      timeoutStepMs: 0,
      debugLogDir: '',
    },
    openspec: { bin: 'openspec', initArgs: 'init --yes' },
    wsPathPattern: '/ws/{channel}',
  }),
}))

vi.mock('../../../../server/utils/config', () => ({
  readServerConfig: () => ({
    upstreamBaseUrl: 'http://example.test:5000',
    projectsParentPath: '/tmp/share',
    specWorkflowHome: '/tmp/share/.spec-workflow-mcp',
    syncIntervalMs: 30000,
  }),
}))

const { buildRun } = await import('../../../../server/utils/stroke/invoke')
const { runClaude } = await import('../../../../server/utils/stroke/claude')

const OWN_API_BASE_URL = 'http://example.test:3599'
const FOREIGN_API_BASE_URL = 'http://example.test:3399'
const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const ENVELOPE = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: SESSION_ID })

/** `node -e` に、自分が受け取った引数（`-p` 以降）をファイルへ書かせてから成功で終える。 */
function captureArgvScript(outFile: string): string {
  return `require('fs').writeFileSync(${JSON.stringify(outFile)}, process.argv.slice(1).join(' '));`
    + `process.stdout.write(${JSON.stringify(ENVELOPE)})`
}

const cleanups: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'reap-match-'))
  cleanups.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('組み立て（buildRun + runClaude）と照合の一致', () => {
  it('stroke: 初回起動（--session-id）の argv を自分・この会話として照合できる', async () => {
    const dir = await tempDir()
    const outFile = join(dir, 'argv.txt')

    const run = buildRun({ sessionId: SESSION_ID, cwd: dir, kind: 'stroke', retries: 0, token: 'token-1' })
    const launch = { command: 'node', args: ['-e', captureArgvScript(outFile), '--', ...run.launch.args], apiBaseUrl: run.launch.apiBaseUrl }

    const result = await runClaude({ sessionId: SESSION_ID, launch, cwd: dir, prompt: 'PROMPT', mode: 'new', timeoutMs: 30000 })
    expect(result.ok).toBe(true)

    const argv = await readFile(outFile, 'utf8')
    expect(isOwnLaunch(argv, OWN_API_BASE_URL)).toBe(true)
    expect(isOwnLaunch(argv, FOREIGN_API_BASE_URL)).toBe(false)
    expect(matchesTarget(argv, { kind: 'stroke', sessionId: SESSION_ID })).toBe(true)
    expect(matchesTarget(argv, { kind: 'stroke', sessionId: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' })).toBe(false)
  })

  it('stroke: 継続起動（--resume）の argv も照合できる', async () => {
    const dir = await tempDir()
    const outFile = join(dir, 'argv.txt')

    const run = buildRun({ sessionId: SESSION_ID, cwd: dir, kind: 'stroke', retries: 1, token: 'token-1' })
    const launch = { command: 'node', args: ['-e', captureArgvScript(outFile), '--', ...run.launch.args], apiBaseUrl: run.launch.apiBaseUrl }

    const result = await runClaude({ sessionId: SESSION_ID, launch, cwd: dir, prompt: 'PROMPT', mode: 'resume', timeoutMs: 30000 })
    expect(result.ok).toBe(true)

    const argv = await readFile(outFile, 'utf8')
    expect(argv).toContain('--resume')
    expect(matchesTarget(argv, { kind: 'stroke', sessionId: SESSION_ID })).toBe(true)
  })

  it('steering: 初回起動（runId 無し）の argv を cwd で照合できる', async () => {
    const dir = await tempDir()
    const outFile = join(dir, 'argv.txt')
    const projectDir = join(dir, 'my-project')

    const run = buildRun({ sessionId: 'my-project', cwd: projectDir, kind: 'steering', retries: 0, token: 'token-1' })
    const launch = { command: 'node', args: ['-e', captureArgvScript(outFile), '--', ...run.launch.args], apiBaseUrl: run.launch.apiBaseUrl }

    // 会話 id を渡さない初回。claude 自身が採番する（conversationId 省略と同じ）
    const result = await runClaude({ launch, cwd: dir, prompt: 'PROMPT', mode: 'new', timeoutMs: 30000 })
    expect(result.ok).toBe(true)

    const argv = await readFile(outFile, 'utf8')
    expect(isOwnLaunch(argv, OWN_API_BASE_URL)).toBe(true)
    expect(matchesTarget(argv, { kind: 'steering', cwd: projectDir })).toBe(true)
    expect(matchesTarget(argv, { kind: 'steering', cwd: join(dir, 'other-project') })).toBe(false)
  })

  it('steering: 継続起動（--resume runId）の argv も cwd で照合できる', async () => {
    const dir = await tempDir()
    const outFile = join(dir, 'argv.txt')
    const projectDir = join(dir, 'my-project')

    const run = buildRun({
      sessionId: 'my-project', cwd: projectDir, kind: 'steering', retries: 0, runId: 'run-id-1', token: 'token-1',
    })
    const launch = { command: 'node', args: ['-e', captureArgvScript(outFile), '--', ...run.launch.args], apiBaseUrl: run.launch.apiBaseUrl }

    const result = await runClaude({ sessionId: 'run-id-1', launch, cwd: dir, prompt: 'PROMPT', mode: 'resume', timeoutMs: 30000 })
    expect(result.ok).toBe(true)

    const argv = await readFile(outFile, 'utf8')
    expect(argv).toContain('--resume run-id-1')
    // cwd だけでも一致する（design.md「runId は任意入力として残す」の帰結）
    expect(matchesTarget(argv, { kind: 'steering', cwd: projectDir })).toBe(true)
    expect(matchesTarget(argv, { kind: 'steering', cwd: projectDir, runId: 'run-id-1' })).toBe(true)
  })
})
