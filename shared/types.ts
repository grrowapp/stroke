/**
 * 画面とサーバーが共有する型。
 *
 * 画面はここに書かれた形だけを見る。本家の形をそのまま画面へ流さない
 * （structure.md の「画面から本家へ直接触らない」）。
 */

/** プロジェクトが本家に繋がっているか */
export type ProjectConnection = 'active' | 'disconnected';

/** 上層のプロジェクト一覧の1行 */
export interface ProjectSummary {
  /** 走査で見つかったディレクトリ名。表示名に使う */
  name: string;
  /** `.spec-workflow` を持つディレクトリの絶対パス。一覧内で一意 */
  workflowRootPath: string;
  connection: ProjectConnection;
  /**
   * 本家の projectId。アクティブなときだけ引ける。
   * 未接続では registry にエントリが無いため null になる（design.md 決定1）。
   */
  projectId: string | null;
}

/**
 * プロジェクト一覧の取得結果。
 *
 * 「親パス未設定」「走査失敗」「0件」は画面での見せ方が変わるので混ぜない
 * （specs/project-directory）。
 */
export type ProjectDirectory =
  | { status: 'not-configured' }
  | { status: 'scan-failed'; parentPath: string; reason: string }
  | { status: 'ok'; parentPath: string; projects: ProjectSummary[]; registryReadable: boolean };

/** 通知の種別。本家 NotificationProvider と同じ4種だけ（specs/notification-feed） */
export type NotificationKind =
  | 'task-completed'
  | 'task-started'
  | 'all-tasks-completed'
  | 'approval-requested';

/** トーストの色。本家と同じ4種 */
export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

/** 通知の飛び先。承認依頼は承認画面、タスクはタスク画面（ADR-0003 / design.md 決定9） */
export type NotificationTarget = 'approvals' | 'tasks';

/** 通知1件。永続化しないのでプロセスのメモリ上にだけ存在する */
export interface Notification {
  id: string;
  kind: NotificationKind;
  tone: NotificationTone;
  /** 発生したプロジェクトの projectId */
  projectId: string;
  /** 一覧の「プロジェクト」列 */
  projectName: string;
  /** 一覧の「種別」列 */
  category: 'approval' | 'task';
  /** 一覧の「内容」列の上段 */
  title: string;
  /** 一覧の「内容」列の下段。spec 名やステアリング名 */
  subject: string;
  /** 一覧の「最終更新」列。ISO8601 */
  occurredAt: string;
  /** 行を選んだときに開く先 */
  target: NotificationTarget;
}

/** ブラウザ向け WebSocket が送るもの */
export type BoardMessage =
  | { type: 'snapshot'; notifications: Notification[]; upstreamConnected: boolean }
  | { type: 'notification'; notification: Notification }
  | { type: 'upstream-connection'; connected: boolean };
