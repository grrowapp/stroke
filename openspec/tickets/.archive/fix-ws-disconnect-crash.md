---
origin: agent
triage:
  - bug
change: fix-ws-disconnect-crash
status: Wait-for-archive
tags:
  - proposal
  - specs
  - design
  - tasks
  - pre3/a75d1ab0-9240-4752-9c54-b090fec9e8fa
  - pre5/72a11cd3-3ce1-4e4b-afab-b4392227b970
order: -8.0
date: 2026-09-04
---

# fix-ws-disconnect-crash

WebSocket が異常切断（RST）されると dev サーバーが停止し、手で起動し直すまで戻らない。

原因は上流（`@nuxt/cli` の dev）。upgrade の受け口が例外を扱わず、子プロセスが親へ IPC を送った直後に exit するため、親の再起動経路が効かないと読める（未実測）。

**範囲は dev 限定・RST 限定。** ビルド済みは止まらず、実ブラウザの操作でも止まらない。実際に踏んだ唯一の例はエージェントがサーバーを kill して起こし直す作業の最中。

## 決定: 対処不要（ユーザー判断 2026-09-06）

保険料として見合わない。起きたら `yarn dev` を起こし直す。

- 詰め物（`nuxt.config.ts` の `hooks.listen` で `process.emit` を差し替え、develop `00f206eb`）は撤去した
- `scripts/ws-disconnect-check.ts` と `yarn check:ws-disconnect` は消した
- `test/e2e/ws-disconnect.spec.ts` はビルド済みの契約として残す
- specs への反映は無い

## 経緯

- 2026-08-27 詰め物を実装し commit（担当の wt/base2・wt/base6 は削除済み。後追いで起票、`origin: agent`）
- 2026-09-04 起票の記述を訂正、artifact と実装を揃えた
- 2026-09-06 `yarn dev` に監督を置く再設計を書いたが、問題の合理性を報告した結果、対処不要と決定。撤去して archive

独立して残る観察: 待ち受けの正が2つある（`package.json` の `--port 3100` と `devServer.port` 3599）。`scripts/session.ts` / `scripts/stroke-check.ts` は後者を読む。この change の範囲外。
