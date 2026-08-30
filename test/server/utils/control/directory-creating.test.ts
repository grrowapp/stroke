import { describe, expect, it } from 'vitest';

import type { PromotedProject } from '../../../../server/utils/control/creating';
import { buildProjectDirectory } from '../../../../server/utils/control/directory';
import type { RegistryEntry } from '../../../../server/utils/upstream/registry';
import type { ScanResult } from '../../../../server/utils/upstream/scan';
import { deriveProjectId } from '../../../../server/utils/upstream/project-id';
import type { ProjectSummary } from '../../../../shared/types';

/**
 * 生成中のプロジェクトの重ね方。
 *
 * 判定は**ファイルシステムの事実だけ**で決まる（design.md D7）。走査に出れば完了、
 * 出なければ生成中。`invocation` は見ない——あれは `state.json` に書かれる永続値で、
 * サーバーが落ちると `running` のまま誰も戻さないためである。
 */

const SCANNED_AT = '2026-08-21T09:00:00.000Z';

function scanned(...names: string[]): ScanResult {
  return {
    status: 'ok',
    parentPath: '/opt/projects',
    projects: names.map((name) => ({
      name,
      workflowRootPath: `/opt/projects/${name}`,
      lastModified: SCANNED_AT,
    })),
  };
}

function promoted(name: string): PromotedProject {
  return { name, path: `/opt/projects/${name}` };
}

function active(name: string): RegistryEntry {
  return {
    projectId: `id-${name}`,
    projectPath: '/w/somewhere',
    projectName: name,
    instances: [{ pid: 1, registeredAt: '2026-08-21T00:00:00.000Z' }],
    workflowRootPath: `/opt/projects/${name}`,
  };
}

function build(scan: ScanResult, entries: RegistryEntry[], promotedProjects: PromotedProject[]) {
  const result = buildProjectDirectory(scan, { entries, readable: true }, new Map(), promotedProjects);
  if (result.status !== 'ok') throw new Error('前提が崩れた');
  return result.projects;
}

function byName(projects: ProjectSummary[], name: string): ProjectSummary {
  const found = projects.find((project) => project.name === name);
  if (found === undefined) throw new Error(`一覧に ${name} が無い`);
  return found;
}

describe('生成中のプロジェクトを一覧に重ねる', () => {
  describe('走査に出てこない昇格分は生成中', () => {
    it('承認した直後は生成中として一覧に載る', () => {
      const projects = build(scanned(), [], [promoted('memo-app')]);

      expect(projects).toHaveLength(1);
      expect(byName(projects, 'memo-app').creation).toBe('in-progress');
    });

    it('本家から取れる値は持たない。接続の判定の対象にしない', () => {
      const projects = build(scanned(), [], [promoted('memo-app')]);
      const row = byName(projects, 'memo-app');

      expect(row.connection).toBe('disconnected');
      expect(row.pid).toBeNull();
      expect(row.pendingApprovals).toBeNull();
    });

    it('`projectId` だけは導出して持つ。破棄のリクエストを組むのに要る', () => {
      const projects = build(scanned(), [], [promoted('memo-app')]);
      const row = byName(projects, 'memo-app');

      // 本家と同じ式（SHA-1 → base64url の先頭16文字）で workspace のパスから作る
      expect(row.projectId).toBe(deriveProjectId('/opt/projects/memo-app'));
      expect(row.projectId).toHaveLength(16);
    });

    it('最終更新は取れないので null。承認の時刻などで埋めない', () => {
      const projects = build(scanned(), [], [promoted('memo-app')]);
      expect(byName(projects, 'memo-app').lastModified).toBeNull();
    });
  });

  describe('走査に出てきたら完了', () => {
    it('`.spec-workflow` が現れた時点で通常の行になる', () => {
      const projects = build(scanned('memo-app'), [], [promoted('memo-app')]);

      expect(projects).toHaveLength(1);
      expect(byName(projects, 'memo-app').creation).toBe('done');
      expect(byName(projects, 'memo-app').lastModified).toBe(SCANNED_AT);
    });

    it('完了していれば本家のアクティブ判定を通す', () => {
      const projects = build(scanned('memo-app'), [active('memo-app')], [promoted('memo-app')]);

      expect(byName(projects, 'memo-app').creation).toBe('done');
      expect(byName(projects, 'memo-app').connection).toBe('active');
      expect(byName(projects, 'memo-app').pid).toBe(1);
    });

    it('同じ名前が二重に並ばない', () => {
      const projects = build(scanned('memo-app'), [], [promoted('memo-app')]);
      expect(projects.filter((project) => project.name === 'memo-app')).toHaveLength(1);
    });
  });

  describe('昇格の記録が無いプロジェクト', () => {
    it('ストロークを経ずに置かれたものは完了として扱う', () => {
      const projects = build(scanned('srvgm'), [], []);
      expect(byName(projects, 'srvgm').creation).toBe('done');
    });
  });

  describe('並び', () => {
    it('アクティブ → 未接続 → 生成中 の順に並ぶ', () => {
      const projects = build(
        scanned('zzz-active', 'aaa-offline'),
        [active('zzz-active')],
        [promoted('aaa-generating')],
      );

      expect(projects.map((project) => project.name)).toEqual([
        'zzz-active',
        'aaa-offline',
        'aaa-generating',
      ]);
    });

    it('生成中は複数あっても最下部に集まり、その中では名前順', () => {
      const projects = build(
        scanned('live'),
        [active('live')],
        [promoted('zebra'), promoted('alpha')],
      );

      expect(projects.map((project) => project.name)).toEqual(['live', 'alpha', 'zebra']);
    });

    it('完了したものは最下部から抜けて、通常の並びに戻る', () => {
      const projects = build(scanned('memo-app', 'zzz-offline'), [], [promoted('memo-app')]);

      expect(projects.map((project) => project.name)).toEqual(['memo-app', 'zzz-offline']);
    });
  });
});
