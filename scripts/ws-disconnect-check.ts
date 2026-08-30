import { WebSocket } from 'ws'

import nuxtConfig from '../nuxt.config'

/**
 * WS を乱暴に切っても dev サーバーが止まらないことを確かめる（`yarn check:ws-disconnect`）。
 *
 * この症状は **dev でしか起きない**ので E2E では捕まえられない。playwright はビルド済みの
 * 出力（`node .output/server/index.mjs`）を立てるが、そちらには原因の経路が無く、
 * 修正前でも無傷で通ってしまう（実測: 異常切断7通り × 最大50接続で停止せず）。
 * だから通常のテストとは別に、動いている dev サーバーへ当てる形で置いている。
 *
 * 対処そのものは `nuxt.config.ts` の `hooks.listen`。理由と経緯はそちらに書いてある。
 *
 * 使い方: 別の端末で `yarn dev` を起こしてから `yarn check:ws-disconnect`。
 */

const PORT = nuxtConfig.devServer?.port ?? 3399
const BASE = `http://127.0.0.1:${PORT}`

/** 1回では通り抜けることがあるので繰り返して当てる */
const ROUNDS = 20

/** 話題タグ12字・問い本文20字・選択肢の説明50字までが契約（server/utils/stroke/question.ts） */
const QUESTION = {
  header: '保存の方式',
  detail: 'ここまでに決まったこと: 記録はファイルに置く。',
  question: '保存方式をどうするか',
  options: [
    { label: '同期で書く', description: '書き終わるまで待つ', recommended: true },
    { label: '非同期で書く', description: '待たずに返す' },
  ],
}

function post(path: string, data: unknown = {}): Promise<Response> {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  })
}

/** U11: セッションを消す。メソッドで振り分ける（`openspec/specs/api/session/delete`） */
function del(path: string): Promise<Response> {
  return fetch(BASE + path, { method: 'DELETE' })
}

async function responds(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/api/projects`)).ok
  } catch {
    return false
  }
}

/**
 * 繋がった瞬間に相手が消える状態を作る。
 *
 * `terminate()` は閉じる挨拶を送らずソケットを落とす。行儀のよい `close()` では
 * この症状は出ない（実測: 実ブラウザのリロードでも出ない）。落とせるのは RST だけである。
 */
function connectThenVanish(path: string): Promise<void> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}${path}`)
    const finish = (): void => {
      socket.removeAllListeners()
      resolve()
    }
    socket.on('open', () => {
      socket.terminate()
      finish()
    })
    // サーバーが既に止まっていれば接続そのものが失敗する。判定は呼び出し側で行う
    socket.on('error', finish)
  })
}

/** 停止はチャネルの種類によらず起きるので、配信を持つものと持たないものの両方を当てる */
function targets(sessionId: string): { name: string; path: string }[] {
  return [
    { name: 'ws/question', path: `/api/strokes/${sessionId}/ws/question` },
    { name: 'ws/proposal', path: `/api/strokes/${sessionId}/ws/proposal` },
    { name: '/ws（通知）', path: '/ws' },
  ]
}

async function main(): Promise<void> {
  if (!(await responds())) {
    console.error(`dev サーバーが ${BASE} で動いていない。先に \`yarn dev\` を起こすこと`)
    process.exit(2)
  }

  const created = await post('/api/strokes', { overview: 'WS 切断の確認' })
  if (!created.ok) {
    console.error(`セッションを作れなかった: ${created.status} ${await created.text()}`)
    process.exit(2)
  }
  const { sessionId } = (await created.json()) as { sessionId: string }

  const failed: string[] = []
  try {
    // 接続時配信が発火する状態にする。配信が無いと送る側の経路を通らない
    await post(`/api/strokes/${sessionId}/question`, QUESTION)
    await post(`/api/strokes/${sessionId}/proposal`, {
      proposal: '# 確認\n\n本文。',
      projectName: 'ws-disconnect-check',
    })

    for (const { name, path } of targets(sessionId)) {
      for (let round = 0; round < ROUNDS; round += 1) {
        await connectThenVanish(path)
      }

      const ok = await responds()
      console.log(`${ok ? '✓' : '✗'} ${name} を ${ROUNDS} 回 異常切断 -> ${ok ? '生存' : '停止'}`)
      if (!ok) {
        failed.push(name)
        break
      }
    }
  } finally {
    // 途中で落ちても後片付けはする。サーバーが止まっていれば削除も通らないので握る
    await del(`/api/sessions/${sessionId}`).catch(() => undefined)
  }

  if (failed.length > 0) {
    console.error(`\ndev サーバーが停止した: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\n異常切断で dev サーバーは止まらない')
}

await main()
