import { z } from 'zod'

/**
 * `claude -p` の呼び出しに要る `runtimeConfig.claude` を読む。
 *
 * 起動定義そのもの（実行ファイルと引数）はここではなく `runtimeConfig.public.claude` が
 * JSON のひとかたまりで持つ（docs/specs/core/settings-reference.md）。ここに残るのは、起動の引数
 * ではなく**呼び出しの中で使う値**である。
 *
 * どれも環境変数では差し替えられず、値は `nuxt.config.ts` に書かれたものだけになった。
 * それでも読むたびに検証するのは、宣言の書き間違い（キーの綴り違い・空文字）が、
 * 呼び出しの実行時まで気付かれずに残るのを防ぐためである。
 */
export interface ClaudeConfig {
  /**
   * エージェント向け endpoint の base URL（ホスト・ポート）。spawn 時に環境変数
   * （`STROKE_BASEURL`。名前は settings.ts の固定値）として渡し、
   * セッション API スキルがそこから接続先を解決する
   */
  apiBaseUrl: string
  /** セッションの openspec/config.yaml に書くワークフロースキーマ名（user レベル配置） */
  workflowSchema: string
  /** 初回の呼び出しで渡す定型。本文はコードに持たない（specs/ai-invocation） */
  firstPrompt: string
  /** 2回目以降・リトライで渡す定型 */
  continuePrompt: string
}

const schema = z.object({
  apiBaseUrl: z.string().trim().min(1),
  workflowSchema: z.string().trim().min(1),
  firstPrompt: z.string().trim().min(1),
  continuePrompt: z.string().trim().min(1),
})

/** 設定を読んで検証する。壊れていれば投げる。 */
export function readClaudeConfig(): ClaudeConfig {
  const parsed = schema.safeParse(useRuntimeConfig().claude)
  if (!parsed.success) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `runtimeConfig.claude が不正: ${describe(parsed.error)}`,
    })
  }
  return parsed.data
}

function describe(error: z.ZodError): string {
  return error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join(' / ')
}
