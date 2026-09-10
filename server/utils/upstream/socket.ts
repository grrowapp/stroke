/**
 * 本家 WebSocket のクライアント。
 *
 * 接続は `ws://<host>/ws?projectId=<id>` で、アクティブなプロジェクト1つにつき1本だけ張る
 * （specs/upstream-connection）。ブラウザからはここへ繋がない。繋ぐのは Nitro だけ。
 *
 * 本家のイベントはすべてスナップショット型で「何が起きたか」を含まない。ここは受け取って
 * 検証するところまでを担い、前回値との比較は制御層が行う（structure.md の Module Boundaries）。
 */

import { WebSocket } from 'ws';

import { upstreamMessageSchema, type UpstreamMessage } from './schema';

const INITIAL_BACKOFF_MS = 1_000;

/**
 * 再接続の待ちの上限。
 *
 * backoff を初期値へ戻すのは `open` だけなので、本家が落ちている間は待ちがここまで上がり、
 * 以後そこに張り付く。**つまりこの値が、本家が戻ってきてから繋がるまでの上限そのものである。**
 * 30秒にしていた頃は、戻ってきた本家に繋がるまで最大30秒かかっていた。
 *
 * **見張り側から即座に繋ぎ直す口（`retryNow()` のようなもの）は足していない。** 見張り
 * （`server/utils/control/monitor.ts` の `sync`）が動くのは本家の登録簿を読み直す間隔
 * （`NUXT_SYNC_INTERVAL_MS`。既定30秒）で、上限と同じ粗さしか持たない。しかも
 * 「アクティブ集合に入った」瞬間は既に接続を作り直す経路（`watch`）が受けており、そちらは
 * 初期値から始まる。見張りが持つ手掛かりでは、ここより速くならない。逆に間隔を短くした
 * 環境（E2E は 300ms）でその口を叩くと、落ちている本家へ 300ms ごとに繋ぎに行くことになり、
 * backoff の目的そのものを壊す。
 *
 * 5秒なら、落ちている相手への試行は毎分12回に収まり（接続拒否は即座に返るので費用は
 * ほぼ無い）、戻ってきた本家には数秒でつながる。
 */
const MAX_BACKOFF_MS = 5_000;

export interface UpstreamSocketHandlers {
  /** 検証を通ったメッセージ */
  onMessage: (message: UpstreamMessage) => void;
  /** 接続が確立した。再接続のたびに呼ばれる */
  onOpen?: () => void;
  /** 接続が切れた。再接続は自動で試みる */
  onClose?: () => void;
  /** 形が合わないペイロードが届いた。黙って捨てずに知らせる */
  onMalformed?: (reason: string, raw: unknown) => void;
  /** 接続そのものの失敗 */
  onError?: (reason: string) => void;
}

/**
 * 1プロジェクトぶんの接続。
 *
 * 切断されたら指数バックオフで再接続を試み続ける。`close()` を呼ぶまで諦めない。
 * 本家は利用者が別途起動する前提なので、起動していない状態が普通に起こる
 * （specs/upstream-connection）。
 *
 * **`close()` を呼んだ後は、この接続について何も知らせない。** 呼び手（見張り。
 * `server/utils/control/monitor.ts`）が閉じるのは監視を降りるときで、その時点で
 * その projectId の記録は捨てられている。ところが `close()` は close frame の往復を
 * 待つので、`close` イベントが届くのはミリ秒〜秒あとになる（実測 2026-09-10: 上流と
 * こちらが CPU を取り合うと 2.4 秒。同じ時間だけ event loop も止まっていた）。届いた頃に
 * 同じプロジェクトが監視対象へ戻っていると、**張り直した別の接続の記録**へ「切れた」が
 * 当たる。記録は未接続に落ちるのに実体の socket は開いたままなので、`open` も `initial` も
 * 二度と来ない——接続済みへ戻る道が無くなる。閉じた接続に残っていたメッセージも同じで、
 * 作り直した基準へ後から混ざると通知が1件多く出る。
 */
export class UpstreamSocket {
  private socket: WebSocket | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closedByUs = false;

  constructor(
    private readonly baseUrl: string,
    private readonly projectId: string,
    private readonly handlers: UpstreamSocketHandlers,
  ) {}

  connect(): void {
    if (this.closedByUs) return;
    // 同じプロジェクトに2本張らない（specs/upstream-connection）
    if (this.socket !== null) return;

    const socket = new WebSocket(this.endpoint());
    this.socket = socket;

    socket.on('open', () => {
      if (this.closedByUs) return;
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.handlers.onOpen?.();
    });

    socket.on('message', (data) => {
      if (this.closedByUs) return;
      this.receive(data);
    });

    socket.on('error', (error) => {
      if (this.closedByUs) return;
      this.handlers.onError?.(error instanceof Error ? error.message : String(error));
    });

    socket.on('close', () => {
      this.socket = null;
      if (this.closedByUs) return;
      this.handlers.onClose?.();
      this.scheduleReconnect();
    });
  }

  /** 明示的に閉じる。以後は再接続しない */
  close(): void {
    this.closedByUs = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.socket?.close();
    this.socket = null;
  }

  private endpoint(): string {
    const url = new URL('/ws', this.baseUrl);
    // http(s) で受け取った本家 URL を ws(s) に読み替える
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('projectId', this.projectId);
    return url.toString();
  }

  private receive(data: unknown): void {
    let raw: unknown;
    try {
      raw = JSON.parse(String(data));
    } catch (error) {
      this.handlers.onMalformed?.(error instanceof Error ? error.message : String(error), data);
      return;
    }

    const parsed = upstreamMessageSchema.safeParse(raw);
    if (!parsed.success) {
      // 形が変わったときに黙って通さない（tech.md の Security Practices）
      this.handlers.onMalformed?.(parsed.error.message, raw);
      return;
    }

    this.handlers.onMessage(parsed.data);
  }

  private scheduleReconnect(): void {
    if (this.closedByUs) return;

    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
