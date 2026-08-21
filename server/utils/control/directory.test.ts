import { describe, expect, it } from 'vitest';

import { buildProjectDirectory } from './directory';
import type { RegistryEntry } from '../upstream/registry';
import type { ScanResult } from '../upstream/scan';

function scanned(...names: string[]): ScanResult {
  return {
    status: 'ok',
    parentPath: '/opt/projects',
    projects: names.map((name) => ({ name, workflowRootPath: `/opt/projects/${name}` })),
  };
}

function entry(overrides: Partial<RegistryEntry> & { workflowRootPath: string }): RegistryEntry {
  return {
    projectId: `id-${overrides.workflowRootPath}`,
    projectPath: '/w/somewhere',
    projectName: 'なにか',
    instances: [{ pid: 1, registeredAt: '2026-08-21T00:00:00.000Z' }],
    ...overrides,
  };
}

function lookup(entries: RegistryEntry[] = [], readable = true) {
  return { entries, readable };
}

describe('プロジェクト一覧の組み立て', () => {
  describe('走査の状態をそのまま画面へ渡す', () => {
    it('親パス未設定は not-configured', () => {
      const result = buildProjectDirectory({ status: 'not-configured' }, lookup());
      expect(result.status).toBe('not-configured');
    });

    it('走査失敗は scan-failed。理由も渡す', () => {
      const result = buildProjectDirectory(
        { status: 'unreadable', parentPath: '/opt/projects', reason: 'EACCES' },
        lookup(),
      );
      expect(result.status).toBe('scan-failed');
      if (result.status === 'scan-failed') expect(result.reason).toBe('EACCES');
    });

    it('プロジェクトが0件でも ok。not-configured と混ざらない', () => {
      const result = buildProjectDirectory(scanned(), lookup());
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.projects).toEqual([]);
    });
  });

  describe('アクティブ判定は workflowRootPath で突き合わせる', () => {
    it('registry に一致する entry があればアクティブ', () => {
      const result = buildProjectDirectory(
        scanned('stroke-board'),
        lookup([entry({ workflowRootPath: '/opt/projects/stroke-board', projectId: 'PID1' })]),
      );

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects[0]!.connection).toBe('active');
      expect(result.projects[0]!.projectId).toBe('PID1');
    });

    it('registry に無ければ未接続。projectId は引けない', () => {
      const result = buildProjectDirectory(scanned('old-proto'), lookup());

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects[0]!.connection).toBe('disconnected');
      expect(result.projects[0]!.projectId).toBeNull();
    });

    it('instances が空の entry は未接続として扱う', () => {
      const result = buildProjectDirectory(
        scanned('stopped'),
        lookup([entry({ workflowRootPath: '/opt/projects/stopped', instances: [] })]),
      );

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects[0]!.connection).toBe('disconnected');
    });

    it('projectPath が一致しても workflowRootPath が違えば未接続', () => {
      const result = buildProjectDirectory(
        scanned('stroke-board'),
        lookup([entry({ workflowRootPath: '/somewhere/else' })]),
      );

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects[0]!.connection).toBe('disconnected');
    });

    it('アクティブが1件も無い状態が成立する', () => {
      const result = buildProjectDirectory(scanned('a', 'b', 'c'), lookup());

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects.every((p) => p.connection === 'disconnected')).toBe(true);
    });

    it('同一 workflowRootPath に entry が複数あるときは先頭の projectId を使う', () => {
      const result = buildProjectDirectory(
        scanned('shared'),
        lookup([
          entry({ workflowRootPath: '/opt/projects/shared', projectId: 'FIRST' }),
          entry({ workflowRootPath: '/opt/projects/shared', projectId: 'SECOND' }),
        ]),
      );

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]!.projectId).toBe('FIRST');
    });

    it('registry が読めなくても一覧は出る。全件が未接続になる', () => {
      const result = buildProjectDirectory(scanned('a', 'b'), lookup([], false));

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.registryReadable).toBe(false);
      expect(result.projects.every((p) => p.connection === 'disconnected')).toBe(true);
    });
  });

  describe('並び順', () => {
    it('アクティブが上、未接続が下', () => {
      const result = buildProjectDirectory(
        scanned('zzz-active', 'aaa-idle'),
        lookup([entry({ workflowRootPath: '/opt/projects/zzz-active' })]),
      );

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects.map((p) => p.name)).toEqual(['zzz-active', 'aaa-idle']);
    });

    it('同じ区分の中では名前順。走査の返り順に依存しない', () => {
      const result = buildProjectDirectory(scanned('c', 'a', 'b'), lookup());

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects.map((p) => p.name)).toEqual(['a', 'b', 'c']);
    });

    it('表示名は走査ディレクトリ名。registry の projectName は使わない', () => {
      const result = buildProjectDirectory(
        scanned('stroke-board'),
        lookup([
          entry({ workflowRootPath: '/opt/projects/stroke-board', projectName: 'stroke-board · base2' }),
        ]),
      );

      if (result.status !== 'ok') throw new Error('前提が崩れた');
      expect(result.projects[0]!.name).toBe('stroke-board');
    });
  });
});
