import { z } from 'zod'

/**
 * `claude -p` の起動設定。ADR 0001 のとおり `runtimeConfig` に置き、`NUXT_` の環境変数で
 * 実行時に差し替えられる。差し替えられる以上、値が形をなしているかは実行前に確かめる。
 */
export interface ClaudeConfig {
  settingSources: string
  addDir: string
  /** 空白区切り。空なら `--allowedTools` を渡さない */
  allowedTools: string
  timeoutMs: number
  /** `claude -p --model`。エイリアス（sonnet 等）またはフルネームを渡す */
  model: string
  /** エージェント向け endpoint の base URL（ホスト・ポート）。prompt にセッション URL として差し込む */
  apiBaseUrl: string
}

const schema = z.object({
  settingSources: z.string().trim().min(1),
  addDir: z.string().trim().min(1),
  allowedTools: z.string().default(''),
  // 環境変数で渡されると文字列で来ることがある。数として成立しない値は通さない
  // （NaN のまま使うと setTimeout が即発火して、常にタイムアウト扱いになる）。
  timeoutMs: z.coerce.number().int().positive(),
  model: z.string().trim().min(1),
  apiBaseUrl: z.string().trim().min(1),
})

/** 設定を読んで検証する。壊れていれば投げる。起動時チェックと各呼び出しの両方から使う。 */
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

export function describeClaudeConfigError(): string | null {
  const parsed = schema.safeParse(useRuntimeConfig().claude)
  return parsed.success ? null : describe(parsed.error)
}

function describe(error: z.ZodError): string {
  return error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join(' / ')
}
