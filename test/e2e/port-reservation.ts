/**
 * E2E の待ち受けポートを、**同じマシンで並ぶ実行どうしが奪い合わない形で確保する。**
 *
 * `playwright.config.ts` から切り出してある。切り出したのは、確保の当たり外れを素の vitest で
 * 固定したかったため（`port-reservation.test.ts`）。設定ファイルのままだと、import しただけで
 * `.e2e-tmp` の消去や `refuseRealTargets()` といった副作用まで走ってしまい、確保だけを
 * 試せない。
 *
 * ## 直した事故（2026-09-09）
 *
 * 全体実行が 39 件 `connect ECONNREFUSED 127.0.0.1:50000` で落ちた。上流スタブが途中から
 * 応答しなくなり、以後の spec が全滅している。同時刻に別の作業ツリー
 * （`update-session-api-handler`）の E2E が同じ 50000 番を取っていた。
 *
 * 旧実装は「空きか」を probe で確かめ、**probe を閉じてから番号を返していた**（確保ではなく
 * 観測）。旧コメントはこの TOCTOU を認めたうえで「順に上がる作りなので、同時に走る2本が
 * 同じ番号で止まり続けることはない——先に取った側が使い始めれば、次の実行はその上を見る」と
 * 正当化していたが、**この理屈は後から始まった実行にしか当てはまらない。** ほぼ同時に
 * 始まった2本は、どちらもまだ誰も listen していない 50000 を見て、揃って同じ番号を選ぶ。
 * 「隙は残るが実害は無い」は誤りだった。
 *
 * ## 採った手：予約ファイルの排他作成
 *
 * `os.tmpdir()` の下に予約の置き場を持ち、番号ごとに1本のファイルを `wx`（排他作成）で
 * 作る。作れた側だけがその番号を持つ。`open(2)` の `O_CREAT|O_EXCL` は同じ
 * ファイルシステム上で原子的なので、**同時に来た2本のうち必ず一方だけが成功する**。
 * probe（実際に listen できるか）は予約を取った後にも掛ける——予約の仕組みを知らない
 * 無関係のプロセスが既にその番号を使っていることはあるため。
 *
 * `os.tmpdir()` に置くのは、作業ツリーをまたいで見える場所が要るからである。予約の相手は
 * 別ツリーの実行なので、ツリーの中（`.e2e-tmp` など）に置いても互いに見えない。
 *
 * ### 採らなかった案
 *
 * - **探し始める番号を実行ごとにばらす（乱数・pid など）。** 衝突の確率を下げるだけで
 *   無くならない。落ちるのは全体実行の途中なので、たまに全滅する形は残る。加えて
 *   どの番号を使うかがログを見るまで見当も付かなくなる。予約と併用する意味も薄い——
 *   予約が効いていれば線形の走査で必ず別々の番号に落ちる。
 * - **OS に任せる（`listen(0)`）。** 確保としては確実だが、割り当てが ephemeral の帯に
 *   当たる。そこは他のプロセスが一時的な発信元として使う帯でもあり、避けるという既存の
 *   判断（`PORT_SEARCH_START` の docblock）を崩さない。
 * - **listen したままの probe を本番へ渡す（socket の受け渡し）。** 隙は完全に消えるが、
 *   待ち受けるのは別プロセス（スタブと `.output` のサーバー）で、fd を渡す口が無い。
 */

import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 探し始める番号。**50000 から上だけを使う。**
 *
 * OS に任せる（`listen(0)`）と ephemeral の範囲から選ばれ、そこは他のプロセスが
 * 一時的な発信元として使う帯でもある。ここを避けて、E2E は 50000 以上に固定で寄せる。
 * どのポートを使ったかはログに出るので、人が見つけたいときも範囲が分かっていればよい。
 */
export const PORT_SEARCH_START = 50000;

/** 上限。ここまで空きが無ければ、待ち受けではなく環境の問題として落とす */
export const PORT_SEARCH_END = 60000;

/**
 * 予約の置き場。**作業ツリーの外**（`os.tmpdir()`）に固定する。
 *
 * 奪い合う相手は別ツリーの実行なので、ツリーの中に置くと互いの予約が見えない。
 * 名前を1つに決めてあるので、同じマシンの E2E は全員ここを見る。
 */
export const RESERVATION_DIR = join(tmpdir(), 'stroke-board-e2e-ports');

/** 予約1件。`release()` を呼ぶまでその番号は他の実行から見て埋まっている */
export interface PortReservation {
  readonly port: number;
  /** 予約を解く。二重に呼んでも害はない */
  release: () => void;
}

