import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exposedToolsHeaderValue } from '../../../../server/utils/mcp/exposed-tools';

/**
 * 工程ごとの公開ツールの一覧（`x-mcp-tools` の値）。
 *
 * モジュールは一覧に無い名前が1つでもあると 400 を返すので、名前が
 * `server/mcp/tools/` の実体と揃っていることまで見る。
 */

const TOOLS_DIR = join(import.meta.dirname, '../../../../server/mcp/tools');

function toolsOf(phase: 'flontier' | 'steering'): string[] {
  return exposedToolsHeaderValue(phase).split(',');
}

describe('exposedToolsHeaderValue', () => {
  it('flontier 工程は steering 専用のツールを公開しない', () => {
    expect(toolsOf('flontier')).toEqual([
      'get-overview',
      'get-strokes',
      'get-send-back',
      'send-question',
      'submit-document',
    ]);
    expect(toolsOf('flontier')).not.toContain('get-steering');
  });

  it('steering 工程は flontier 専用のツールを公開しない', () => {
    expect(toolsOf('steering')).toEqual(['get-steering', 'submit-document']);
    for (const tool of ['get-overview', 'get-strokes', 'get-send-back', 'send-question']) {
      expect(toolsOf('steering')).not.toContain(tool);
    }
  });

  it('submit-document は種別引数で振り分けるので両工程に出る', () => {
    expect(toolsOf('flontier')).toContain('submit-document');
    expect(toolsOf('steering')).toContain('submit-document');
  });

  it('名前が server/mcp/tools/ の実体と一致する（揃っていないとモジュールが 400 を返す）', async () => {
    const files = (await readdir(TOOLS_DIR))
      .filter(name => name.endsWith('.ts'))
      .map(name => name.replace(/\.ts$/, ''));
    const exposed = new Set([...toolsOf('flontier'), ...toolsOf('steering')]);

    expect([...exposed].sort()).toEqual([...files].sort());
  });
});
