## 1. 症状を掴む

- [x] 1.1 接続時配信が発火する状態を、アプリ自身の API で作る（`POST /api/strokes` → A5 `/question` → A7 `/proposal`）
- [x] 1.2 `e2e/ws-disconnect.spec.ts` を作り、W2 へ接続して即座に切る操作の後にサーバーが応答することを確かめる
- [x] 1.3 同じファイルに W1 の検査を足す
- [x] 1.4 **修正前に赤になることを確認する** → 緑のままだった。E2E はビルド済みサーバーを立てるため症状が出ない。回帰テストとして成立していないと判定
- [x] 1.5 再現条件を探す。ビルド済み7通り・実ブラウザ4通り・kill → 再起動では停止せず、`terminate()` による強制 RST でのみ dev が停止することを特定
- [x] 1.6 通知チャネル `/ws` にも当て、**同じく停止する**ことを確認。当初 proposal の切り分けが誤りで、`question.ts` / `proposal.ts` / `ws-channels.ts` は原因でないと確定

## 2. 原因を特定する

- [x] 2.1 `@nuxt/cli` の dev が upgrade を catch せず socket に `'error'` の受け手も置いていないことを確認（`dist/dev-*.mjs`）
- [x] 2.2 dev の子プロセスが `process.once("unhandledRejection", …)` で `process.exit()` することを確認
- [x] 2.3 socket に `'error'` を置くだけでは足りないことを実測（受け止めても停止した）
- [x] 2.4 `listen` フック時点のリスナ差し替えでは足りないことを実測（`restart` が後から登録され素通りする）
- [x] 2.5 `process.emit` で偽を返すと `triggerUncaughtException` に回ることを実測。**`true` を返す**必要があると確定

## 3. 直す

- [x] 3.1 `nuxt.config.ts` に `hooks.listen` を足し、接続リセット系（`ECONNRESET` / `EPIPE` / `ECONNABORTED`）の rejection と例外をリスナへ配る前に握る
- [x] 3.2 握る範囲が切断系だけであること（`TypeError` は素通りすること）を単体で確認
- [x] 3.3 `WS_GUARD_OFF=1` で詰め物を外せる口を足す

## 4. 症状で確かめる

- [x] 4.1 `scripts/ws-disconnect-check.ts` と `yarn check:ws-disconnect` を足す。question / proposal / 通知の3チャネルへ異常切断を当て、応答を判定する
- [x] 4.2 詰め物を入れた状態で緑になることを確認（3チャネル全て生存）
- [x] 4.3 **`WS_GUARD_OFF=1` で赤になることを確認**（`ws/question` 20回で停止）
- [x] 4.4 実ブラウザ4通り・通知チャネル30回でも停止しないことを確認
- [x] 4.5 `yarn check` を通す。typecheck は通過。`openspec validate --all` はこの change を ✓ とするが、全体では他の未完了 change 17 件が元から失敗しており、そちらはこの change の範囲外
- [x] 4.6 `yarn test`（132 件）と `yarn build && yarn test:e2e` が既存を壊していないことを確認

## 5. 後始末

- [ ] 5.1 調査用に置いた `e2e/ws-disconnect-probe.spec.ts` を削除する（`rm` が permission で拒否されるため、ユーザーの手が要る）
- [x] 5.2 `e2e/ws-disconnect.spec.ts` の説明を、ビルド済みサーバーの契約であること（dev の症状は捉えないこと）に合わせる

## 6. レビュー

- [x] 6.1 `typescript-reviewer` を独立2体で走らせる（`/santa-method`）。両者とも Block 判定
- [x] 6.2 HIGH: `listen` は dev の再起動のたびに再実行されるため `process.emit` のラップが積み上がる → `Symbol.for` の目印で1プロセス1回に限る。`upgrade` リスナ側は上流が `close` で掃除するので毎回登録が要る
- [x] 6.3 HIGH: `uncaughtException` を握る実測の裏付けが無い → 対象から外し、`unhandledRejection` だけで3チャネル生存することを確認
- [x] 6.4 HIGH: 握った分のログが無い → `console.warn` に出す
- [x] 6.5 MEDIUM: `scripts/ws-disconnect-check.ts` の後片付けを `try/finally` にし、セッション作成の失敗を判定する
- [x] 6.6 MEDIUM: 空文字を通知チャネルの番兵に使う書き方をやめ、対象を `{ name, path }` の一覧にして重複を消す
- [x] 6.7 MEDIUM: キャストの理由・`isDisconnect` の限界をコードと design.md に明記
- [x] 6.8 修正後に再確認。ガード有りで3チャネル生存、`WS_GUARD_OFF=1` で赤（exit 1）、dev 再起動後も有効
- [ ] 6.9 HIGH: `WS_GUARD_OFF` が ADR-0004（環境変数から設定を読まない）に触れないか、ユーザーに確認する

## 7. 通し確認（手動）

自動の確認（`yarn check:ws-disconnect`）は「WS を乱暴に切る」という作った状況しか見ていない。実際の使い方で、**ビルドを挟んでセッションが生き残り、最後まで通るか**を人の手で1回通す。

- [ ] 7.1 dev を起動する（`yarn dev`）
- [ ] 7.2 ストロークを開始する（概要を投稿する）
- [ ] 7.3 ストロークを3〜4回進める
- [ ] 7.4 dev を停止する
- [ ] 7.5 ビルド成果をクリーンアップし、再度ビルドする
- [ ] 7.6 dev を起動する
- [ ] 7.7 **7.2 で始めたセッションに再接続する**
- [ ] 7.8 ストロークを再開する
- [ ] 7.9 proposal の提出まで進め、承認する ← **check1。ここが本丸**
- [ ] 7.10 ポータルの一覧にプロジェクトが出るか確かめる ← **check2。駄目なら先へ進めず、一旦報告する**

## 8. 残り

- [ ] 8.1 `e2e/ws-disconnect-probe.spec.ts` を削除する（`rm` が permission で拒否されるため、ユーザーの手が要る）。`playwright.config.ts` の `testMatch` に一致するので、残すと `yarn test:e2e` に混入する
- [ ] 8.2 成果物を commit する
