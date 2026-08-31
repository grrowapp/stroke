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
      'get-guide',
      'get-overview',
      'get-strokes',
      'get-send-back',
      'send-question',
      'submit-document',
    ]);
    expect(toolsOf('flontier')).not.toContain('get-steering');
    expect(toolsOf('flontier')).not.toContain('get-steering-guide');
  });

  it('steering 工程は flontier 専用のツールを公開しない', () => {
    expect(toolsOf('steering')).toEqual(['get-steering-guide', 'get-steering', 'submit-document']);
    for (const tool of ['get-guide', 'get-overview', 'get-strokes', 'get-send-back', 'send-question']) {
      expect(toolsOf('steering')).not.toContain(tool);
    }
  });

  it('案内のツールは工程ごとに別で、互いの工程には出ない', () => {
    // 1本で工程を見分けて出し分ける形は採らない。工程の食い違いをツールの中で
    // 判定して失敗を返す形は、get-steering で実測が破綻を示している（51回中48回が 500）
    expect(toolsOf('flontier')).toContain('get-guide');
    expect(toolsOf('steering')).toContain('get-steering-guide');
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
