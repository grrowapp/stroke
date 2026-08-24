/**
 * 差分判定の結果を通知にする。
 *
 * 飛び先は種別だけで決まる。承認依頼は `category` が `spec` でも `steering` でも承認画面
 * （docs/adr/0007）。タスクの3種はタスク画面（design.md 決定9）。
 *
 * 通知は永続化しない。履歴も既読未読も持たない（specs/notification-feed）。保持は
 * プロセスのメモリ上に限り、上限を超えたら古いものから落とす。
 */

import { randomUUID } from 'node:crypto';

import type { ApprovalChange, TaskChange } from './diff';
import type { Notification, NotificationTone } from '#shared/types';

/**
 * 一覧に保持する通知の上限。
 * 永続化しない以上、上限が無いとプロセスを再起動するまでメモリが伸び続ける
 * （design.md 決定6）。
 */
export const NOTIFICATION_LIMIT = 200;

export interface NotificationContext {
  projectId: string;
  /** 一覧の「プロジェクト」列に出す名前。走査ディレクトリ名 */
  projectName: string;
  /** 発生時刻。ISO8601 */
  occurredAt: string;
}

export function toTaskNotification(change: TaskChange, context: NotificationContext): Notification {
  const base = {
    id: randomUUID(),
    projectId: context.projectId,
    projectName: context.projectName,
    category: 'task' as const,
    subject: change.specName,
    occurredAt: context.occurredAt,
    target: 'tasks' as const,
    // タスクの通知はその spec のタスク画面へ着地させる
    targetId: change.specName,
  };

  switch (change.kind) {
    case 'task-completed':
      return {
        ...base,
        kind: 'task-completed',
        tone: tone('task-completed'),
        title: `タスク完了（${change.completed}/${change.total}）`,
      };

    case 'all-tasks-completed':
      return {
        ...base,
        kind: 'all-tasks-completed',
        tone: tone('all-tasks-completed'),
        title: `全${change.total}件のタスクが完了`,
      };

    case 'task-started':
      return {
        ...base,
        kind: 'task-started',
        tone: tone('task-started'),
        title: `タスク ${change.taskId} に着手`,
      };
  }
}

export function toApprovalNotification(
  change: ApprovalChange,
  context: NotificationContext,
): Notification {
  return {
    id: randomUUID(),
    kind: 'approval-requested',
    tone: tone('approval-requested'),
    projectId: context.projectId,
    projectName: context.projectName,
    category: 'approval',
    title: change.approval.title,
    // 承認依頼は仕様にもステアリングにも立つ。どちらかは categoryName に出る
    subject: change.approval.categoryName,
    occurredAt: context.occurredAt,
    target: 'approvals',
    // 承認の通知はその承認依頼そのものへ着地させる
    targetId: change.approval.id,
  };
}

/** トーストの色。本家 NotificationProvider の割り当てに合わせる（specs/notification-toast） */
function tone(kind: Notification['kind']): NotificationTone {
  switch (kind) {
    case 'task-completed':
    case 'all-tasks-completed':
      return 'success';
    case 'task-started':
    case 'approval-requested':
      return 'info';
  }
}

/**
 * 通知の一覧。発生時刻の降順で、上限を超えたら古いものから落とす。
 *
 * 直近に起きたことに気づくための画面なので新しいものを上に置く（design.md 決定6）。
 * 同じ対象への通知を畳むことはしない。畳むのは本家から受け取った情報の再構成にあたり、
 * やるかどうかはユーザーが決める（docs/adr/0005）。
 */
export class NotificationFeed {
  private items: Notification[] = [];

  constructor(private readonly limit = NOTIFICATION_LIMIT) {}

  add(notification: Notification): void {
    this.items.unshift(notification);
    if (this.items.length > this.limit) this.items.length = this.limit;
  }

  list(): Notification[] {
    return [...this.items];
  }

  /** プロジェクトが未接続になったときに、その分を落とす */
  dropProject(projectId: string): void {
    this.items = this.items.filter((item) => item.projectId !== projectId);
  }

  clear(): void {
    this.items = [];
  }
}
