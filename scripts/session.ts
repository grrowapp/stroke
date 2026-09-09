import nuxtConfig from '../nuxt.config'
import {
  createSession,
  deleteSession,
  listSessions,
  readStoredInvocation,
} from '../server/handler/session'
import { parseStrokeConfig } from '../server/utils/stroke/config'

/**
 * サーバが動いていなくても使えるセッション管理（specs/tools/session-cli）。
 * `yarn session <create|delete|list>` として tsx で実行する。実体は endpoint と同じ
 * handler（server/handler/session.ts）で、endpoint を叩かず、サーバの稼働に依存しない。
 *
 * ここが CLI 側の**設定を引く端**である。`useRuntimeConfig()` は Nitro の外では使えないが、
 * `nuxt.config.ts` は tsx から普通に import できる（実測確認済み）。設定は環境変数から
 * 読まないので、endpoint と同じ値に解決される（docs/specs/core/settings-reference.md）。
 */
const config = parseStrokeConfig(nuxtConfig.runtimeConfig)
const root = config.projectShareRoot

const USAGE = `使い方:
  yarn session create "<概要>"   概要でセッションを作る（概要は必須）
  yarn session delete <uuid>     セッションを消す（実行中は受理しない）
  yarn session list              残っているセッションを一覧する`

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2)

  switch (command) {
    case 'create': {
      if (!arg?.trim()) fail(`概要が必要。\n${USAGE}`)
      // AI の呼び出しはここでは起きないので invocation は idle で書く（design.md 決定3）
      const sessionId = await createSession(root, arg, 'idle')
      // 返答は転送予定先（画面1）の URL。開けばセッションが進む。
      //
      // **`claude.apiBaseUrl` はもう無い**（provide-operations-via-mcp 続き。claude に渡す
      // MCP の url は実際の待ち受けから組み立てる方へ移した——`server/utils/stroke/listen-address.ts`）。
      // このスクリプトはサーバの外（`tsx`）で動く独立プロセスなので、その実際の待ち受けを
      // 観測する手段を持たない。`nuxt.config.ts` の `devServer` から**近似**を組み立てる
      // （`package.json` の `dev` スクリプトが `--port` で上書きしていれば、この値とはずれる。
      // 既知の限界——最終報告に書いた）
      console.log(`${displayUrl(nuxtConfig.devServer)}/strokes/${sessionId}`)
      return
    }
    case 'delete': {
      if (!arg) fail(`セッション uuid が必要。\n${USAGE}`)
      // サーバ無しの実行中判定は state.json の invocation を材料にする（design.md 決定5）
      if ((await readStoredInvocation(root, arg)) === 'running') {
        fail('このセッションは実行中の記録を持つ。呼び出しが終わってから消すこと。')
      }
      await deleteSession(root, arg)
      console.log(`deleted: ${arg}`)
      return
    }
    case 'list': {
      const sessions = await listSessions(root)
      if (sessions.length === 0) {
        console.log('セッションは残っていない。')
        return
      }
      for (const s of sessions) console.log(`${s.id}\t${s.phase}\t${s.updatedAt}`)
      return
    }
    default:
      fail(USAGE)
  }
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/**
 * `nuxt.config.ts` の `devServer` から人が開けるブラウザ URL を組み立てる。
 *
 * `host: '0.0.0.0'` は「全インタフェースで待つ」という bind 用の意味で、ブラウザに
 * 打ち込める宛先ではない。`localhost` に丸める（`::`/`::0` も同様）。
 */
function displayUrl(devServer: { host?: string, port: number }): string {
  const host = devServer.host
  const normalized = host === undefined || host === '0.0.0.0' || host === '::' || host === '::0'
    ? 'localhost'
    : host
  return `http://${normalized}:${devServer.port}`
}

main().catch((error) => {
  // handler が投げるもの（`SessionError` / `DeleteError`）はどれも `Error` で、
  // 種別ではなく文言だけを人に見せる。終了コードは `fail` が 1 に固定する。
  fail(error instanceof Error ? error.message : String(error))
})
