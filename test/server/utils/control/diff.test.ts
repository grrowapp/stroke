import { describe, expect, it } from 'vitest';

import {
  createBaseline,
  diffApprovals,
  diffTasks,
  seedApprovals,
  seedTasks,
} from '../../../../server/utils/control/diff';
import type { ApprovalRequest, TaskSummary } from '../../../../server/utils/upstream/schema';

/** 2.2.5 の形（blocked 無し）。基準は 2.2.7 だが両方通す（ADR-0008） */
function summary(completed: number, total: number, inProgress = 0): TaskSummary {
  return { total, completed, inProgress, pending: total - completed - inProgress, headers: 0 };
}

function approval(id: string, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id,
    title: `${id} の承認`,
    filePath: '.spec-workflow/steering/product.md',
    type: 'document',
    status: 'pending',
    createdAt: '2026-08-21T00:00:00.000Z',
    category: 'steering',
    categoryName: 'steering',
    ...overrides,
  };
}

describe('タスクの差分判定', () => {
  describe('基準が無いうちは通知を出さない', () => {
    it('接続直後の最初のスナップショットでは何も出ない', () => {
      const baseline = createBaseline();
      const changes = diffTasks(baseline, 'auth', summary(3, 5), null);
      expect(changes).toEqual([]);
    });

    it('最初のスナップショットは基準として取り込まれる', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(3, 5), null);

      const changes = diffTasks(baseline, 'auth', summary(4, 5), null);
      expect(changes.map((c) => c.kind)).toEqual(['task-completed']);
    });

    it('接続時に REST で基準を作れば、次の変化から通知が出る', () => {
      const baseline = createBaseline();
      seedTasks(baseline, 'auth', {
        total: 5,
        completed: 3,
        inProgress: null,
        progress: 60,
        taskList: [],
      });

      const changes = diffTasks(baseline, 'auth', summary(4, 5), null);
      expect(changes.map((c) => c.kind)).toEqual(['task-completed']);
    });
  });

  describe('変化していないときは通知を出さない', () => {
    it('同じスナップショットが2回届いても出ない', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(3, 5), null);

      expect(diffTasks(baseline, 'auth', summary(3, 5), null)).toEqual([]);
    });

    it('完了数が減っても通知にしない', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(4, 5), null);

      expect(diffTasks(baseline, 'auth', summary(3, 5), null)).toEqual([]);
    });
  });

  describe('タスク完了', () => {
    it('完了数が増えたら出る', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(1, 5), null);

      const changes = diffTasks(baseline, 'auth', summary(2, 5), null);
      expect(changes).toEqual([{ kind: 'task-completed', specName: 'auth', completed: 2, total: 5 }]);
    });

    it('一度に複数完了しても1件にまとまる', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(1, 5), null);

      const changes = diffTasks(baseline, 'auth', summary(4, 5), null);
      expect(changes.filter((c) => c.kind === 'task-completed')).toHaveLength(1);
    });
  });

  describe('全件完了', () => {
    it('全件完了になったら タスク完了 と 全件完了 の2件が出る', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(4, 5), null);

      const changes = diffTasks(baseline, 'auth', summary(5, 5), null);
      expect(changes.map((c) => c.kind)).toEqual(['task-completed', 'all-tasks-completed']);
    });

    it('既に全件完了だった状態では出ない', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(5, 5), null);

      expect(diffTasks(baseline, 'auth', summary(5, 5), null)).toEqual([]);
    });

    it('タスクが0件のときは全件完了にしない', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(0, 0), null);

      expect(diffTasks(baseline, 'auth', summary(0, 0), null)).toEqual([]);
    });

    it('全件完了のあとタスクが増えると、再度の全件完了は出る', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(5, 5), null);
      diffTasks(baseline, 'auth', summary(5, 6), null);

      const changes = diffTasks(baseline, 'auth', summary(6, 6), null);
      expect(changes.map((c) => c.kind)).toEqual(['task-completed', 'all-tasks-completed']);
    });
  });

  describe('タスク着手', () => {
    it('着手中のタスクが現れたら出る', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(0, 5), null);

      const changes = diffTasks(baseline, 'auth', summary(0, 5, 1), '1.1');
      expect(changes).toEqual([{ kind: 'task-started', specName: 'auth', taskId: '1.1' }]);
    });

    it('別のタスクへ移ったら出る', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(0, 5, 1), '1.1');

      const changes = diffTasks(baseline, 'auth', summary(0, 5, 1), '1.2');
      expect(changes).toEqual([{ kind: 'task-started', specName: 'auth', taskId: '1.2' }]);
    });

    it('同じタスクが着手中のままなら出ない', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(0, 5, 1), '1.1');

      expect(diffTasks(baseline, 'auth', summary(0, 5, 1), '1.1')).toEqual([]);
    });

    it('着手中が無くなっただけでは着手にしない', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(0, 5, 1), '1.1');

      const changes = diffTasks(baseline, 'auth', summary(1, 5), null);
      expect(changes.map((c) => c.kind)).toEqual(['task-completed']);
    });
  });

  describe('spec ごとに基準を持つ', () => {
    it('別の spec の変化が混ざらない', () => {
      const baseline = createBaseline();
      diffTasks(baseline, 'auth', summary(1, 5), null);
      diffTasks(baseline, 'billing', summary(1, 3), null);

      const changes = diffTasks(baseline, 'billing', summary(2, 3), null);
      expect(changes).toEqual([
        { kind: 'task-completed', specName: 'billing', completed: 2, total: 3 },
      ]);
    });
  });

  describe('2.2.7 の blocked を含む summary も扱える', () => {
    it('blocked があっても完了判定は変わらない', () => {
      const baseline = createBaseline();
      const before = { total: 5, completed: 1, inProgress: 0, pending: 3, blocked: 1, headers: 0 };
      const after = { total: 5, completed: 2, inProgress: 0, pending: 2, blocked: 1, headers: 0 };

      diffTasks(baseline, 'auth', before, null);
      const changes = diffTasks(baseline, 'auth', after, null);

      expect(changes.map((c) => c.kind)).toEqual(['task-completed']);
    });

    it('blocked は通知にしない', () => {
      const baseline = createBaseline();
      const before = { total: 5, completed: 1, inProgress: 0, pending: 4, blocked: 0, headers: 0 };
      const after = { total: 5, completed: 1, inProgress: 0, pending: 3, blocked: 1, headers: 0 };

      diffTasks(baseline, 'auth', before, null);
      expect(diffTasks(baseline, 'auth', after, null)).toEqual([]);
    });
  });
});

