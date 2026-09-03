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
 * 行が生成中か完了かは **`state.json` の phase だけ**で決まる（specs/project/generation・
 * add-activated-phase design D8）。`approved` は生成中、`activated` は完了。走査に出るか
 * どうか（`.spec-workflow/` の有無）は母集合を作るためにだけ使い、判定には使わない——
 * そのディレクトリは本家 MCP が接続した瞬間にできる。`invocation` も見ない。
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

function promoted(name: string, phase: PromotedProject['phase'] = 'approved'): PromotedProject {
  return { name, path: `/opt/projects/${name}`, phase };
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
  describe('走査に出てこない昇格分（承認した直後）', () => {
    it('生成中として一覧に載る', () => {
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

  describe('走査に出ても、完成の記録が無ければ生成中のまま', () => {
    it('`.spec-workflow` ができただけでは完了にならない', () => {
      const projects = build(scanned('memo-app'), [], [promoted('memo-app', 'approved')]);

      expect(projects).toHaveLength(1);
      expect(byName(projects, 'memo-app').creation).toBe('in-progress');
    });

    it('本家に載っていてもアクティブにしない。入場のガード（connection）が効いたまま', () => {
      const projects = build(scanned('memo-app'), [active('memo-app')], [promoted('memo-app', 'approved')]);
      const row = byName(projects, 'memo-app');

      expect(row.creation).toBe('in-progress');
      expect(row.connection).toBe('disconnected');
      expect(row.pid).toBeNull();
    });

    it('走査で拾えても最終更新と承認依頼の件数は埋めない', () => {
      const projects = build(scanned('memo-app'), [active('memo-app')], [promoted('memo-app', 'approved')]);
      const row = byName(projects, 'memo-app');

      expect(row.lastModified).toBeNull();
      expect(row.pendingApprovals).toBeNull();
      expect(row.projectId).toBe(deriveProjectId('/opt/projects/memo-app'));
    });

    it('同じ名前が二重に並ばない', () => {
      const projects = build(scanned('memo-app'), [], [promoted('memo-app')]);
      expect(projects.filter((project) => project.name === 'memo-app')).toHaveLength(1);
    });
  });

  describe('完成の記録（activated）が在れば完了', () => {
    it('通常の行になり、走査の最終更新を持つ', () => {
      const projects = build(scanned('memo-app'), [], [promoted('memo-app', 'activated')]);

      expect(byName(projects, 'memo-app').creation).toBe('done');
      expect(byName(projects, 'memo-app').lastModified).toBe(SCANNED_AT);
    });

    it('本家のアクティブ判定を通す', () => {
      const projects = build(scanned('memo-app'), [active('memo-app')], [promoted('memo-app', 'activated')]);

      expect(byName(projects, 'memo-app').connection).toBe('active');
      expect(byName(projects, 'memo-app').pid).toBe(1);
    });

    it('registry に無くても projectId を導出で埋める（決着の直後に承認画面を開くため）', () => {
      const projects = build(scanned('memo-app'), [], [promoted('memo-app', 'activated')]);

      expect(byName(projects, 'memo-app').projectId).toBe(deriveProjectId('/opt/projects/memo-app'));
    });

    it('走査に出ない activated は起こりえないが、落とさず完了・未接続として出す', () => {
      const projects = build(scanned(), [], [promoted('memo-app', 'activated')]);
      const row = byName(projects, 'memo-app');

      expect(row.creation).toBe('done');
      expect(row.connection).toBe('disconnected');
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

    it('完成したものは最下部から抜けて、通常の並びに戻る', () => {
      const projects = build(scanned('memo-app', 'zzz-offline'), [], [promoted('memo-app', 'activated')]);

      expect(projects.map((project) => project.name)).toEqual(['memo-app', 'zzz-offline']);
    });
  });
});
