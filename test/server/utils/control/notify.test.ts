import { describe, expect, it } from 'vitest';

import { NotificationFeed, toApprovalNotification, toTaskNotification } from '../../../../server/utils/control/notify';
import type { ApprovalRequest } from '../../../../server/utils/upstream/schema';
import type { Notification } from '#shared/types';

const context = {
  projectId: 'PID1',
  projectName: 'stroke-board',
  occurredAt: '2026-08-21T09:00:00.000Z',
};

function approval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'a1',
    title: 'ステアリング: product.md の承認',
    filePath: '.spec-workflow/steering/product.md',
    type: 'document',
    status: 'pending',
    createdAt: '2026-08-21T09:00:00.000Z',
    category: 'steering',
    categoryName: 'steering',
    ...overrides,
  };
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    kind: 'task-completed',
    tone: 'success',
    projectId: 'PID1',
    projectName: 'stroke-board',
    category: 'task',
    title: 'タスク完了（1/3）',
    subject: 'auth',
    occurredAt: '2026-08-21T09:00:00.000Z',
    target: 'tasks',
    targetId: 'auth',
    ...overrides,
  };
}

describe('通知への変換', () => {
  describe('飛び先は種別だけで決まる', () => {
    it('タスク完了はタスク画面へ', () => {
      const result = toTaskNotification(
        { kind: 'task-completed', specName: 'auth', completed: 2, total: 5 },
        context,
      );
      expect(result.target).toBe('tasks');
    });

    it('タスク着手はタスク画面へ', () => {
      const result = toTaskNotification(
        { kind: 'task-started', specName: 'auth', taskId: '1.1' },
        context,
      );
      expect(result.target).toBe('tasks');
    });

    it('全件完了はタスク画面へ', () => {
      const result = toTaskNotification(
        { kind: 'all-tasks-completed', specName: 'auth', total: 5 },
        context,
      );
      expect(result.target).toBe('tasks');
    });

    it('仕様への承認依頼は承認画面へ', () => {
      const result = toApprovalNotification(
        { kind: 'approval-requested', approval: approval({ category: 'spec', categoryName: 'auth-spec' }) },
        context,
      );
      expect(result.target).toBe('approvals');
    });

    it('ステアリングへの承認依頼も承認画面へ（ADR-0007）', () => {
      const result = toApprovalNotification(
        { kind: 'approval-requested', approval: approval({ category: 'steering' }) },
        context,
      );
      expect(result.target).toBe('approvals');
    });
  });

  describe('トーストの色は本家の割り当てに合わせる', () => {
    it('タスク完了は success', () => {
      expect(
        toTaskNotification({ kind: 'task-completed', specName: 'a', completed: 1, total: 2 }, context).tone,
      ).toBe('success');
    });

    it('全件完了は success', () => {
      expect(
        toTaskNotification({ kind: 'all-tasks-completed', specName: 'a', total: 2 }, context).tone,
      ).toBe('success');
    });

    it('タスク着手は info', () => {
      expect(
        toTaskNotification({ kind: 'task-started', specName: 'a', taskId: '1.1' }, context).tone,
      ).toBe('info');
    });

    it('承認依頼は info', () => {
      expect(
        toApprovalNotification({ kind: 'approval-requested', approval: approval() }, context).tone,
      ).toBe('info');
    });
  });

  describe('一覧の4列に必要なものが揃う', () => {
    it('タスクの通知', () => {
      const result = toTaskNotification(
        { kind: 'task-completed', specName: 'auth-spec', completed: 3, total: 5 },
        context,
      );

      expect(result.projectName).toBe('stroke-board');
      expect(result.category).toBe('task');
      expect(result.title).toBe('タスク完了（3/5）');
      expect(result.subject).toBe('auth-spec');
      expect(result.occurredAt).toBe('2026-08-21T09:00:00.000Z');
    });

    it('承認の通知は本家の title をそのまま使う', () => {
      const result = toApprovalNotification(
        { kind: 'approval-requested', approval: approval() },
        context,
      );

      expect(result.category).toBe('approval');
      expect(result.title).toBe('ステアリング: product.md の承認');
      expect(result.subject).toBe('steering');
    });
  });

  it('通知ごとに id が振られる', () => {
    const a = toTaskNotification({ kind: 'task-started', specName: 'x', taskId: '1' }, context);
    const b = toTaskNotification({ kind: 'task-started', specName: 'x', taskId: '1' }, context);
    expect(a.id).not.toBe(b.id);
  });
});

describe('通知の一覧', () => {
  it('新しいものが先頭に来る', () => {
    const feed = new NotificationFeed();
    feed.add(notification({ id: 'n1' }));
    feed.add(notification({ id: 'n2' }));

    expect(feed.list().map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('上限を超えたら古いものから落ちる', () => {
    const feed = new NotificationFeed(3);
    for (const id of ['n1', 'n2', 'n3', 'n4']) feed.add(notification({ id }));

    expect(feed.list().map((n) => n.id)).toEqual(['n4', 'n3', 'n2']);
  });

  it('上限は既定で200件', () => {
    const feed = new NotificationFeed();
    for (let i = 0; i < 250; i++) feed.add(notification({ id: `n${i}` }));

    expect(feed.list()).toHaveLength(200);
  });

  it('プロジェクト単位で落とせる', () => {
    const feed = new NotificationFeed();
    feed.add(notification({ id: 'a', projectId: 'P1' }));
    feed.add(notification({ id: 'b', projectId: 'P2' }));

    feed.dropProject('P1');
    expect(feed.list().map((n) => n.id)).toEqual(['b']);
  });

  it('list はコピーを返す。外から書き換えられない', () => {
    const feed = new NotificationFeed();
    feed.add(notification({ id: 'a' }));

    feed.list().push(notification({ id: 'injected' }));
    expect(feed.list()).toHaveLength(1);
  });

  it('再起動相当の clear で空になる', () => {
    const feed = new NotificationFeed();
    feed.add(notification());
    feed.clear();

    expect(feed.list()).toEqual([]);
  });
});
