## Why

**症状**: 承認を押した時点で flontier の claude がまだ走っていると、改名がその claude を置き去りにする。`rename(2)` は inode を保つので claude の cwd は改名先へ追随して生き続けるが、自分を名乗る id は改名前の uuid のままなので、以後のツール呼び出しが全部 `session_not_found` になり、`invocation` はどこにも残らない。

改名を行う受け口は U14（`POST /api/sessions/:id/promote`）である。起票した 2026-08-31 の時点では承認（U10）が判断の記録から改名・起動までを一度に行っていたが、その後 develop で承認が3段（U10 判断の記録 / U14 昇格 / U13 起動）に分割され、改名は U14 へ移った。

### 起票後に分かったこと（2026-09-08）

サーバ側の防波堤は既に入っている。`c086907e`（2026-09-01）で busy ガードのキーを作業場所ディレクトリの実体（`stat` の `dev`/`ino`）へ変え、改名する段が `beginRun` で枠を占有し、実行中なら 409 busy で何も変えずに返す。テストもある。docs（`docs/specs/api/sessions/promote.md`「実行中は受理しない」）も規定済みで、`openspec/specs/` だけが追従していない。

**しかし、これは症状の入口を塞いでいない。** 画面2 が「AI が動いている」と知るのは、**自分が起こした実行だけ**である（差し戻し → `sendingBack`、問い返しの回答 → `followupWaiting`。どちらもメモリ上の `pendingAction`）。画面が知らない実行が走っている間、承認ボタンは有効なまま押せる。

| 承認できる状態なのに AI が走っている場面 | なぜ画面が知らないか |
|---|---|
| proposal が届いた直後に承認する | proposal は A7 受理の瞬間に W2 で届くが、claude のプロセスはその後もしばらく生きている（締めの出力・実行の記録）。起票の出どころ（`check:stroke` が承認の手前で実行の終わりを待って避けていた）はこれ |
| 差し戻し中にリロードする | `pendingAction` が消え、承認ボタンが有効に戻る |
| 巡回が起こし直している | 前の実行が `failed` に倒れ、60 秒後に巡回が U13 を叩いて走らせている |
| 別タブ／別ブラウザ | 一方で差し戻し、他方で承認 |

いずれも「画面が実行中を表示できていないのに、サーバは実行中」という状態で承認を押す形である。この状態が**存在すること自体が設計の欠陥**であり、409 busy はそれを最後に受け止める防波堤にすぎない。押してから断られる形は、ユーザーには「作れなかった」としか見えない（承認画面は 409 busy を汎用の失敗に落としている。ADR 0021「応答の握りつぶしは、いかなる者にも許されない」に当たる）。

**直すべきは、承認できる状態と実行中が同時に存在しないことである。** 画面が自分の行動で待機を立てるのではなく、サーバの実行の記録（`invocation`）から承認の可否を導けば、上の4場面はすべて消える。そのためには `invocation` の変化がそのセッションを見ている画面へ push で届く必要がある。今は届いていない（W1 は問い、W2 は proposal だけ。`useWaitingRetry` が待機中だけ U2 を3秒おきに読む）。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、範囲外の扱いは不正だった（ユーザー指摘 2026-09-01）ので change を立てた。2026-09-09 に「409 で逃げず、発生し得ない設計にする」（ユーザー指示）へ方向を改めた。

## What Changes

- **変更（設計の本体）: 承認の操作は、サーバの実行の記録が平常（`idle`）のときにだけ存在する。** 画面2 は `invocation` を自分の行動からではなくサーバの事実として受け取り、`idle` 以外の間は承認の操作を出さず、AI が作業中であることを示す。画面が自分で起こした実行かどうかは関係ない
- **変更: `invocation` の変化を、そのセッションを見ている画面へ push する。** セッション向けの WS 配信（W1・W2）にメッセージの種別 `invocation` を足す（`ws/delivery`「新しい種類の出来事のために配信の口を増やさない」）。A8 が書いた直後に配信し、接続の瞬間にも現在分を配信する
- 規定: `api/session/promote` に、対象で実行中の呼び出しがある間は改名しないこと（docs の規定を写す）を入れる。**これは不変条件の防波堤であり、画面から到達する経路は無い。** 占有の区間を「確認 → 改名 → phase → 起動の段への引き渡し」まで延ばし、枠が空きで `invocation` が `idle` の窓を閉じる
- 規定: `api/session/invoke-agent` に、多重起動を防ぐ「同一対象」の単位が作業場所の物理ディレクトリであることを入れる
- 変更: 承認画面が昇格の失敗理由を握りつぶさない（ADR 0021）。busy は設計上到達しないので「待てば通る」の器は作らず、届いたら欠陥として失敗を示す
- 変更: `beginRun` が投げる 409 の文言を、断る側（起動・改名）が持つ形にする
- 作り直し: design.md（`running.test.ts` が参照する D2 の宛先）と tasks.md

### 他の change との関係

- `replace-polling-with-push` は「失敗（`failed`）だけを W3 で push し、`useWaitingRetry` のポーリングを撤去する」を本題にしている。本 change の `invocation` 種別は `failed` を含む全遷移を運ぶので、**W3 はこれに吸収される**。ポーリングの撤去はあちらの本題として残す——本 change は push を足すところまでで、撤去まで踏み込まない。あちらの proposal の改訂が要る（ユーザー判断）

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `stroke/frontier`: 承認の操作はサーバの実行の記録が `idle` のときにだけ存在することを規定に加える。承認が成功しなかった理由を握りつぶさない
- `api/session/ws`: セッション向けの配信（W1・W2）に `invocation` の変化を運ぶ種別を加える
- `api/session/promote`: 昇格が走行中の実行と競合しないこと（防波堤）を規定に加える
- `api/session/invoke-agent`: 多重起動を防ぐ単位が作業場所の物理ディレクトリであることを規定に加える

## Impact

- `app/composables/useProposalReview.ts` — 承認の可否を `invocation` から導く。`promote()` の失敗理由を握りつぶさない
- `app/pages/strokes/[sessionId]/proposal.vue` — `invocation !== 'idle'` の間、承認の操作を出さず作業中を示す
- `server/utils/stroke/session-store.ts`（`writeInvocation`）— 書いた直後にセッション向け配信へ publish
- `server/routes/api/strokes/[id]/ws/{question,proposal}.ts` — 接続時に `invocation` の現在分も配信
- `shared/stroke.ts` — W1/W2 のメッセージ型に `invocation` 種別を足す
- `server/api/strokes/[id]/promote.post.ts` — 占有の解放を A8 への引き渡しの後ろへ
- `server/utils/stroke/running.ts` — 409 の文言を呼び出し側が与える形に。docblock の「承認（U10）」を U14 へ
- `docs/specs/api/contract.md` — W1/W2 のメッセージ、U2「待っている間だけ読み直す」の記述（design で提案し、承認後に直す）
- `docs/specs/api/sessions/promote.md` — 「占有は…直後に解く」の根拠と区間（同上）
- `docs/adr/0021-no-one-swallows-a-response.md` — この change で起票した ADR
- 画面の契約（endpoint・引数）と MCP ツールの契約は変えない。W1/W2 は種別が増えるだけで口は増えない
