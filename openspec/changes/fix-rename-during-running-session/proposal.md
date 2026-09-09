## Why

**症状**: 承認を押した時点で flontier の claude がまだ走っていると、改名がその claude を置き去りにする。`rename(2)` は inode を保つので claude の cwd は改名先へ追随して生き続けるが、自分を名乗る id は改名前の uuid のままなので、以後のツール呼び出しが全部 `session_not_found` になり、`invocation` はどこにも残らない。

改名を行う endpoint は U14（`POST /api/sessions/:id/promote`）である。起票した 2026-08-31 の時点では承認（U10）が判断の記録から改名・起動までを一度に行っていたが、その後 develop で承認が3段（U10 判断の記録 / U14 昇格 / U13 起動）に分割され、改名は U14 へ移った。

### 起票後に分かったこと（2026-09-08〜09）

サーバ側のガードは既に入っている。`c086907e`（2026-09-01）で busy ガードのキーを作業場所ディレクトリの実体（`stat` の `dev`/`ino`）へ変え、改名する段が `beginRun` で lock を取り、実行中なら 409 busy で何も変えずに返す。docs（`docs/specs/api/sessions/promote.md`「実行中は受理しない」）も規定済みで、`openspec/specs/` だけが追従していない。

**しかし、これは症状の入口を塞いでいない。** 画面2 が「AI が動いている」と知るのは、**自分が起動した実行だけ**である（差し戻し → `sendingBack`、問い返しの回答 → `followupWaiting`。どちらもメモリ上の `pendingAction`）。画面が知らない実行が走っている間、承認ボタンは有効なまま押せる。

| 承認できる状態なのに AI が走っている場面 | なぜ画面が知らないか |
|---|---|
| proposal が届いた直後に承認する | proposal は A7 受理の瞬間に W2 で届くが、claude のプロセスはその後もしばらく生きている（終了処理——残りの出力と実行の記録）。起票の出どころ（`check:stroke` が承認の手前で実行の終わりを待って避けていた）はこれ |
| 差し戻し中にリロードする | `pendingAction` が消え、承認ボタンが有効に戻る |
| 巡回が再起動している | 前の実行が `failed` に倒れ、60 秒後に巡回が U13 を叩いて走らせている |
| 別タブ／別ブラウザ | 一方で差し戻し、他方で承認 |

いずれも「画面が実行中を表示できていないのに、サーバは実行中」という状態で承認を押す形である。この状態が**存在すること自体が設計の欠陥**である。押してから 409 busy で断られる形は、ユーザーには「作れなかった」としか見えない（承認画面は 409 busy を汎用の失敗に落としている。ADR 0022「応答の握りつぶしは、いかなる者にも許されない」に当たる）。

**さらに、「実行中だから受理しない（409 busy）」という応答そのものを契約から無くす**（ユーザー指示 2026-09-09）。実行中は断る理由ではなく、順番を待つ理由である。busy を返す限り、呼び手は「待って出し直す」責務を負い、その責務の取りこぼし（`useWaitingRetry` の `pendingRun`・巡回と画面の二重キック・承認画面の握りつぶし）が繰り返し欠陥になってきた。

**直すべきは2つ。** (1) 承認できる状態と実行中が同時に存在しないこと——画面が自分の行動で待機に入るのではなく、サーバの実行の記録（`invocation`）から可否を導く。そのために `invocation` の変化を push で届ける。(2) それでも同じ対象へ実行と両立しない操作（起動・昇格・削除）が実行中に届いたら、断らずに**予約**し、実行の終わりにサーバが行う。busy という応答は消える。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、範囲外の扱いは不正だった（ユーザー指摘 2026-09-01）ので change を立てた。2026-09-09 に「409 で逃げず、発生し得ない設計にする」「409 busy を無くす」（ユーザー指示）へ方向を改めた。

## What Changes

