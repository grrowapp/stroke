import { mkdtemp, mkdir, writeFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanProjects } from './scan';

const created: string[] = [];

async function makeParent(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'scan-'));
  created.push(dir);
  return dir;
}

async function makeProject(parent: string, name: string): Promise<string> {
  const root = join(parent, name);
  await mkdir(join(root, '.spec-workflow'), { recursive: true });
  return root;
}

afterEach(async () => {
  // 読み取り不可にしたディレクトリを後片付けできるよう戻す
  for (const dir of created) await chmod(dir, 0o755).catch(() => {});
  created.length = 0;
});

describe('親パスの走査', () => {
  describe('3つの状態を区別して返す', () => {
    it('親パスが未設定なら not-configured', async () => {
      const result = await scanProjects(null);
      expect(result.status).toBe('not-configured');
    });

    it('親パスが存在しなければ unreadable', async () => {
      const result = await scanProjects('/definitely/not/here');
      expect(result.status).toBe('unreadable');
    });

    it('親パスが読めなければ unreadable', async () => {
      const parent = await makeParent();
      await makeProject(parent, 'alpha');
      await chmod(parent, 0o000);

      const result = await scanProjects(parent);
      expect(result.status).toBe('unreadable');
    });

    it('読めるが .spec-workflow を持つものが無ければ ok の0件', async () => {
      const parent = await makeParent();
      await mkdir(join(parent, 'just-a-dir'));

      const result = await scanProjects(parent);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.projects).toEqual([]);
    });

    it('未設定と0件が同じ値にならない', async () => {
      const parent = await makeParent();
      const empty = await scanProjects(parent);
      const unset = await scanProjects(null);
      expect(empty.status).not.toBe(unset.status);
    });
  });

  describe('拾うもの・拾わないもの', () => {
    it('.spec-workflow を持つディレクトリを拾う', async () => {
      const parent = await makeParent();
      await makeProject(parent, 'alpha');
      await makeProject(parent, 'beta');

      const result = await scanProjects(parent);
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.projects.map((p) => p.name).sort()).toEqual(['alpha', 'beta']);
    });

    it('.spec-workflow を持たないディレクトリは拾わない', async () => {
      const parent = await makeParent();
      await makeProject(parent, 'alpha');
      await mkdir(join(parent, 'not-a-project'));

      const result = await scanProjects(parent);
      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects.map((p) => p.name)).toEqual(['alpha']);
    });

    it('ファイルは拾わない', async () => {
      const parent = await makeParent();
      await writeFile(join(parent, 'README.md'), '');

      const result = await scanProjects(parent);
      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects).toEqual([]);
    });

    it('シンボリックリンク先がプロジェクトなら拾う', async () => {
      const parent = await makeParent();
      const elsewhere = await makeParent();
      const real = await makeProject(elsewhere, 'real');
      await symlink(real, join(parent, 'linked'));

      const result = await scanProjects(parent);
      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects.map((p) => p.name)).toEqual(['linked']);
    });

    it('2階層下は拾わない', async () => {
      const parent = await makeParent();
      await mkdir(join(parent, 'wrapper'));
      await makeProject(join(parent, 'wrapper'), 'deep');

      const result = await scanProjects(parent);
      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects).toEqual([]);
    });
  });

  it('workflowRootPath は .spec-workflow を持つディレクトリそのものを指す', async () => {
    const parent = await makeParent();
    const root = await makeProject(parent, 'alpha');

    const result = await scanProjects(parent);
    if (result.status !== 'ok') throw new Error('前提が崩れた');
    expect(result.projects[0]!.workflowRootPath).toBe(root);
  });
});
