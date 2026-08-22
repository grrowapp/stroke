/**
 * セッションが使うワークフロースキーマ名の唯一の出どころ。
 *
 * endpoint は runtimeConfig 経由（既定値は nuxt.config.ts がここを import する）、
 * script は `resolveWorkflowSchema()` で読む。どちらも「`NUXT_CLAUDE_WORKFLOW_SCHEMA`
 * があればそれ、無ければ既定」という同じ解決順になり、経路で挙動が割れない。
 */
export const DEFAULT_WORKFLOW_SCHEMA = 'flontier-strokeflow'

/** Nitro の外（script）から使う解決。runtimeConfig と同じ優先順。 */
export function resolveWorkflowSchema(): string {
  const env = process.env.NUXT_CLAUDE_WORKFLOW_SCHEMA?.trim()
  return env || DEFAULT_WORKFLOW_SCHEMA
}
