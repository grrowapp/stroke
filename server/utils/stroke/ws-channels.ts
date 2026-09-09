import { createKeyedPeerRegistry } from '../ws/registry'

/**
 * WS 接続の束ね。チャネル（question / proposal）ごとに、セッション id → 接続の集合を持つ。
 *
 * 束ねの実体は `server/utils/ws/registry.ts` の1本である。上層への配信（board）と同じ
 * 実装を使う——違いはキーを持つかどうかだけで、2つ書かない
 * （`openspec/specs/ws/delivery`）。
 *
 * 「現在分」はここに複製しない。正は session-store（`state.json` / `proposal.md`）にあるため、
 * 接続時配信は route ハンドラがそちらを読んで送る（design.md: 書き手は1つ）。
 */
/**
 * WS の URL からセッション id を読む。W1・W2 が同じこの1本を使う
 * （同じ規定を2箇所に書かない）。
 *
 * パターンは `runtimeConfig.wsPathPattern`（既定値は `nuxt.config.ts`）。リバースプロキシで
 * サブパス配信する構成にするときは、そこを配信の形に合わせる。合っていないと接続が
 * 無言で閉じる。
 */
export function sessionIdFromUrl(url: string, channel: 'question' | 'proposal'): string | null {
  // `{channel}` が複数あっても全て置き換える（`replace` は最初の1件だけ）
  const pattern = new RegExp(useRuntimeConfig().wsPathPattern.replaceAll('{channel}', channel))
  const match = pattern.exec(new URL(url).pathname)
  return match?.[1] ?? null
}

/** W1 `/api/sessions/:id/ws/question` */
export const questionChannel = createKeyedPeerRegistry<string>()

/** W2 `/api/sessions/:id/ws/proposal` */
export const proposalChannel = createKeyedPeerRegistry<string>()
