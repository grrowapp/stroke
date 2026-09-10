import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpstreamSocket } from '../../../../server/utils/upstream/socket';

/**
 * 再接続の待ち方を見る。
 *
 * 本家は利用者が別途起動する前提なので、落ちている状態が普通に起こる
 * （openspec/specs/upstream-connection）。落ちている相手を叩き続けないための backoff は
 * 要るが、**戻ってきた本家に繋がるまでの時間もこの backoff が決める**——初期値へ戻すのは
 * `open` だけなので、一度も繋がらないまま失敗が続くと待ちは上限に張り付く。ここで固定
 * するのは、その張り付いた先が数秒に収まることである。
 *
 * 本物の `ws` は使わない。見たいのは「いつ次の試行を出すか」だけで、そこに相手は要らない。
 */

/** `ws` の差し替え。作られた接続を順に取っておき、テストから `open` / `close` を起こす */
const ws = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class FakeWebSocket {
    /** 作られた順。`connect()` が何度呼ばれたかがそのまま試行の回数になる */
    static readonly attempts: FakeWebSocket[] = [];

    private readonly handlers = new Map<string, Handler[]>();

    constructor(readonly url: string) {
      FakeWebSocket.attempts.push(this);
    }

    on(event: string, handler: Handler): void {
      const registered = this.handlers.get(event) ?? [];
      registered.push(handler);
      this.handlers.set(event, registered);
    }

    /** 相手が居ないときの `ws` と同じ順で落とす（`error` のあとに `close`） */
    refuse(): void {
      this.emit('error', new Error('接続拒否'));
      this.emit('close');
    }

    open(): void {
      this.emit('open');
    }

    close(): void {
      this.emit('close');
    }

    private emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }

  return { FakeWebSocket };
});

vi.mock('ws', () => ({ WebSocket: ws.FakeWebSocket }));

/** 何回失敗させても待ちが伸び切ることを見たいので、上限に届くだけ繰り返す */
const ATTEMPTS = 20;

/** 「数秒以内に戻ってくる」の上限。ここを超えると E2E の `resetBoard` が待ち切れない */
const RECOVERY_LIMIT_MS = 5_000;

function newSocket(): UpstreamSocket {
  return new UpstreamSocket('http://127.0.0.1:5000', 'PROJECTID0000001', {
    onMessage: () => undefined,
  });
}

function latest(): InstanceType<typeof ws.FakeWebSocket> {
  const socket = ws.FakeWebSocket.attempts.at(-1);
  if (socket === undefined) throw new Error('接続が1本も作られていない');
  return socket;
}

/**
 * 次の試行が出るまで時計を進め、待たされた時間を返す。
 *
 * 100ms 刻みで足りる。見るのは秒の桁であって、1ms の精度ではない。
 */
function advanceToNextAttempt(): number {
  const before = ws.FakeWebSocket.attempts.length;
  let waited = 0;

  while (ws.FakeWebSocket.attempts.length === before) {
    vi.advanceTimersByTime(100);
    waited += 100;
    if (waited > 60_000) throw new Error('再接続が来ない');
  }

  return waited;
}

describe('本家への接続の張り直し', () => {
  beforeEach(() => {
    ws.FakeWebSocket.attempts.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('一度も open しないまま失敗が続いても、次の試行までの待ちが上限に張り付いたままにならない', () => {
    const socket = newSocket();
    socket.connect();

    const waits: number[] = [];
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      latest().refuse();
      waits.push(advanceToNextAttempt());
    }

    // 落ちている相手を叩き続けない。失敗が続けば待ちは伸びる（backoff は残っている）
    expect(waits.slice(0, 2)).toEqual([1_000, 2_000]);
    // 伸び切った先が数秒に収まる。本家が戻ってきたらここまでの待ちで繋がる
    expect(Math.max(...waits)).toBeLessThanOrEqual(RECOVERY_LIMIT_MS);
  });

  it('繋がったら待ちは初期値へ戻る', () => {
    const socket = newSocket();
    socket.connect();

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      latest().refuse();
      advanceToNextAttempt();
    }

    // 本家が戻ってきた
    latest().open();
    latest().close();

    expect(advanceToNextAttempt()).toBeLessThanOrEqual(1_000);
  });

  it('同じプロジェクトに2本張らない', () => {
    const socket = newSocket();
    socket.connect();
    socket.connect();

    expect(ws.FakeWebSocket.attempts).toHaveLength(1);
  });

  it('close したら再接続しない', () => {
    const socket = newSocket();
    socket.connect();
    socket.close();

    vi.advanceTimersByTime(60_000);

    expect(ws.FakeWebSocket.attempts).toHaveLength(1);
  });
});
