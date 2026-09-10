/**
 * ポート確保の当たり外れを固定する。
 *
 * 直したのは「同時に始まった2本が同じ番号を掴む」事故（`port-reservation.ts` の docblock）
 * なので、**同時に来た2つが別の番号を得る**ことをここで押さえる。旧実装（probe して閉じて
 * 返すだけ）はこのテストで落ちる——どちらの呼びも「空き」と見て同じ番号を返すためである。
 *
 * probe（実際に listen できるか）は既定を使わず差し替える。実機の 50000 番台は他の作業ツリーの
 * E2E が使っていることがあり、既定のままだと「誰が何番を取るか」がマシンの状況で変わって
 * しまう。実物の probe を通す経路は最後の1本だけで、そこは番号を決め打ちにしない。
 *
 * 予約の置き場も毎回使い捨ての一時ディレクトリへ向ける。実物（`os.tmpdir()` の
 * `stroke-board-e2e-ports`）を触ると、同時に走っている本物の E2E の予約を壊しうる。
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isPortFree, reservePort, type PortReservation, type ReserveOptions } from './port-reservation';

/** 実機のポートを見ない probe。番号の当たり外れを予約の仕組みだけで決めさせる */
const alwaysFree = async (): Promise<boolean> => true;

/** テストが使う番号の帯。実機を見ないので実在の空きとは無関係でよい */
const FROM = 51000;

let dir: string;
let reservations: PortReservation[];
let listeners: Server[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'port-reservation-test-'));
  reservations = [];
  listeners = [];
});

afterEach(async () => {
  for (const reservation of reservations) reservation.release();
  await Promise.all(
    listeners.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  rmSync(dir, { recursive: true, force: true });
});

/** 後始末に載せて予約を取る */
async function take(from: number, options: ReserveOptions = {}): Promise<PortReservation> {
  const reservation = await reservePort(from, { dir, isFree: alwaysFree, ...options });
  reservations.push(reservation);
  return reservation;
}

describe('reservePort', () => {
  it('同じ番号を同時に取りに来た2つが別の番号を得る', async () => {
    const [first, second] = await Promise.all([take(FROM), take(FROM)]);

    expect(first.port).not.toBe(second.port);
    expect([first.port, second.port].sort((a, b) => a - b)).toEqual([FROM, FROM + 1]);
  });

  it('同時に10本来ても全部が別の番号になる', async () => {
    const taken = await Promise.all(Array.from({ length: 10 }, () => take(FROM)));
    const ports = taken.map((reservation) => reservation.port);

    expect(new Set(ports).size).toBe(10);
    expect([...ports].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 10 }, (_, index) => FROM + index),
    );
  });

  it('予約は解くまで残り、解けば同じ番号が取り直せる', async () => {
    const first = await take(FROM);
    expect(first.port).toBe(FROM);

    const second = await take(FROM);
    expect(second.port).toBe(FROM + 1);

    first.release();
    expect(readdirSync(dir)).toEqual([String(FROM + 1)]);

    const third = await take(FROM);
    expect(third.port).toBe(FROM);
  });

  it('解放は二重に呼んでも、他の予約を巻き込まない', async () => {
    const first = await take(FROM);
    const second = await take(FROM);

    first.release();
    first.release();

    expect(readdirSync(dir)).toEqual([String(second.port)]);
  });

  it('生きている pid の予約は奪わない', async () => {
    writeFileSync(join(dir, String(FROM)), JSON.stringify({ pid: process.pid, at: 'いま' }));

    const reservation = await take(FROM);

    expect(reservation.port).toBe(FROM + 1);
  });

  it('死んだ pid が残した予約は奪い返す', async () => {
    // 死んだ pid。`process.kill(pid, 0)` が ESRCH（そんなプロセスは無い）と答える番号を
    // 上限の近くから探す。EPERM は他人のプロセスとして生きているので採らない
    let dead = 0;
    for (let candidate = 2 ** 22 - 1; candidate > 2 ** 22 - 1000; candidate -= 1) {
      try {
        process.kill(candidate, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
          dead = candidate;
          break;
        }
      }
    }
    expect(dead).toBeGreaterThan(0);

    writeFileSync(join(dir, String(FROM)), JSON.stringify({ pid: dead, at: '前の run' }));

    const reservation = await take(FROM);

    expect(reservation.port).toBe(FROM);
    expect(JSON.parse(readFileSync(join(dir, String(FROM)), 'utf8'))).toMatchObject({
      pid: process.pid,
    });
  });

  it('書きかけで壊れた予約も奪い返す', async () => {
    writeFileSync(join(dir, String(FROM)), '');

    const reservation = await take(FROM);

    expect(reservation.port).toBe(FROM);
  });

  it('予約が取れても実際に埋まっている番号は使わない', async () => {
    const busy = new Set([FROM, FROM + 1]);
    const reservation = await take(FROM, { isFree: async (port) => !busy.has(port) });

    expect(reservation.port).toBe(FROM + 2);
    // 見送った番号の予約は残さない。次の実行が使えなくなる
    expect(readdirSync(dir)).toEqual([String(FROM + 2)]);
  });

  it('probe が投げても予約を残さない', async () => {
    await expect(
      reservePort(FROM, {
        dir,
        isFree: async () => {
          throw new Error('probe が壊れた');
        },
      }),
    ).rejects.toThrow('probe が壊れた');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('上限まで空きが無ければ落ちる', async () => {
    await expect(reservePort(FROM, { dir, isFree: async () => false, until: FROM + 3 })).rejects.toThrow(
      `${FROM}〜${FROM + 3} に空きポートが無い`,
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it('本物の probe は、実際に listen されている番号を空きと見ない', async () => {
    // ここだけ実機のポートを見る。番号は決め打ちにできないので、まず1つ確保してから
    // その上に本物の listener を立て、次の確保がその番号を避けることを見る
    const anchor = await take(FROM, { isFree: isPortFree });
    const occupied = anchor.port + 1;

    const server = createServer();
    listeners.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(occupied, '127.0.0.1', () => resolve());
    });

    expect(await isPortFree(occupied)).toBe(false);

    const next = await take(anchor.port, { isFree: isPortFree });
    expect(next.port).toBeGreaterThan(occupied);
  });
});
