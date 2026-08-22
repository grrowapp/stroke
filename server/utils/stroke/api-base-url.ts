/**
 * サーバの base URL の唯一の出どころ。
 *
 * endpoint 側は runtimeConfig 経由（既定値は nuxt.config.ts がここを import する）、
 * script は `resolveApiBaseUrl()` で読む。どちらも「`NUXT_CLAUDE_API_BASE_URL` があれば
 * それ、無ければ既定」という同じ解決順になり、経路で挙動が割れない。
 */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3001'

/** Nitro の外（script）から使う解決。runtimeConfig と同じ優先順。 */
export function resolveApiBaseUrl(): string {
  const env = process.env.NUXT_CLAUDE_API_BASE_URL?.trim()
  return env || DEFAULT_API_BASE_URL
}