- **変更（設計の本体 1）: 承認・削除の操作は、サーバの実行の記録が平常（`idle`）のときにだけ存在する。** 画面2 は `invocation` を自分の行動からではなくサーバの事実として受け取り、`idle` 以外の間は操作を出さず、AI が作業中であることを示す
- **変更: `invocation` の変化を、そのセッションを見ている画面へ push する。** セッション向けの WS 配信（W1・W2）にメッセージの種別 `invocation` を足す（`ws/delivery`「新しい種類の出来事のために配信の口を増やさない」）。A8 が書いた直後に配信し、接続の瞬間にも現在分を配信する
- **変更（設計の本体 2）: 「実行中だから受理しない」（409 busy）を契約から無くす。** 実行と両立しない操作（起動 U13・昇格 U14・セッション削除 U11・プロジェクト削除 P1）が実行中に届いたら、断らずに**予約**として受理し、実行の終わりにサーバが行う。予約は対象ごと・種類ごとに1件。昇格・削除が予約されていれば起動の予約は捨てる。判定の単位は作業場所の物理ディレクトリ
- 変更: 承認後の steering の起動は巡回だけが行う。画面のキック（`kickSteering`）を外す——画面と巡回の二重要求が、予約の下では二重の実行になるため。U14 は起動の段へ引き渡した直後に巡回を1回走らせ、待ち時間を作らない
- 変更: `useWaitingRetry` の busy 後の再送（`pendingRun`・`BUSY_RETRIES`）を消す。予約がサーバへ移る
- 変更: 承認画面が昇格の失敗理由を握りつぶさない（ADR 0022）
- 作り直し: design.md（`running.test.ts` が参照する D2 の宛先）と tasks.md

### 他の change との関係

- `replace-polling-with-push` は「失敗（`failed`）だけを W3 で push し、`useWaitingRetry` のポーリングを撤去する」を本題にしている。本 change の `invocation` 種別は `failed` を含む全遷移を運ぶので、**W3 はこれに吸収される**。ポーリングの撤去はあちらの本題として残す。あちらの proposal の改訂が要る（ユーザー判断）

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `stroke/frontier`: 承認・削除の操作はサーバの実行の記録が `idle` のときにだけ存在する。承認後の起動を画面が要求しない。失敗理由を握りつぶさない
- `api/session/ws`: セッション向けの配信（W1・W2）に `invocation` の変化を運ぶ種別を加える
- `api/session/invoke-agent`: 実行中の起動要求は断らず予約する。単位は作業場所の物理ディレクトリ。busy を持たない
- `api/session/promote`: 実行中の昇格は予約し、実行の終わりに行う。busy を持たない
- `api/session/delete`: 実行中の削除は予約し、実行の終わりに行う（busy の Requirement を REMOVED）
- `api/project/delete`: 同上

## Impact

- `app/composables/useProposalReview.ts` — 承認・削除の可否を `invocation` から導く。`kickSteering` を外す。`promote()` の失敗理由を握りつぶさない
- `app/composables/useWaitingRetry.ts` — `pendingRun`・`BUSY_RETRIES` を消す
- `app/pages/strokes/[sessionId]/proposal.vue` — `invocation !== 'idle'` の間、承認・削除の操作を出さず作業中を示す
- `server/utils/stroke/running.ts` — `beginRun`/`isRunning` を「実行中なら予約、平常なら即時」の直列化に置き換える。キーは D2 のまま。`conflict.ts` から `busy` を消す
- `server/utils/stroke/session-store.ts`（`writeInvocation`）— 書いた直後にセッション向け配信へ publish。`idle` を書いた直後に予約を消化する
- `server/api/strokes/[id]/invoke-agent.get.ts`・`promote.post.ts`・`server/api/sessions/[id]/index.delete.ts`・`server/api/projects/[projectId]/index.delete.ts` — 実行中なら予約して 202
- `server/routes/api/strokes/[id]/ws/{question,proposal}.ts` — 接続時に `invocation` の現在分も配信
- `shared/stroke.ts` — W1/W2 のメッセージ型に `invocation` 種別を足す
- `server/plugins/01.retry-failed.ts` — 巡回を外から1回走らせる入口
- docs（design で提案し、承認後に直す）: `docs/specs/api/contract.md`（「約束」の 409 busy 行 → 202 予約、W1/W2 のメッセージ）、`docs/specs/api/sessions/{invoke-agent,promote,delete}.md`・`docs/specs/api/projects/delete.md`（エラー表から busy を消す）、`docs/specs/api/sessions/activate.md`（「busy を見ない」の表現）
- `docs/adr/0022-no-one-swallows-a-response.md` — この change の design で提案し、2026-09-09 に承認を得て登録した ADR
- MCP ツールの契約は変えない。W1/W2 は種別が増えるだけで endpoint は増えない
