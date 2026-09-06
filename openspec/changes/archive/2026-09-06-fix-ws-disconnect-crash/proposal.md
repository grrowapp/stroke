## Why

**症状**: WebSocket が異常切断（RST）されると dev サーバーが応答しなくなり、手で起動し直すまで戻らない。

**原因**: 上流（`@nuxt/cli` の dev）。upgrade の受け口が例外を扱わず、RST で `read ECONNRESET` が未処理 rejection になる。子プロセスは親へ IPC を送った直後に `process.exit()` するため、親の再起動経路（`nuxt:internal:dev:rejection` → `restartWithFork`）が効かないと読める（ソースから。未実測）。

**範囲**: dev 限定。ビルド済みサーバーは異常切断7通り × 最大50接続で止まらない。実ブラウザのリロード・遷移・タブ閉じ・kill 再起動でも止まらない。再現には `terminate()` による強制 RST が要る。実際に踏んだ唯一の例は、エージェントがサーバーを kill して起こし直す作業の最中だった。

## 決定: 対処不要（ユーザー判断 2026-09-06）

問題は実在するが、dev 限定・RST 限定で、通常の開発操作で起きる証拠が無い。上流の内部に依存する詰め物（旧設計、develop `00f206eb`）も、`yarn dev` に監督を置く案（2026-09-06 の再設計）も、保険料として見合わない。**対処せず、起きたら `yarn dev` を起こし直す。** 上流の欠陥は上流のもの。

## What Changes

- 削除: `nuxt.config.ts` の `hooks.listen` から詰め物（upgrade した socket への `'error'` 受け手、`process.emit` の差し替え、`WS_GUARD_OFF`）を外す。`recordDevListenAddress` の呼び出しは別 change の成果で残す
- 削除: `scripts/ws-disconnect-check.ts` と `package.json` の `check:ws-disconnect`
- 維持: `test/e2e/ws-disconnect.spec.ts`。ビルド済みサーバーが異常切断に耐えることの契約で、対処とは無関係に成立する
- 規定は変えない。specs の delta は持たない

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。

## Impact

- `nuxt.config.ts` — `hooks.listen` が待ち受けの記録だけになる
- `scripts/ws-disconnect-check.ts` — 削除
- `package.json` — `check:ws-disconnect` を削除。`ws` 依存は `server/utils/upstream/socket.ts` と E2E が使うので残る
- 依存追加なし。API 契約・画面・ビルド済みサーバーの振る舞いは変わらない
