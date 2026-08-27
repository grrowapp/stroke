# fix-session-cli-url — design

1行の修正であり、設計判断は無い。

- 直す場所: `scripts/session.ts:32` の `console.log(`${DEFAULT_API_BASE_URL}/s/${sessionId}`)`
- 直し方: パスセグメント `/s/` を `/strokes/` へ。実ルート（`app/pages/strokes/[sessionId]/index.vue`）に合わせるだけ
- 触らないもの: `DEFAULT_API_BASE_URL` の解決（実測で正しいことを確認済み）、`list` / `delete`（URL を出力しない）
