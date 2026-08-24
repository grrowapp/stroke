/**
 * 本家から受け取ったスナップショットを前回値と比べて、通知にすべき変化を取り出す。
 *
 * 本家のイベントはすべてスナップショット型で「何が起きたか」を含まない。本家サーバーは
 * `tasks.md` を毎回パースして今の `taskList` を送るだけで前回値を持たないため、比較は
 * 受け取った側の仕事になる。これは本家フロントエンド(`NotificationProvider`)が既に
 * やっていることであって、独自に足す加工ではない（docs/adr/0005 に照らして確認済み）。
 *
 * 出す通知は本家と同じ4種だけ。ステアリング文書の更新、承認の可否、再描画用の同期信号は
 * 通知にしない（specs/notification-feed）。
 */

import type { ApprovalRequest, TaskProgress, TaskSummary } from '../upstream/schema';

/** spec 1本ぶんの基準 */
export interface TaskBaseline {
  total: number;
  completed: number;
  /** 着手中のタスクの ID。無ければ null */
  inProgress: string | null;
}

/** プロジェクト1つぶんの基準。プロセスのメモリ上にだけ持つ（永続化しない） */
export interface ProjectBaseline {
  /** 保留中の承認依頼の ID 集合 */
  approvalIds: Set<string>;
  /** spec 名 -> その spec の基準 */
  tasksBySpec: Map<string, TaskBaseline>;
}

export function createBaseline(): ProjectBaseline {
  return { approvalIds: new Set(), tasksBySpec: new Map() };
}

/** 差分判定が出す「何が起きたか」。文言や飛び先はここでは決めない */
export type TaskChange =
  | { kind: 'task-completed'; specName: string; completed: number; total: number }
  | { kind: 'all-tasks-completed'; specName: string; total: number }
  | { kind: 'task-started'; specName: string; taskId: string };

export interface ApprovalChange {
  kind: 'approval-requested';
  approval: ApprovalRequest;
}

// --- 基準の取り込み ---

/**
 * 接続直後の承認依頼を基準として取り込む。通知は出さない。
 *
 * 本家は接続時に「今の状態」を送るだけで、それ以前に何が起きたかは送らない。基準ができる
 * までは何も比べられないので、最初のスナップショットは取り込むだけにする
 * （specs/notification-feed）。
 */
export function seedApprovals(baseline: ProjectBaseline, approvals: ApprovalRequest[]): void {
  baseline.approvalIds = new Set(approvals.map((approval) => approval.id));
}

/**
 * 接続直後のタスク進捗を基準として取り込む。通知は出さない。
 *
 * `initial` の `specs[].taskProgress` には `inProgress` が無く、着手の判定ができない。
 * そのため接続時に `GET .../specs/:name/tasks/progress` を spec ごとに1回だけ呼ぶ
 * （design.md 決定4）。これは定期ポーリングではない。
 */
export function seedTasks(
  baseline: ProjectBaseline,
  specName: string,
  progress: TaskProgress,
): void {
  baseline.tasksBySpec.set(specName, {
    total: progress.total,
    completed: progress.completed,
    inProgress: progress.inProgress,
  });
}

// --- 差分判定 ---

/**
 * `task-status-update` を前回値と比べる。
 *
 * 完了数の増加と全件完了は同時に成立しうる。その場合は2件返す。本家 `NotificationProvider`
 * も両方を出している（design.md 決定5）。
 *
 * 基準が無い spec（接続後に新しくできた spec など）は、今回を基準として取り込むだけにして
 * 通知を出さない。基準の無い状態からの「増加」は判定できない。
 */
export function diffTasks(
  baseline: ProjectBaseline,
  specName: string,
  summary: TaskSummary,
  inProgress: string | null,
): TaskChange[] {
  const previous = baseline.tasksBySpec.get(specName);

  baseline.tasksBySpec.set(specName, {
    total: summary.total,
    completed: summary.completed,
    inProgress,
  });

  if (previous === undefined) return [];

  const changes: TaskChange[] = [];

  if (summary.completed > previous.completed) {
    changes.push({
      kind: 'task-completed',
      specName,
      completed: summary.completed,
      total: summary.total,
    });
  }

  const allDoneNow = summary.total > 0 && summary.completed === summary.total;
  const allDoneBefore = previous.total > 0 && previous.completed === previous.total;

  if (allDoneNow && !allDoneBefore) {
    changes.push({ kind: 'all-tasks-completed', specName, total: summary.total });
  }

  // 着手は「着手中のタスクが変わって、かつ着手中である」こと。null への遷移は着手ではない
  if (inProgress !== null && inProgress !== previous.inProgress) {
    changes.push({ kind: 'task-started', specName, taskId: inProgress });
  }

  return changes;
}

/**
 * `approval-update` を前回値と比べる。
 *
 * 本家は保留中のものしか返さないため、承認と却下は「消滅」としてしか観測できない。
 * したがって出せるのは「増えた」だけで、結果は通知にしない（docs/adr/0006）。
 */
export function diffApprovals(
  baseline: ProjectBaseline,
  approvals: ApprovalRequest[],
): ApprovalChange[] {
  const previous = baseline.approvalIds;
  const current = new Set(approvals.map((approval) => approval.id));

  baseline.approvalIds = current;

  return approvals
    .filter((approval) => !previous.has(approval.id))
    .map((approval) => ({ kind: 'approval-requested' as const, approval }));
}
