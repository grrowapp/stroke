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
  /**
   * 本家の MCP サーバーのプロセス ID。アクティブなときだけ引ける。
   * アクティブとは registry entry に生きた PID があることなので、その実体を出す。
   */
  pid: number | null;
  /**
   * `.spec-workflow` 配下の更新時刻（ISO8601）。取れなければ null。
   * 未接続のプロジェクトは本家 API から何も取れないため、ここだけが手がかりになる。
   */
  lastModified: string | null;
  /**
   * 本家が今返している保留中の承認依頼の件数。未接続なら null。
   *
   * 通知（＝接続後に起きた変化）とは別物である。通知は接続直後には1件も無いが、保留中の
   * 承認依頼はその時点で既に存在しうる。承認待ちが起きていることを見に行かずに知るのが
   * このプロダクトの目的（product.md の Purpose）なので、今の状態も出す。
   *
   * 本家が返すものを数えているだけで、意味づけを足していない（docs/adr/0001）。
   */
  pendingApprovals: number | null;
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

/**
 * 一覧画面の操作が使えるかどうか。
 *
 * どちらも今は使えないが、理由が違う。理由を持たずに非活性だけ置くと、画面から
 * 「なぜ使えないのか」が消える（interview Q39・Q40 はどちらも「その状態は画面に出る」で
 * 決着している）。
 *
 * - `target-undecided` — 作成の実処理を担う接続先の別プロジェクトが何であるか未定。
 *   stroke-board は入口だけを持ち、接続が無ければ作成は行えない（interview Q40）
 * - `meaning-undecided` — stroke-board の「登録」が何を指すかが未定。本家に
 *   `POST /api/projects/add` が実在する一方、一覧は親パスの走査で作っている（interview Q39）
 */
export type ActionAvailability =
  | { available: true }
  | { available: false; reason: 'target-undecided' | 'meaning-undecided' };

export interface DirectoryActions {
  register: ActionAvailability;
  create: ActionAvailability;
}

/** `GET /api/projects` が返すもの */
export interface ProjectDirectoryResponse {
  directory: ProjectDirectory;
  actions: DirectoryActions;
}

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
  /**
   * 飛び先の中で対象を指す名前。承認なら承認 ID、タスクなら spec 名。
   *
   * 本家のダッシュボードは対象を URL で指せない。stroke-board がそれを繰り返さないよう、
   * 通知からは対象そのものの URL へ着地させる（product.md の Purpose）。
   */
  targetId: string;
}

/** ブラウザ向け WebSocket が送るもの */
export type BoardMessage =
  | { type: 'snapshot'; notifications: Notification[]; upstreamConnected: boolean }
  | { type: 'notification'; notification: Notification }
  | { type: 'upstream-connection'; connected: boolean };

// --- 下層の画面が見る形 ---
//
// 本家の型をそのまま画面へ流さない（structure.md の Module Boundaries）。ここに置いた
// ものだけが画面から見える。形は本家の実測に対応しているが、画面はこちらだけを見る。

export interface ProjectInfoDto {
  projectId: string;
  projectName: string;
  projectPath: string;
  steering: {
    exists: boolean;
    documents: { product: boolean; tech: boolean; structure: boolean };
    lastModified?: string;
  };
  version: string;
}

export interface SpecPhaseDto {
  exists: boolean;
  approved?: boolean;
  lastModified?: string;
}

export interface SpecSummaryDto {
  name: string;
  description?: string;
  createdAt: string;
  lastModified: string;
  phases: {
    requirements: SpecPhaseDto;
    design: SpecPhaseDto;
    tasks: SpecPhaseDto;
    implementation: SpecPhaseDto;
  };
  taskProgress?: { total: number; completed: number; pending: number };
}

/** 無い文書は null で返る */
export type SpecDocumentsDto = Record<
  'requirements' | 'design' | 'tasks',
  { content: string; lastModified: string } | null
>;

export interface TaskDto {
  id: string;
  description: string;
  status: string;
  isHeader: boolean;
}

export interface TaskProgressDto {
  total: number;
  completed: number;
  /** 着手中のタスクの ID。無ければ null */
  inProgress: string | null;
  progress: number;
  taskList: TaskDto[];
  lastModified?: string;
}

export interface ApprovalDto {
  id: string;
  title: string;
  /** プロジェクトルートからの相対パス */
  filePath: string;
  category: 'spec' | 'steering';
  categoryName: string;
  createdAt: string;
}

export interface DocumentContentDto {
  content: string;
}
