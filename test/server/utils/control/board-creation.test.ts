import type { Peer } from 'crossws';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addPeer, broadcastProjectCreation, removePeer } from '../../../../server/utils/control/board';
import type { BoardMessage } from '../../../../shared/types';

/**
 * 生成の配信。
 *
 * 上層への口は1本で、出来事の種類はメッセージの種別で分ける（specs/ws/delivery
 * 「新しい種類の出来事のために配信の口を増やさない」）。ここで見るのはその1本に
 * `project-creation` が乗ることと、行の中身を運ばないことである。
 */

function fakePeer() {
  const sent: BoardMessage[] = [];
  const peer = {
    send: vi.fn((data: string) => {
      sent.push(JSON.parse(data) as BoardMessage);
    }),
  } as unknown as Peer;

  return { peer, sent };
}

/** 接続時に流れる snapshot を捨てて、以後の配信だけを見る */
function connect() {
  const { peer, sent } = fakePeer();
  addPeer(peer);
  sent.length = 0;
  return { peer, sent };
}

describe('生成の配信', () => {
  let connected: ReturnType<typeof connect>;

  beforeEach(() => {
    connected = connect();
  });

  it('接続中のブラウザへ project-creation が流れる', () => {
    broadcastProjectCreation('memo-app', 'in-progress');

    expect(connected.sent).toEqual([
      { type: 'project-creation', name: 'memo-app', state: 'in-progress' },
    ]);

    removePeer(connected.peer);
  });

  it('完了と失敗も同じ種別で流れる。口は増えない', () => {
    broadcastProjectCreation('memo-app', 'done');
    broadcastProjectCreation('srvgm', 'failed');

    expect(connected.sent.map((message) => message.type)).toEqual([
      'project-creation',
      'project-creation',
    ]);
    expect(connected.sent).toEqual([
      { type: 'project-creation', name: 'memo-app', state: 'done' },
      { type: 'project-creation', name: 'srvgm', state: 'failed' },
    ]);

    removePeer(connected.peer);
  });

  it('行の中身は運ばない。名前と状態だけ', () => {
    broadcastProjectCreation('memo-app', 'done');

    expect(Object.keys(connected.sent[0]!).sort()).toEqual(['name', 'state', 'type']);

    removePeer(connected.peer);
  });

  it('接続の瞬間に流れるのは snapshot で、生成の出来事ではない', () => {
    const { peer, sent } = fakePeer();
    addPeer(peer);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe('snapshot');

    removePeer(peer);
  });

  it('外れた接続へは流れない', () => {
    removePeer(connected.peer);
    broadcastProjectCreation('memo-app', 'done');

    expect(connected.sent).toEqual([]);
  });

  it('送信で例外を投げる接続は落ちる。以後の配信で踏み続けない', () => {
    const dead = {
      send: vi.fn(() => {
        throw new Error('already closed');
      }),
    } as unknown as Peer;

    addPeer(dead);
    broadcastProjectCreation('memo-app', 'in-progress');
    broadcastProjectCreation('memo-app', 'done');

    // 1回目の snapshot で既に落ちているので、broadcast では呼ばれない
    expect((dead.send as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    removePeer(connected.peer);
  });
});
