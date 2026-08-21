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
const MAX_BACKOFF_MS = 30_000;

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
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.handlers.onOpen?.();
    });

    socket.on('message', (data) => this.receive(data));

    socket.on('error', (error) => {
      this.handlers.onError?.(error instanceof Error ? error.message : String(error));
    });

    socket.on('close', () => {
      this.socket = null;
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