export interface ReserveOptions {
  /** 予約の置き場。既定は `RESERVATION_DIR`。テストが実物と混ざらないために差し替える */
  dir?: string;
  /** 走査の上限。既定は `PORT_SEARCH_END` */
  until?: number;
  /**
   * 「その番号で実際に待ち受けられるか」の判定。既定は本物の probe。
   *
   * 差し替え口を開けてあるのは、確保の当たり外れ（誰がどの番号を取るか）を、実機の
   * ポートの空き具合に左右されずに固定したいためである。**本番はこの引数を渡さない。**
   */
  isFree?: (port: number) => Promise<boolean>;
}

/** その番号で待ち受けられるか。使用中なら false を返し、それ以外の失敗は投げる */
export async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(error);
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(true));
    });
  });
}

/** その pid のプロセスが生きているか。`EPERM` は「他人のプロセスとして生きている」 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 既にある予約が死んでいるか（奪い返してよいか）。
 *
 * 異常終了した実行の予約は残る。`release()` は正常終了の経路にしか無い——SIGINT などに
 * 独自の handler を足すと Node 既定の終了そのものを止めてしまうので、**信号は捕まえない**。
 * 残骸を片付けるのはこちら側の役目にしてある。
 *
 * 判定は書いた pid の生死。読めない・壊れているものも死んだ扱いにする（書きかけのまま
 * 落ちた残骸なので、持ち主はもういない）。
 *
 * **pid の使い回しには負ける。** 死んだ実行の pid が無関係のプロセスへ回っていると生存と
 * 見なして次の番号へ上がるが、番号を1つ飛ばすだけで実害は無い。
 */
function isStale(path: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return true;
  }

  try {
    const pid = (JSON.parse(raw) as { pid?: unknown }).pid;
    if (typeof pid !== 'number') return true;
    return !isAlive(pid);
  } catch {
    return true;
  }
}

/**
 * その番号の予約を取る。取れたら true。
 *
 * 死んだ予約は消してから1度だけ取り直す。取り直しで再び埋まっているのは、同じ残骸を
 * 別の実行も奪いに来て先を越された場合で、そのときは諦めて次の番号へ譲る（両方が
 * 奪い返して同じ番号を持つことは無い——勝つのは `wx` が通った1本だけである）。
 */
function claim(dir: string, port: number): boolean {
  const path = join(dir, String(port));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, 'wx');
      try {
        writeSync(fd, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`);
      } finally {
        closeSync(fd);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (!isStale(path)) return false;
      rmSync(path, { force: true });
    }
  }

  return false;
}

/** まだ解いていない予約。プロセスが終わるときにまとめて解く */
const held = new Set<PortReservation>();

let exitHookInstalled = false;

/**
 * 終了時の解放を一度だけ仕掛ける。
 *
 * 予約ごとに `process.on('exit')` を足すと listener が積み上がって警告になるので、
 * 束ねて1本にしてある。`exit` の中では非同期が動かないため、解放は同期の `rmSync`。
 */
function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => {
    for (const reservation of [...held]) reservation.release();
  });
}

/**
 * `from` から上へ、**確保できた**番号を1つ返す。
 *
 * 予約が取れただけでは足りない。予約の仕組みを知らないプロセス（別の作業ツリーの dev
 * サーバー、無関係の常駐など）が既にその番号を使っていることはあるので、予約の後に probe を
 * 掛け、埋まっていれば予約を解いて次へ上がる。
 *
 * probe を閉じてから本番が待ち受けるまでの隙そのものは残るが、**そこへ割り込めるのは
 * 予約を見ない他人だけ**になった。並ぶ E2E どうしは予約ファイルで必ず別の番号に落ちる。
 */
export async function reservePort(from: number, options: ReserveOptions = {}): Promise<PortReservation> {
  const dir = options.dir ?? RESERVATION_DIR;
  const until = options.until ?? PORT_SEARCH_END;
  const free = options.isFree ?? isPortFree;

  mkdirSync(dir, { recursive: true });

  for (let port = from; port < until; port += 1) {
    if (!claim(dir, port)) continue;

    const path = join(dir, String(port));

    // probe が「埋まっている」と答えたときも、途中で投げたときも、取った予約は必ず戻す。
    // 戻さないと、誰も使っていない番号がこのマシンで死んだまま残る
    let usable: boolean;
    try {
      usable = await free(port);
    } catch (error) {
      rmSync(path, { force: true });
      throw error;
    }
    if (!usable) {
      rmSync(path, { force: true });
      continue;
    }

    const reservation: PortReservation = {
      port,
      release: () => {
        if (!held.delete(reservation)) return;
        rmSync(path, { force: true });
      },
    };
    held.add(reservation);
    installExitHook();
    return reservation;
  }

  throw new Error(`${from}〜${until} に空きポートが無い`);
}
