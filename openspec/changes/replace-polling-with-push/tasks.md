## 1. 確認と契約（contract-first）

- [ ] 1.1 `useWaitingRetry` の改名の要否をユーザーに確認する（design 決定6）。据え置きが既定で、据え置くなら以降の task は名前を変えない
- [ ] 1.2 `docs/specs/api/api-contract.md` の「WS 配信 — 2本」を3本にし、W3 `/api/strokes/:id/ws/failure`（メッセージ・配信タイミング）を足す
- [ ] 1.3 同ファイルの対称性の表に W3 を足す。**W3 だけは書き手が endpoint ではなくサーバ自身（リトライの尽き）**であることを明記する
- [ ] 1.4 同ファイル U2 の「**回答や差し戻しを送って待っている間だけ**、数秒おきに読み直す」を削り、「リロード時に1回読む」だけにする
- [ ] 1.5 同ファイル「約束」の「502 は無い。リトライを尽くした失敗は `invocation: failed`（U2）で伝わる」を、W3 で伝わる形に直す
- [ ] 1.6 `shared/stroke.ts` に W3 のメッセージ型を1つ足す（`{ invocation: 'failed' }`）。裸の文字列にしない理由は design 決定2（ref の参照が変わらず `watch` が発火しない）

## 2. サーバ（決定1・2・3）

- [ ] 2.1 `server/utils/stroke/ws-channels.ts` に `createRegistry()` をもう1本（`failureChannel`）足す
- [ ] 2.2 `sessionIdFromUrl` の `channel` の union に `'failure'` を足す。`wsPathPattern` は `{channel}` の差し替えで通るため、`docs/specs/core/settings-reference.md` に変更が要らないことを確認する
- [ ] 2.3 `server/routes/api/strokes/[id]/ws/failure.ts` を足す。`sessionExists` の検査 → `register` → `close` で `unregister` まで、既存2本（`ws/question.ts` / `ws/proposal.ts`）と同型にする
- [ ] 2.4 接続時配信を入れる。`state.json` を読み、`phase !== 'approved'` かつ `invocation === 'failed'` のときだけ1件送る（W1 / W2 と同じ規約）
- [ ] 2.5 `server/utils/stroke/ai.ts` の `markInvocationFailed` に publish を1行足す。`phase === 'approved'` の early return より後、`writeState` の後に置く（書いていないものを配信しない）
- [ ] 2.6 `failureChannel.publish` の呼び出しが `markInvocationFailed` の1箇所だけであることを grep で確認する（`running` / `idle` を W3 に載せていないこと・決定2）

## 3. 画面（決定4・5・6）

- [ ] 3.1 `app/composables/useWaitingRetry.ts` の本体を `useSessionChannel(sessionId, 'failure')` の購読へ入れ替え、`useIntervalFn` / `$fetch` / `POLL_INTERVAL_MS` を除く。届いたら `failed = true` / `waiting = false` にする
- [ ] 3.2 `import.meta.server` の early return を除く（決定5。SSR ガードは `useSessionChannel` が持つ）。`startWaiting()` が SSR でも `waiting` を立てる挙動は変えない
- [ ] 3.3 返り値が `{ waiting, failed, startWaiting, stopWaiting }` のままであること、参照3箇所（`pages/strokes/[sessionId]/index.vue:41` / `useAgentQuestion.ts:53` / `useProposalReview.ts:86`）が無変更であることを確認する
- [ ] 3.4 同ファイル冒頭のコメント「通常は W1 / W2 の配信が先に届いて…ポーリングは保険」を、失敗が W3 で届く形に書き直す
- [ ] 3.5 `app/pages/strokes/[sessionId]/index.vue` の初期化から `status.value?.invocation === 'failed'` の分岐を除く（決定3。接続時配信が担う）。`'running'` の分岐は残す
- [ ] 3.6 同ファイル冒頭のコメント「待機・失敗は U2 のポーリングで拾う（task 6.3）」を直す
- [ ] 3.7 `yarn build` と型チェックが無エラーで終わることを確認する

## 4. 追随（docs）

- [ ] 4.1 `docs/specs/architecture/question-flow.md` の「配信」節の図に W3 を足し、`markInvocationFailed` → `failureChannel` → 画面の経路と、W3 の接続時配信（`state.json` を読む）を描く
- [ ] 4.2 同ファイルの「`invocation` は…リトライが尽きたとき `failed`（`server/utils/ai.ts`）」を W3 に触れる形へ直す。**併せて参照先のパスを現物の `server/utils/stroke/ai.ts` に直す**（同じ行を書き直すため後書き側で調整する）
- [ ] 4.3 `docs/specs/core/file-composables.md` の `useWaitingRetry` の3箇所（21行「timer は vueuse の `useIntervalFn` に委譲済み」・283行「HTTP（`GET /api/strokes/<id>` を `useIntervalFn` でポーリング）」・322行〜の節）を、W3 購読の形へ直す
- [ ] 4.4 `docs/specs/reference/stroke-modules.md`（69行）を読み、ポーリング前提の記述があれば直す
- [ ] 4.5 `docs/specs/plan/composables-library-replacement.md` の `useWaitingRetry` = 「部分置換（timer 管理のみ委譲）」「U2 ポーリングのドメイン判定は本体の責務のまま」は本 change で覆る。**spec-workflow 承認済みの資料のため勝手に直さず、追随を入れるかをユーザーに確認する**

## 5. 検証

- [ ] 5.1 `e2e/agent-question.spec.ts:455`（「AI から応答が得られなかったら、面は残って同じ問いに送り直せる」）の失敗局面を、U2 の `page.route` スタブから `page.routeWebSocket` による W3 スタブへ作り替える（決定8）
- [ ] 5.2 待機中に U2（`GET /api/strokes/<id>`）への繰り返し要求が発生しないことを E2E で固定する（`page.on('request')` で回数を数え、待機開始から10秒で1回も増えないこと）
- [ ] 5.3 失敗が決着した瞬間に画面へ届くことを E2E で固定する（W3 スタブから1件送り、旧ポーリング周期（3秒）を待たずに失敗の表示が出ること）
- [ ] 5.4 リトライが尽きた後に画面を開き直すと、接続時配信で失敗が届くことを E2E で固定する（決定3）
- [ ] 5.5 W1 / W2 の決着（次の問い・proposal の出し直し）が現行どおり働くことを、既存 E2E の全件パスで確認する

## 6. レビュー

- [ ] 6.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。レビューが完全にパスするまで繰り返す
