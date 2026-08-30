---
tags:
  - bug
status: Doing
order: 0.0
---

# fix-ws-disconnect-crash

WebSocket が異常切断（RST）されると dev サーバーが停止し、手で起動し直すまで戻らない。
全セッション・全画面が同時に使えなくなる。

原因は上流（`@nuxt/cli` の dev）の2点が重なったもの。upgrade の受け口が例外を catch せず socket に
`'error'` の受け手も付けていないこと、および dev の子プロセスが `process.once("unhandledRejection")`
で**あらゆる**未処理 rejection を受けて `process.exit()` すること。相手が RST を送ると
`read ECONNRESET` が未処理 rejection になり、後者が発火して落ちる。ビルド済みサーバーには
どちらの経路も無く落ちない。

接続リセット系の rejection **だけ**を既存のリスナへ渡さない詰め物を `nuxt.config.ts` の
`listen` フックに置く。それ以外は今まで通り上流の扱いに渡し、本物の不具合は表に出す。
上流が upgrade の失敗を扱うようになったら外す。

触るファイル:
- 更新 nuxt.config.ts（`listen` フック。upgrade した socket に `'error'` の受け手を置き、接続リセット系の rejection を止める。`WS_GUARD_OFF=1` で外せる）
- 追加 scripts/ws-disconnect-check.ts / package.json（`yarn check:ws-disconnect`。動いている dev サーバーへ異常切断を当て、応答を続けることを確かめる。dev でしか起きない症状なので E2E では捕まえられない）
- 更新 e2e/ws-disconnect.spec.ts（ビルド済みサーバーが異常切断に耐えることを契約として固定する）
- 削除 e2e/ws-disconnect-probe.spec.ts（調査用。`playwright.config.ts` の `testMatch` に一致するため残すと `yarn test:e2e` に混入する）

`server/utils/stroke/ws-channels.ts` は触らない。W1 / W2 のハンドラは原因ではなく、そこを直しても症状は消えない（調査で確認済み）。依存追加なし。API 契約・画面への影響なし。

経緯: 実装は develop に入っている（`00f206e` 2026-08-27「fix: WS の異常切断で dev サーバーが止まらないようにする」）。
担当していた wt/base2・wt/base6 は削除済みで、change だけが残った状態から後追いで起票した。
