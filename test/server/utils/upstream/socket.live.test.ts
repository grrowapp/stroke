/**
 * 稼働中の本家に対する WebSocket 実疎通。`yarn test:live` で走らせる。
 */

import { describe, expect, it } from 'vitest';

import { UpstreamSocket } from '../../../../server/utils/upstream/socket';
import type { UpstreamMessage } from '../../../../server/utils/upstream/schema';

const baseUrl = process.env.NUXT_UPSTREAM_BASE_URL ?? 'http://127.0.0.1:5000';

async function anyProjectId(): Promise<string> {
  const list = (await fetch(`${baseUrl}/api/projects/list`).then((r) => r.json())) as {
    projectId: string;
  }[];
  const first = list[0];
  if (!first) throw new Error('本家にアクティブなプロジェクトが1件も無い');
  return first.projectId;
}

/** 接続して、指定の type が届くまで待つ */
function collectUntil(projectId: string, wanted: string, timeoutMs = 5_000) {
  return new Promise<{ messages: UpstreamMessage[]; malformed: string[] }>((resolve, reject) => {
    const messages: UpstreamMessage[] = [];
    const malformed: string[] = [];

    const socket = new UpstreamSocket(baseUrl, projectId, {
      onMessage: (message) => {
        messages.push(message);
        if (message.type === wanted) {
          socket.close();
          resolve({ messages, malformed });
        }
      },
      onMalformed: (reason) => malformed.push(reason),
      onError: (reason) => {
        socket.close();
        reject(new Error(reason));
      },
    });

    socket.connect();

    setTimeout(() => {
      socket.close();
      reject(new Error(`${wanted} が ${timeoutMs}ms 以内に届かなかった`));
    }, timeoutMs);
  });
}

describe('本家 WebSocket', () => {
  it('接続すると initial が届く', async () => {
    const { messages } = await collectUntil(await anyProjectId(), 'initial');
    const initial = messages.find((m) => m.type === 'initial');
    expect(initial).toBeDefined();
  });

  it('届いたメッセージがすべてスキーマを通る', async () => {
    const { malformed } = await collectUntil(await anyProjectId(), 'initial');
    expect(malformed).toEqual([]);
  });

  it('接続直後に projects-update も届く', async () => {
    const { messages } = await collectUntil(await anyProjectId(), 'initial');
    expect(messages.some((m) => m.type === 'projects-update')).toBe(true);
  });

  it('繋がらない先では onError か onClose を経て再接続を試み続ける', async () => {
    const events: string[] = [];
    const socket = new UpstreamSocket('http://127.0.0.1:59999', 'x', {
      onMessage: () => {},
      onError: () => events.push('error'),
      onClose: () => events.push('close'),
    });

    socket.connect();
    await new Promise((r) => setTimeout(r, 500));
    socket.close();

    expect(events.length).toBeGreaterThan(0);
  });
});
