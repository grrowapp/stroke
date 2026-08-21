import { resolveApiBaseUrl } from '../server/utils/api-base-url'
import {
  SessionCoreError,
  createSessionCore,
  deleteSessionCore,
  listSessionsCore,
  readInvocationCore,
} from '../server/utils/session-core'

/**
 * サーバが動いていなくても使えるセッション管理（specs/tools/session-cli）。
 * `yarn session <create|delete|list>` として tsx で実行する。実体は endpoint と同じ
 * core（server/utils/session-core.ts）で、endpoint を叩かず、サーバの稼働に依存しない。
 */

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
      const sessionId = await createSessionCore(arg, 'idle')
      // 返答は転送予定先（画面1）の URL。開けばセッションが進む
      console.log(`${resolveApiBaseUrl()}/s/${sessionId}`)
      return
    }
    case 'delete': {
      if (!arg) fail(`セッション uuid が必要。\n${USAGE}`)
      // サーバ無しの実行中判定は state.json の invocation を材料にする（design.md 決定5）
      if ((await readInvocationCore(arg)) === 'running') {
        fail('このセッションは実行中の記録を持つ。呼び出しが終わってから消すこと。')
      }
      await deleteSessionCore(arg)
      console.log(`deleted: ${arg}`)
      return
    }
    case 'list': {
      const sessions = await listSessionsCore()
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

main().catch((error) => {
  fail(error instanceof SessionCoreError ? error.message : String(error))
})
