import { describe, expect, it } from 'vitest';

import { MCP_SERVER_ALLOWED_TOOL, withMcpToolsAllowed } from '../../../../server/utils/mcp/allowed-tools';

describe('withMcpToolsAllowed', () => {
  it('既存の --allowedTools の値に追記し、指定を1本に保つ', () => {
    const args = ['--model', 'sonnet', '--allowedTools', 'Skill Bash(openspec *) Read Edit'];

    const result = withMcpToolsAllowed(args);

    expect(result).toEqual([
      '--model',
      'sonnet',
      '--allowedTools',
      `Skill Bash(openspec *) Read Edit ${MCP_SERVER_ALLOWED_TOOL}`,
    ]);
    expect(result.filter(arg => arg === '--allowedTools')).toHaveLength(1);
  });

  it('元の配列を書き換えない', () => {
    const args = ['--allowedTools', 'Read'];

    withMcpToolsAllowed(args);

    expect(args).toEqual(['--allowedTools', 'Read']);
  });

  it('--allowedTools が無ければフラグごと足す', () => {
    const result = withMcpToolsAllowed(['--model', 'sonnet']);

    expect(result).toEqual(['--model', 'sonnet', '--allowedTools', MCP_SERVER_ALLOWED_TOOL]);
  });

  it('--allowedTools が値を伴わず末尾にある場合は、フラグを増やさず値だけ足す', () => {
    const result = withMcpToolsAllowed(['--model', 'sonnet', '--allowedTools']);

    expect(result).toEqual(['--model', 'sonnet', '--allowedTools', MCP_SERVER_ALLOWED_TOOL]);
    expect(result.filter(arg => arg === '--allowedTools')).toHaveLength(1);
  });

  it('--allowedTools の次が別のフラグなら、そのフラグの値を書き換えず間に差し込む', () => {
    const result = withMcpToolsAllowed(['--allowedTools', '--disallowedTools', 'Bash(cd *)']);

    expect(result).toEqual([
      '--allowedTools',
      MCP_SERVER_ALLOWED_TOOL,
      '--disallowedTools',
      'Bash(cd *)',
    ]);
  });

  it('既に入っていれば重複させない', () => {
    const args = ['--allowedTools', `Read ${MCP_SERVER_ALLOWED_TOOL}`];

    expect(withMcpToolsAllowed(args)).toEqual(args);
  });

  it('--allowedTools が2本あれば、値をつないで1本へ畳む', () => {
    const result = withMcpToolsAllowed([
      '--allowedTools',
      'Skill Bash(openspec *)',
      '--model',
      'sonnet',
      '--allowedTools',
      'Read Edit',
    ]);

    expect(result).toEqual([
      '--allowedTools',
      `Skill Bash(openspec *) Read Edit ${MCP_SERVER_ALLOWED_TOOL}`,
      '--model',
      'sonnet',
    ]);
    expect(result.filter(arg => arg === '--allowedTools')).toHaveLength(1);
  });

  it('2本目に値が無くても1本へ畳む', () => {
    const result = withMcpToolsAllowed(['--allowedTools', 'Read', '--allowedTools']);

    expect(result).toEqual(['--allowedTools', `Read ${MCP_SERVER_ALLOWED_TOOL}`]);
    expect(result.filter(arg => arg === '--allowedTools')).toHaveLength(1);
  });

  it('2本のどちらかに既に入っていれば重複させない', () => {
    const result = withMcpToolsAllowed([
      '--allowedTools',
      MCP_SERVER_ALLOWED_TOOL,
      '--allowedTools',
      'Read',
    ]);

    expect(result).toEqual(['--allowedTools', `${MCP_SERVER_ALLOWED_TOOL} Read`]);
    expect(result.filter(arg => arg === '--allowedTools')).toHaveLength(1);
  });

  it('--allowedTools=<値> の連結形も検出し、分離形1本へ畳む', () => {
    const result = withMcpToolsAllowed(['--model', 'sonnet', '--allowedTools=Skill Bash(openspec *) Read']);

    expect(result).toEqual([
      '--model',
      'sonnet',
      '--allowedTools',
      `Skill Bash(openspec *) Read ${MCP_SERVER_ALLOWED_TOOL}`,
    ]);
    expect(result.filter(arg => arg.startsWith('--allowedTools'))).toHaveLength(1);
  });

  it('連結形と分離形が混在していても1本へ畳む', () => {
    const result = withMcpToolsAllowed([
      '--allowedTools=Skill',
      '--model',
      'sonnet',
      '--allowedTools',
      'Read Edit',
    ]);

    expect(result).toEqual([
      '--allowedTools',
      `Skill Read Edit ${MCP_SERVER_ALLOWED_TOOL}`,
      '--model',
      'sonnet',
    ]);
    expect(result.filter(arg => arg.startsWith('--allowedTools'))).toHaveLength(1);
  });

  it('2本とも連結形でも1本へ畳む', () => {
    const result = withMcpToolsAllowed(['--allowedTools=Skill', '--allowedTools=Read']);

    expect(result).toEqual(['--allowedTools', `Skill Read ${MCP_SERVER_ALLOWED_TOOL}`]);
    expect(result.filter(arg => arg.startsWith('--allowedTools'))).toHaveLength(1);
  });

  it('連結形に既に入っていれば重複させない', () => {
    const result = withMcpToolsAllowed([`--allowedTools=Read ${MCP_SERVER_ALLOWED_TOOL}`]);

    expect(result).toEqual(['--allowedTools', `Read ${MCP_SERVER_ALLOWED_TOOL}`]);
  });

  it('連結形の値が空でも、フラグを増やさず値だけ足す', () => {
    const result = withMcpToolsAllowed(['--allowedTools=']);

    expect(result).toEqual(['--allowedTools', MCP_SERVER_ALLOWED_TOOL]);
    expect(result.filter(arg => arg.startsWith('--allowedTools'))).toHaveLength(1);
  });

  it('連結形の次の引数は別フラグの値なので書き換えない', () => {
    const result = withMcpToolsAllowed(['--allowedTools=Read', '--model', 'sonnet']);

    expect(result).toEqual([
      '--allowedTools',
      `Read ${MCP_SERVER_ALLOWED_TOOL}`,
      '--model',
      'sonnet',
    ]);
  });

  it('部分一致では入っていると判定しない', () => {
    const result = withMcpToolsAllowed(['--allowedTools', `${MCP_SERVER_ALLOWED_TOOL}__get-overview`]);

    expect(result).toEqual([
      '--allowedTools',
      `${MCP_SERVER_ALLOWED_TOOL}__get-overview ${MCP_SERVER_ALLOWED_TOOL}`,
    ]);
  });
});