describe('承認依頼の差分判定', () => {
  it('接続直後の最初のスナップショットでは何も出ない', () => {
    const baseline = createBaseline();
    seedApprovals(baseline, [approval('a1'), approval('a2'), approval('a3')]);

    expect(diffApprovals(baseline, [approval('a1'), approval('a2'), approval('a3')])).toEqual([]);
  });

  it('基準の取り込み後に増えた1件だけが出る', () => {
    const baseline = createBaseline();
    seedApprovals(baseline, [approval('a1'), approval('a2'), approval('a3')]);

    const changes = diffApprovals(baseline, [
      approval('a1'),
      approval('a2'),
      approval('a3'),
      approval('a4'),
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.approval.id).toBe('a4');
  });

  it('同じスナップショットが2回届いても出ない', () => {
    const baseline = createBaseline();
    diffApprovals(baseline, [approval('a1')]);

    expect(diffApprovals(baseline, [approval('a1')])).toEqual([]);
  });

  it('承認依頼が消えても通知にしない（承認と却下は区別できない）', () => {
    const baseline = createBaseline();
    diffApprovals(baseline, [approval('a1'), approval('a2')]);

    expect(diffApprovals(baseline, [approval('a1')])).toEqual([]);
  });

  it('消えたあと同じ ID が再び現れたら出る', () => {
    const baseline = createBaseline();
    diffApprovals(baseline, [approval('a1')]);
    diffApprovals(baseline, []);

    expect(diffApprovals(baseline, [approval('a1')])).toHaveLength(1);
  });

  it('ステアリング文書への承認依頼も通知になる（ADR-0007）', () => {
    const baseline = createBaseline();
    seedApprovals(baseline, []);

    const changes = diffApprovals(baseline, [
      approval('s1', { category: 'steering', categoryName: 'steering' }),
    ]);

    expect(changes[0]!.approval.category).toBe('steering');
  });

  it('仕様への承認依頼も通知になる', () => {
    const baseline = createBaseline();
    seedApprovals(baseline, []);

    const changes = diffApprovals(baseline, [
      approval('p1', { category: 'spec', categoryName: 'auth-spec' }),
    ]);

    expect(changes[0]!.approval.category).toBe('spec');
  });

  it('プロジェクトごとに基準が独立している', () => {
    const a = createBaseline();
    const b = createBaseline();

    seedApprovals(a, [approval('x')]);
    expect(diffApprovals(b, [approval('x')])).toHaveLength(1);
  });
});
