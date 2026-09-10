import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstreamMonitor } from '../../../../server/utils/control/monitor';
import type { ProjectSummary } from '../../../../shared/types';

/**
 * 監視対象の出入りで接続状態が壊れないことを見る。
 *
 * `resetBoard`（`test/e2e/support.ts`）が毎回やっているように、本家の登録簿から消えた
 * プロジェクトがすぐ戻ってくることがある。消えたときに閉じた socket の `close` は
 * **閉じてから届く**ので、戻ってきた後に届くと、作り直した別の socket の記録へ当たりうる。
 *
 * 本物の `ws` は使わない。見たいのは出来事の順序だけで、そこに相手は要らない。
 */

const ws = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  /** `close()` では何も起こさない。`close` イベントは試験が任意の時点で起こす */
  class FakeWebSocket {
    static readonly created: FakeWebSocket[] = [];

    private readonly handlers = new Map<string, Handler[]>();

    constructor(readonly url: string) {
      FakeWebSocket.created.push(this);
    }

    on(event: string, handler: Handler): void {
      const registered = this.handlers.get(event) ?? [];
      registered.push(handler);
      this.handlers.set(event, registered);
    }

    close(): void {
      // 実物は close frame の往復を待つ。イベントはここでは出さない
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }

  return { FakeWebSocket };
});

vi.mock('ws', () => ({ WebSocket: ws.FakeWebSocket }));

const PROJECT_ID = 'ALPHAID000000001';

const ALPHA: ProjectSummary = {
  name: 'alpha',
  workflowRootPath: '/tmp/alpha',
  connection: 'active',
  creation: 'done',
  projectId: PROJECT_ID,
  pid: 1,
  lastModified: null,
  pendingApprovals: null,
};

function newMonitor(): UpstreamMonitor {
  return new UpstreamMonitor({
    upstreamBaseUrl: 'http://127.0.0.1:5000',
    onNotification: () => undefined,
  });
}

function socketAt(index: number): InstanceType<typeof ws.FakeWebSocket> {
  const socket = ws.FakeWebSocket.created[index];
  if (socket === undefined) throw new Error(`${index} 本目の接続が作られていない`);
  return socket;
}

/**
 * 開いて基準を作り終えるまで。`initial` に spec が無ければ `tasks/progress` は呼ばれないので、
 * 基準づくりは microtask を1つ流すだけで終わる。
 */
async function bringUp(index: number): Promise<void> {
  const socket = socketAt(index);
  socket.emit('open');
  socket.emit(
    'message',
    JSON.stringify({ type: 'initial', projectId: PROJECT_ID, data: { specs: [], approvals: [] } }),
  );
  await Promise.resolve();
  await Promise.resolve();
}

describe('監視対象の出入り', () => {
  beforeEach(() => {
    ws.FakeWebSocket.created.length = 0;
  });

  it('接続して基準ができたら接続済みになる', async () => {
    const monitor = newMonitor();
    monitor.sync([ALPHA]);
    await bringUp(0);

    expect(monitor.connected).toBe(true);
  });

  it('監視を降りた socket の close が後から届いても、張り直した接続を落とさない', async () => {
    const monitor = newMonitor();

    monitor.sync([ALPHA]);
    await bringUp(0);

    // 登録簿から消えた。socket を閉じるが、`close` イベントはまだ届いていない
    monitor.sync([]);
    expect(monitor.connected).toBe(false);

    // すぐ戻ってきた。別の socket を張り直して基準も作り直す
    monitor.sync([ALPHA]);
    await bringUp(1);
    expect(monitor.connected).toBe(true);

    // ここで**閉じた方**の close が届く。張り直した側の記録に当ててはいけない
    socketAt(0).emit('close');

    expect(monitor.connected).toBe(true);
  });

  it('監視を降りた socket に後から届くメッセージを、張り直した接続の基準へ混ぜない', async () => {
    const notified: unknown[] = [];
    const monitor = new UpstreamMonitor({
      upstreamBaseUrl: 'http://127.0.0.1:5000',
      onNotification: (notification) => notified.push(notification),
    });

    monitor.sync([ALPHA]);
    await bringUp(0);
    monitor.sync([]);
    monitor.sync([ALPHA]);
    await bringUp(1);

    // 閉じた socket に残っていた承認の更新。基準を作り直した後なので通知にしてはいけない
    socketAt(0).emit(
      'message',
      JSON.stringify({
        type: 'approval-update',
        projectId: PROJECT_ID,
        data: [
          {
            id: 'approval-1',
            title: '後から届いたもの',
            filePath: '.spec-workflow/specs/a/design.md',
            type: 'document',
            status: 'pending',
            createdAt: '2026-09-09T00:00:00.000Z',
            category: 'spec',
            categoryName: 'a',
          },
        ],
      }),
    );

    expect(notified).toEqual([]);
  });
});
