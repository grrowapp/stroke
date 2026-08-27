import { createError } from 'h3'

import type { ConnectionContext } from './connection-table'

/**
 * 接続文脈から `sessionId`（flontier 工程）を取り出す。
 *
 * `resolveConnection` が返す `ConnectionContext` は union で、`sessionId` を持つとは
 * 限らない。steering 工程の接続で flontier 向けツールが呼ばれることは normal
 * フローでは起きない（呼び出し元ごとに渡すツール定義が分かれる）ため、ここに来た場合は
 * 接続と呼び出し元の組み合わせの不整合として扱う。
 */
export function requireConnectionSessionId(context: ConnectionContext): string {
  if (context.sessionId === undefined) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'この接続は flontier 工程向けではない。',
    })
  }
  return context.sessionId
}

/** 接続文脈から `projectPath`（steering 工程）を取り出す。理由は `requireConnectionSessionId` と対。 */
export function requireConnectionProjectPath(context: ConnectionContext): string {
  if (context.projectPath === undefined) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'この接続は steering 工程向けではない。',
    })
  }
  return context.projectPath
}
