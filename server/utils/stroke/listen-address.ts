import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Server } from 'node:net'

/**
 * claude に渡す自前 MCP サーバー（`/mcp`）の base URL を、**設定の固定値ではなく実際の
 * 待ち受けから**組み立てる（provide-operations-via-mcp 続き）。
 *
 * 旧実装は `runtimeConfig.claude.apiBaseUrl`（`nuxt.config.ts` に手で書いた
 * `http://127.0.0.1:3599`）をそのまま使っていたが、待ち受けを決めるのは別の値
 * （`devServer.port` と `package.json` の `nuxt dev --port 3100`）で、両者が一致する保証が
 * 無かった。実測 2026-09-01: `yarn dev` は 3100 で listen するのに、設定は 3599 を指し
 * ECONNREFUSED になっていた。
 *
 * **claude は必ずこのプロセスと同じマシン上で子プロセスとして起こす**（`claude.ts` の
 * `spawn`）ので、接続先ホストは常に loopback（`127.0.0.1`）でよい。実際の待ち受けから
 * 取るべきは**ポートだけ**である。
 *
 * ## dev（`nuxt dev`）
 *
 * Nitro の実行時フックに listen は無い（`node_modules/nitropack/dist/core/index.d.mts:84-92`
 * で確認済み。あるのは `close` / `error` / `request` / `beforeResponse` / `afterResponse` /
 * `render:before` / `render:response` の7つだけ）。
 *
 * 一方 `nuxt.config.ts` の `hooks.listen(server)` には、実際に bind された Node の
 * `http.Server` が渡る（`node_modules/@nuxt/cli/dist/dev-DHhrJk9w.mjs`:
 * `this.listener = await listen(handler, opts)` の直後に
 * `hooks.callHook('listen', this.listener.server, this.listener)`——`listen()` が
 * resolve した後なので `server.address()` は必ず値を持つ）。ただし **dev でしか呼ばれない**
 * （同ファイルの docblock。ビルド済みの出力はこのファイルを読まないので実行されない）。
 *
 * **`hooks.listen` と Nitro のサーバー側コード（`server/` 配下）は別プロセスで動く。**
 * 当初は同一プロセス（`nuxt dev` が既定でフォークする1子プロセスの中）だと仮定し、
 * `globalThis` + `Symbol.for` で橋渡しする実装を書いたが、**実機で誤りと判明した**
 * （2026-09-01: `hooks.listen` 側に置いた `console.log` は出るのに、同じ関数の中
 * （このモジュール）に置いた `console.log` が一度も出ない——`server/plugins/01.reap-running.ts`
 * が 30 秒待っても listen アドレスを見つけられずタイムアウトした実測ログで確認した）。
 * `globalThis` は同一プロセス（同一 JS realm）でなければ共有されないので、これは
 * `hooks.listen` と Nitro のサーバー側コードが別プロセス（または別 realm）で動いている
 * ことの動かぬ証拠である。理由の特定（別 child_process か vm.Context か）までは追わず、
 * **プロセス境界をまたいでも成立する手段**（ファイル）に切り替えた。
 *
 * 橋渡しはファイル1本（`.nuxt/` 配下。`.gitignore` 済みの生成物置き場）。`hooks.listen`
 * 側（書き手）が bind されたポートと自分の pid を書き、Nitro 側（読み手）がそれを読む。
 * **pid の生死を確かめてから使う**——前回の（もう死んでいる）`yarn dev` が残した古い
 * ファイルを、今回の `hooks.listen` がまだ書き直していない一瞬に読んでしまうと、待ち受けを
 * 誤って埋め直すのと同じことになる（直したかった不一致を作り直すだけ）。pid が生きていれば
 * 「いまの `yarn dev` が書いたもの」とみなせる——`yarn dev` の一連のプロセスは互いを
 * kill せずに生かしたまま動くので、書いた側の pid が生きている限り値は現在のものである。
 *
 * ## ビルド済み（`nuxt build` の `.output`）
 *
 * `nuxt.config.ts` はビルド出力から読まれず、`hooks.listen` は呼ばれない（実測:
 * `.output` を grep して該当なし）。ビルド済みの起動口
 * （`node_modules/nitropack/dist/presets/node/runtime/node-server.mjs`）は
 *
 * ```
 * const port = destr(process.env.NITRO_PORT || process.env.PORT) || 3e3;
 * const host = process.env.NITRO_HOST || process.env.HOST;
 * ```
 *
 * で listen する。**この起動口とここのコードは同じプロセス内で動く**ので、同じ環境変数を
 * 同じ優先順位で読めば、待ち受けと必ず一致する（env は起動時に決まってプロセス中で
 * 不変なので、`node-server.mjs` が読むタイミングとここが読むタイミングがずれても値は
 * 変わらない——dev のような「listen 前に呼ばれる」競合は起きない。ファイル越しの橋渡しも
 * 要らない）。
 *
 * dev / ビルド済みの切り分けは `import.meta.dev`（Nitro がビルド時に静的差し替える定数。
 * `node_modules/nitropack/dist/rollup/index.mjs` の `staticFlags.dev` →
 * `import.meta.${key}` を `JSON.stringify(val)` へ置換する箇所で確認済み）を見る。
 * vitest 経由（Nitro のバンドルを通らない）ではこの置換が効かず `import.meta.dev` は
 * `undefined` になるので、テストは env ベースの経路を通る——テストはこのモジュール自体を
 * `vi.mock` して差し替える。
 *
 * ## 未対応
 *
 * `NITRO_UNIX_SOCKET`（unix socket 待ち受け）はここでは扱わない。このリポジトリでは
 * どの起動経路も使っていない（`package.json` の `dev` は `nuxt dev --port 3100`）。
 */

