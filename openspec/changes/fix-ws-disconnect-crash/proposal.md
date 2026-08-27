## Why

**症状**: WebSocket が異常切断されると dev サーバーが停止し、手で起動し直すまで戻らない。停止すると開いている全てのセッション・全ての画面が同時に使えなくなる。実際にはエージェントがサーバーを kill して立ち上げ直す作業の最中に踏んでいた。

原因は上流（`@nuxt/cli` の dev）にある。2つが重なっている。

1. upgrade の受け口が `nuxt.server.upgrade(req, socket, head)` を catch せず、socket に `'error'` の受け手も置いていない
2. dev の子プロセスが `process.once("unhandledRejection", …)` で **あらゆる** 未処理 rejection に対し `process.exit()` する

相手が RST を送ると `read ECONNRESET` が未処理 rejection になり、2 が発火してプロセスが落ちる。

**この change の目的は、この症状が二度と起きないこと**。完了の判定も症状で行う（下記の確認コマンド）。

### 調査で覆った前提

当初の proposal は「接続時配信を持つ question / proposal だけで起き、通知チャネルでは起きない」としていたが、**どちらも成立しなかった**。

- 通知チャネル `/ws` も同じ条件で停止する。このハンドラは `open` が同期で、送信も try/catch 済みである
- ビルド済みサーバーは異常切断7通り × 最大50接続で**まったく停止しない**
- 実ブラウザのリロード・画面遷移・タブを閉じる操作でも停止しない。行儀のよい切断では発火せず、落とせるのは RST だけである

したがって `question.ts` / `proposal.ts` / `ws-channels.ts` は原因ではなく、そこを直しても症状は消えない。

## What Changes

- 追加: `nuxt.config.ts` の `hooks.listen` で、接続リセット系（`ECONNRESET` / `EPIPE` / `ECONNABORTED`）の未処理 rejection を、リスナへ配る前に握る。それ以外は今まで通り上流の扱いに渡すので、本物の不具合は今までどおり表に出る。握った分は `console.warn` に出す
- 追加: 症状を確かめるコマンド `yarn check:ws-disconnect`（`scripts/ws-disconnect-check.ts`）。動いている dev サーバーへ異常切断を当て、応答を続けることを確かめる。dev でしか起きない症状なので E2E では捕まえられない
- 追加: `WS_GUARD_OFF=1` で詰め物を外せるようにする。確認コマンドがまだ症状を捉えているかを検めるための口
- 追加: ビルド済みサーバーが異常切断に耐えることを E2E に固定する（`e2e/ws-disconnect.spec.ts`）。修正の前後どちらでも通るが、将来ハンドラに `await` や送信が足されたときに崩れうるため独立した契約として置く

## Capabilities

### New Capabilities

- `tools/ws-disconnect-check`: 動いている dev サーバーへ WS の異常切断を当て、停止しないことを確かめる口。何を当てるか・何をもって生存とするかを規定する

### Modified Capabilities

- `agent-question`: 接続時配信（W1）に「配信先が既に切断していても、サーバーは応答を続け、他の接続・他のセッション・セッションの状態に影響しない」を加える
- `proposal-review`: 接続時配信（W2）に同上を加える

## Impact

- `nuxt.config.ts` — `hooks.listen` の追加。設定（`runtimeConfig`）ではないので `docs/specs/core/settings-reference.md` は変わらない
- `scripts/ws-disconnect-check.ts` / `package.json` — 確認コマンドの追加
- `e2e/ws-disconnect.spec.ts` — ビルド済みサーバーの契約
- 依存追加なし。API 契約・画面への影響なし。ビルド済みサーバーの振る舞いは変わらない（そちらは元から停止しない）
