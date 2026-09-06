## 1. 着手

- [x] 1.1 `openspec/tickets/fix-ws-disconnect-crash.md` の `status` を `Doing` にする
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（`pre5/72a11cd3-3ce1-4e4b-afab-b4392227b970`）

## 2. 経緯（済み）

- [x] 2.1 症状の特定。強制 RST でのみ dev が止まり、ビルド済み・実ブラウザ操作では止まらない（design.md - 実測）
- [x] 2.2 原因の特定。上流 `@nuxt/cli` の作り（design.md - 上流の作り）
- [x] 2.3 詰め物を実装し commit（develop `00f206eb`、2026-08-27）
- [x] 2.4 監督への再設計（2026-09-06）。実装せず
- [x] 2.5 **対処不要と決定**（ユーザー判断 2026-09-06）。以降は撤去と archive

## 3. 撤去

- [x] 3.1 `nuxt.config.ts` の `hooks.listen` から詰め物を外し、`recordDevListenAddress` だけを残す。docblock を書き直す
- [x] 3.2 `scripts/ws-disconnect-check.ts` と `package.json` の `check:ws-disconnect` を消す
- [x] 3.3 specs の delta を消す（規定に反映するものは無い）
- [x] 3.4 `yarn typecheck` と `yarn test` が通ることを確かめる

## 4. 締め

- [x] 4.1 `/santa-method` レビュー — 撤去のみでコードを足していないため行わない（ユーザー指示 2026-09-06「対処不要。掃除して archive」）
- [x] 4.2 change の成果物を commit する
- [x] 4.3 ユーザーから完了承認を得て（2026-09-06「掃除して archive しろ」）、`openspec/tickets/fix-ws-disconnect-crash.md` の `status` を `Wait-for-archive` にする