/** dev の listen アドレスを橋渡しするファイル。`.nuxt/` は `.gitignore` 済みの生成物置き場。 */
const DEV_LISTEN_FILE = join(process.cwd(), '.nuxt', 'stroke-board-dev-listen.json')

interface DevListenRecord {
  /** 実際に bind されたポート */
  port: number
  /** 書いた側（`hooks.listen` が動くプロセス）の pid。生死で新旧を見分ける */
  pid: number
}

/**
 * dev 専用。`nuxt.config.ts` の `hooks.listen(server)` から呼ぶ。
 *
 * unix socket（`server.address()` が `string`）は対象外。今のところどの起動経路も
 * unix socket を使わないので、来ても静かに無視する。
 */
export function recordDevListenAddress(server: Server): void {
  const info = server.address()
  if (info === null || typeof info === 'string') return
  const record: DevListenRecord = { port: info.port, pid: process.pid }
  mkdirSync(dirname(DEV_LISTEN_FILE), { recursive: true })
  writeFileSync(DEV_LISTEN_FILE, JSON.stringify(record))
}

/** signal 0 は送らずに存在だけを確かめる（`reap.ts` の `isAlive` と同じ手口）。 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ESRCH')
  }
}

/**
 * いま読める記録を返す。**書いたプロセスがもう死んでいれば無視する**（前回の `yarn dev`
 * が残した古い値を、今回の `hooks.listen` がまだ上書きしていない一瞬に拾わないため）。
 */
function readDevListenRecord(): DevListenRecord | undefined {
  let raw: string
  try {
    raw = readFileSync(DEV_LISTEN_FILE, 'utf8')
  } catch {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined

  const { port, pid } = parsed as Record<string, unknown>
  if (typeof port !== 'number' || typeof pid !== 'number') return undefined
  if (!isProcessAlive(pid)) return undefined

  return { port, pid }
}

/** ビルド済み出力の起動口（`node-server.mjs`）と同じ規則・同じ既定値で解決する。 */
function portFromEnv(): number {
  const raw = process.env.NITRO_PORT || process.env.PORT
  const parsed = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000
}

function toUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

/** listen を待ってよい経路（起動時に1回だけの処理）が、値が定まるまで待つ間隔・上限。 */
const LISTEN_POLL_INTERVAL_MS = 50
const LISTEN_WAIT_TIMEOUT_MS = 30_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * いま分かっている待ち受けから base URL を組み立てる。**同期。**
 *
 * dev で `hooks.listen` がまだ一度も呼ばれていなければ（= 記録ファイルが無い、または
 * 生きていないプロセスが書いた古いものしか無い）throw する——分からないものを既定値で
 * 埋めると、直したかった不一致（設定値と実際の待ち受けのずれ）を作り直すだけになる。
 *
 * 呼び出し元（`invoke.ts` の `buildRun`）は HTTP リクエストを受けて初めて呼ばれるので、
 * 通常はその時点で dev サーバーは必ず listen 済みである。ただし内部 `$fetch`
 * （`server/plugins/01.retry-failed.ts` の起動直後の巡回など）はソケットの listen を
 * 経由せず呼ばれ得るため、稀に listen 前に呼ばれることがある——その場合はここで throw し、
 * `invokeAi` の組み立て失敗経路が `failed` として記録する。60秒ごとの巡回
 * （`01.retry-failed.ts`）がそれを拾い直すころには listen は済んでいる。
 */
export function currentApiBaseUrl(): string {
  if (!import.meta.dev) return toUrl(portFromEnv())

  const record = readDevListenRecord()
  if (record === undefined) {
    throw new Error('dev サーバーの待ち受けポートがまだ分からない（listen より前に呼ばれた）')
  }
  return toUrl(record.port)
}

/**
 * 待ち受けが分かるまで待ってから base URL を返す。**起動時に1回だけの処理**
 * （`server/plugins/01.reap-running.ts`）専用。
 *
 * この処理は次回の巡回による拾い直しが無い（`01.retry-failed.ts` は `failed` だけを拾い、
 * 起動時の後始末は起動のたびに1回きりである）。`currentApiBaseUrl` のように
 * 即座に throw すると、dev で listen が済むわずかな間に起動が重なっただけで、
 * サーバー再起動をまたいで残った `running` を一度も後始末できないまま終わる。
 * 待てるだけ待ってから解決する。
 */
export async function resolveApiBaseUrlOnceListening(): Promise<string> {
  if (!import.meta.dev) return toUrl(portFromEnv())

  let record = readDevListenRecord()
  const deadline = Date.now() + LISTEN_WAIT_TIMEOUT_MS
  while (record === undefined) {
    if (Date.now() > deadline) {
      throw new Error(`dev サーバーの listen を ${LISTEN_WAIT_TIMEOUT_MS}ms 待ったが起こらなかった`)
    }
    await sleep(LISTEN_POLL_INTERVAL_MS)
    record = readDevListenRecord()
  }
  return toUrl(record.port)
}
