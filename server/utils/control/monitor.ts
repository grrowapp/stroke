/**
 * アクティブなプロジェクト集合に追従して、本家への接続を張り替える。
 *
 * stroke-board 固有の判断はすべてここに集まる。画面は判断せず、ここが整えた形だけを見る
 * （structure.md の Code Organization Principles）。
 *
 * 再接続が成立したら基準を作り直す。切断中に起きた変化は通知にならないが、これは
 * 「通知を永続化しない」ことの帰結として受け入れる（tech.md の Known Limitations）。
 */

import { UpstreamRestClient } from '../upstream/rest';
import { UpstreamSocket } from '../upstream/socket';
import {
  createBaseline,
  diffApprovals,
  diffTasks,
  seedApprovals,
  seedTasks,
  type ProjectBaseline,
} from './diff';
import { NotificationFeed, toApprovalNotification, toTaskNotification } from './notify';
import type { UpstreamMessage } from '../upstream/schema';
import type { Notification, ProjectSummary } from '#shared/types';

/** 監視中の1プロジェクト */
interface Watched {
  projectId: string;
  projectName: string;
  socket: UpstreamSocket;
  baseline: ProjectBaseline;
  /** WebSocket が開いているか */
  open: boolean;
  /**
   * 基準を作り終えたか。
   *
   * 開いただけでは通知を出せない。`initial` を受けて基準を取り込むまでは、次に届く変化を
   * 「増えた」と判定できないためである（specs/notification-feed）。画面に出す接続状態も
   * これに合わせる。「接続済み」と出ているのに通知が出ない時間があると、取りこぼしたのか
   * 準備中なのかが利用者に区別できない。
   */
  ready: boolean;
}

export interface MonitorOptions {
  upstreamBaseUrl: string;
  /** 通知が1件できるたびに呼ばれる。ブラウザへの配信に使う */
  onNotification: (notification: Notification) => void;
  /** 本家との接続状態が変わったら呼ばれる */
  onConnectionChange?: (connected: boolean) => void;
  /** 形の合わないペイロードが届いた。黙って捨てずに知らせる */
  onMalformed?: (projectId: string, reason: string) => void;
}

export class UpstreamMonitor {
  private readonly watched = new Map<string, Watched>();
  private readonly rest: UpstreamRestClient;
  readonly feed = new NotificationFeed();

  constructor(private readonly options: MonitorOptions) {
    this.rest = new UpstreamRestClient(options.upstreamBaseUrl);
  }

  /** 本家に1つでも繋がって基準が整っているか。ヘッダーの接続状態に出す */
  get connected(): boolean {
    for (const watched of this.watched.values()) {
      if (watched.ready) return true;
    }
    return false;
  }

  /**
   * アクティブなプロジェクト集合に追従する。
   *
   * 増えたら接続して基準を作り、消えたら切断して基準を捨てる。居続けるものには何もしない
   * （design.md 決定8）。
   */
  /** 監視対象が入れ替わったら true。呼び出し側が一覧を配信し直すのに使う */
  sync(projects: ProjectSummary[]): boolean {
    const before = this.connected;
    let changed = false;

    const active = new Map(
      projects
        .filter((project) => project.connection === 'active' && project.projectId !== null)
        .map((project) => [project.projectId as string, project.name]),
    );

    for (const [projectId, watched] of this.watched) {
      if (active.has(projectId)) continue;

      watched.socket.close();
      this.watched.delete(projectId);
      // 監視対象から外れたプロジェクトの通知は残さない。飛び先へ入れなくなるため
      this.feed.dropProject(projectId);
      changed = true;
    }

    for (const [projectId, projectName] of active) {
      if (this.watched.has(projectId)) continue;
      this.watch(projectId, projectName);
      changed = true;
    }

    // 外したことで接続状態が変わる。socket の close イベントは既に監視対象から
    // 消えた後に届くので、そこからは配信されない
    if (this.connected !== before) this.options.onConnectionChange?.(this.connected);

    return changed;
  }

  /** すべての接続を閉じる */
  stop(): void {
    for (const watched of this.watched.values()) watched.socket.close();
    this.watched.clear();
    this.feed.clear();
  }

  private watch(projectId: string, projectName: string): void {
    const baseline = createBaseline();

    const socket = new UpstreamSocket(this.options.upstreamBaseUrl, projectId, {
      onMessage: (message) => this.receive(projectId, message),
      onOpen: () => this.setConnected(projectId, true),
      onClose: () => this.setConnected(projectId, false),
      onMalformed: (reason) => this.options.onMalformed?.(projectId, reason),
      onError: (reason) => this.options.onMalformed?.(projectId, reason),
    });

    this.watched.set(projectId, {
      projectId,
      projectName,
      socket,
      baseline,
      open: false,
      ready: false,
    });
    socket.connect();
  }

  private setConnected(projectId: string, open: boolean): void {
    const watched = this.watched.get(projectId);
    if (watched === undefined) return;

    const before = this.connected;
    watched.open = open;

    if (open) {
      // 再接続したら基準を作り直す。切断中の変化は取り戻せない。
      // 基準ができるまで ready にしない
      watched.baseline = createBaseline();
    } else {
      watched.ready = false;
    }

    if (this.connected !== before) this.options.onConnectionChange?.(this.connected);
  }

  private setReady(watched: Watched): void {
    const before = this.connected;
    watched.ready = watched.open;

    if (this.connected !== before) this.options.onConnectionChange?.(this.connected);
  }

  private receive(projectId: string, message: UpstreamMessage): void {
    const watched = this.watched.get(projectId);
    if (watched === undefined) return;

    switch (message.type) {
      case 'initial':
        void this.seed(watched, message.data);
        return;

      case 'task-status-update': {
        const changes = diffTasks(
          watched.baseline,
          message.data.specName,
          message.data.summary,
          message.data.inProgress,
        );

        for (const change of changes) {
          this.emit(toTaskNotification(change, this.contextOf(watched)));
        }
        return;
      }

      case 'approval-update': {
        const changes = diffApprovals(watched.baseline, message.data);

        for (const change of changes) {
          this.emit(toApprovalNotification(change, this.contextOf(watched)));
        }
        return;
      }

      default:
        // spec-update / steering-update / projects-update は再描画用の同期信号。
        // 通知にしない（specs/notification-feed）
        return;
    }
  }

  /**
   * 接続直後の基準を作る。通知は出さない。
   *
   * `initial` には `inProgress` が無いため、tasks を持つ spec ごとに
   * `GET .../tasks/progress` を1回ずつ呼ぶ（design.md 決定4）。定期ポーリングではない。
   */
  private async seed(
    watched: Watched,
    data: { specs: { name: string; phases: { tasks: { exists: boolean } } }[]; approvals: Parameters<typeof seedApprovals>[1] },
  ): Promise<void> {
    seedApprovals(watched.baseline, data.approvals);

    const withTasks = data.specs.filter((spec) => spec.phases.tasks.exists);

    await Promise.all(
      withTasks.map(async (spec) => {
        const progress = await this.rest.getTaskProgress(watched.projectId, spec.name);
        // 取れなくても止めない。その spec は最初の task-status-update が基準になる
        if (progress.ok) seedTasks(watched.baseline, spec.name, progress.value);
      }),
    );

    // ここで初めて通知を出せる状態になる
    this.setReady(watched);
  }

  private contextOf(watched: Watched) {
    return {
      projectId: watched.projectId,
      projectName: watched.projectName,
      occurredAt: new Date().toISOString(),
    };
  }

  private emit(notification: Notification): void {
    this.feed.add(notification);
    this.options.onNotification(notification);
  }
}
