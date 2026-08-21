import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readRegistry } from './registry';

/** 稼働中の本家から実際に取得した形（evidence/upstream-v2.2.5.md） */
const REAL_REGISTRY = {
  t_kx1DQkLKdeg1Cl: {
    projectId: 't_kx1DQkLKdeg1Cl',
    projectPath: '/home/vagrant/work/stroke-guard/v2',
    workflowRootPath: '/opt/projects/stroke-guard-rev',
    projectName: 'stroke-guard-rev · v2',
    instances: [{ pid: 1483974, registeredAt: '2026-08-17T14:17:54.455Z' }],
  },
  YRzzH6mvc1uUzZN3: {
    projectId: 'YRzzH6mvc1uUzZN3',
    projectPath: '/home/vagrant/work/stroke-board/base2',
    workflowRootPath: '/opt/projects/stroke-board',
    projectName: 'stroke-board · base2',
    instances: [{ pid: 3445195, registeredAt: '2026-08-20T22:21:51.942Z' }],
  },
};

async function withRegistry(content: string | null): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'registry-'));
  if (content !== null) await writeFile(join(home, 'activeProjects.json'), content);
  return home;
}

describe('registry の読み取り', () => {
  it('実際の registry を読める', async () => {
    const home = await withRegistry(JSON.stringify(REAL_REGISTRY));
    const result = await readRegistry(home);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.workflowRootPath).sort()).toEqual([
      '/opt/projects/stroke-board',
      '/opt/projects/stroke-guard-rev',
    ]);
  });

  it('projectId は workflowRootPath ではなく projectPath に対応する', async () => {
    const home = await withRegistry(JSON.stringify(REAL_REGISTRY));
    const result = await readRegistry(home);
    if (result.status !== 'ok') throw new Error('前提が崩れた');

    const entry = result.entries.find((e) => e.projectId === 'YRzzH6mvc1uUzZN3')!;
    expect(entry.projectPath).toBe('/home/vagrant/work/stroke-board/base2');
    expect(entry.workflowRootPath).toBe('/opt/projects/stroke-board');
  });

  it('ファイルが無いのは異常ではなく0件として扱う', async () => {
    const home = await withRegistry(null);
    const result = await readRegistry(home);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.entries).toEqual([]);
  });

  it('空オブジェクトは0件', async () => {
    const home = await withRegistry('{}');
    const result = await readRegistry(home);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.entries).toEqual([]);
  });

  it('壊れた JSON は unreadable として返す。0件と混ぜない', async () => {
    const home = await withRegistry('{ not json');
    const result = await readRegistry(home);

    expect(result.status).toBe('unreadable');
  });

  it('最上位が配列なら unreadable', async () => {
    const home = await withRegistry('[]');
    const result = await readRegistry(home);

    expect(result.status).toBe('unreadable');
  });

  it('形の合わない entry だけを落として残りは通す', async () => {
    const home = await withRegistry(
      JSON.stringify({ ...REAL_REGISTRY, broken: { projectId: 'x' } }),
    );
    const result = await readRegistry(home);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.entries).toHaveLength(2);
  });

  it('instances が空の entry も読める（アクティブ判定は呼び出し側の仕事）', async () => {
    const home = await withRegistry(
      JSON.stringify({
        stopped: {
          projectId: 'stopped',
          projectPath: '/w/stopped',
          workflowRootPath: '/opt/projects/stopped',
          projectName: 'stopped',
          instances: [],
        },
      }),
    );
    const result = await readRegistry(home);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.entries[0]!.instances).toEqual([]);
  });
});
