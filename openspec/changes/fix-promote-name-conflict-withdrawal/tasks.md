## 1. ticket

- [x] 1.1 `openspec/tickets/fix-promote-name-conflict-withdrawal.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `fix-promote-name-conflict-withdrawal/child-11` を追記する（`docs/agents/issue-tracker.md`「ticket の起票」）。`tags` は追記のみで既存の項目を消さない

## 2. 昇格の受け口に取り下げを置く（specs `api/session/promote`・`project/generation`。design D1・D2・D3）

対象は `server/api/strokes/[id]/promote.post.ts`。

- [x] 2.1 409 の理由の印（`conflict()` が `data.reason` に載せるもの）が name-conflict かを見る述語を、このファイルにローカルで置く（design D2）。置き場は endpoint の docstring より上（helper → doc → handler。`answer.post.ts` と同じ並び）
- [x] 2.2 占有（`beginRun`）の中の衝突確認を `try`/`catch` で包み、name-conflict のときだけ `writeState(sessionId, withoutDecision(state))` で判断を取り下げてから、受け取った 409 をそのまま投げ直す（design D1）
- [x] 2.3 `catch` は `assertNameAvailable` と `promoteSessionToProject` の両方を覆う。衝突を投げうる口は2つある——`promoteSessionToProject` が改名の直前にもう一度同じ確認を通すため（design D1。santa-method レビュー1周目の指摘）
- [x] 2.4 name-conflict 以外（名前の形が不正な 400・改名が転んだ 500）では取り下げず、そのまま投げ直すことを分岐で担保する（design D2）
- [x] 2.5 取り下げの書き込みが失敗したときは、その失敗をそのまま外へ出す。409 で上書きしない（design D3）
- [x] 2.6 `phase` の書き込み（`writeState`）の失敗は今までどおり判断を残す。`revertPromotion` の巻き戻しには触れない
- [x] 2.7 冒頭コメントの「衝突確認は改名の**前**に通す。既にあれば何も動かさずに 409 で、セッションは `proposed`・判断つきのまま残る」を、基準（`docs/specs/api/sessions/promote.md`「振る舞い」）の書き分け——**衝突は判断を取り下げてから 409／改名・書き込みの失敗は判断を残す**——へ書き直す
- [x] 2.8 同じ doc の「どの時点で失敗しても、セッションは元の名前・`proposed`・**判断はそのまま**で残り」を、失敗の種類で判断の扱いが分かれる旨へ直す
- [x] 2.9 取り下げを `withStateLock(sessionId, …)` で囲み、その中で `readState` し直してから書く。読み直した時点で判断が無ければ何もしない（design D1b。santa-method レビュー1周目・2周目の指摘）

## 3. テストを規定へ合わせる

対象は `test/server/api/strokes/promote.post.test.ts`。

- [x] 3.1 「衝突は改名の前に弾く。判断はそのまま残る」を「衝突は改名の前に弾き、判断を取り下げてから 409 name-conflict を返す」へ書き換える
- [x] 3.2 そのケースで `writeState` がセッション id へ判断の無い `state`（`decision` を持たない）を書いたことを検証する
- [x] 3.3 同じケースで改名（`promoteSessionToProject`）・配信（`broadcastProjectCreation`）・提出記録の破棄（`forgetSubmissions`）・A8（`$fetch`）のいずれも起きないことを検証する
- [x] 3.4 name-conflict 以外の失敗（名前の形が不正な 400）では判断を取り下げないケースを足す（design D2 が守られていることの回帰）
- [x] 3.5 改名の直前の二度目の衝突確認（`promoteSessionToProject` が投げる name-conflict）でも取り下げてから 409 を返すケースを足す（santa-method レビュー1周目の指摘）
- [x] 3.6 衝突で取り下げたときも占有が解放され、取り下げが解放より前（占有の中）で起きることを順序で検証する（santa-method レビュー1周目の指摘）
- [x] 3.7 「phase の書き込みに失敗したら改名を戻し、判断には触れない」「改名に失敗したら phase を書かず、判断には触れない」は今のまま通ることを確認する
- [x] 3.7b 取り下げが読み直してから書くこと（読み直した時点で判断が無ければ何も書かない）を検証する（santa-method レビュー2周目の指摘）
- [x] 3.8 冒頭コメントの「失敗したら改名を戻して判断は残す」を、改名・書き込みの失敗に限る旨へ直す
- [x] 3.9 `test/server/utils/stroke/project.test.ts` の衝突2ケースに `data: { reason: 'name-conflict' }` を足し、受け口が分岐に使う印を実物に対して固定する（santa-method レビュー2周目の指摘）

## 4. 画面から補いを外す（design D4）

対象は `app/composables/useProposalReview.ts`。

- [x] 4.1 `promote()` の 409 name-conflict 分岐から、判断を取り下げる `DELETE …/approve` の1行（`.catch(() => undefined)` つき）を削る
- [x] 4.2 その分岐のコメントを、**サーバが取り下げる**旨（`specs/api/session/promote`・`project/generation`）へ書き直す
- [x] 4.3 `conflictName` を立てて別名の入力へ戻す流れ、`approve()` の `DELETE` → `POST`、`retryPromotion()` は変えない（design D4）

## 5. spec の自己矛盾を残さない（santa-method レビュー1周目の指摘）

- [x] 5.1 `api/session/promote`「後始末は段ごとに閉じる」の「昇格に失敗したとき…記録された判断は残る」を、改名・`phase` の書き込みで失敗したときに限る形へ MODIFIED で直す
- [x] 5.2 `project/generation`「昇格に失敗したら承認を確定させず、宙吊りの状態を作らない」の「失敗したとき…判断もそのまま残る SHALL」も同じ形へ MODIFIED で直す
- [x] 5.3 同 Requirement の Scenario「環境が名前を受け付けない」の THEN を、取り下げの主体がユーザーであること（名前の衝突＝システムが取り下げる、とは別）が読める形へ直す（santa-method レビュー2周目の指摘）
- [x] 5.4 proposal.md の Modified Capabilities と design.md の D1・D1b・D2 を、上の追加と `catch` の範囲・`withStateLock` に合わせて更新する

## 6. 検証

- [x] 6.1 `yarn typecheck` を worktree で通す —— EXIT=0
- [x] 6.2 `yarn test` を worktree で通す —— 78 files / 1018 tests passed
- [x] 6.3 `openspec validate --all --store stroke` を通す —— この change は `✓`。他 9 件の `✗` はこの change の外の既存 change（`create-feature` ほか）で、以前から失敗している
- [x] 6.4 issue #11 の完了条件を自分で確かめる —— 下記「完了条件の確認」

### 完了条件の確認

- **衝突する名前で昇格を要求すると 409 name-conflict が返る** —— `promote.post.test.ts`「衝突は改名の前に弾き、判断を取り下げてから 409 name-conflict を返す」が `toMatchObject({ statusCode: 409, data: { reason: 'name-conflict' } })` で確認。改名の直前の二度目の確認から出た衝突も同じ（3.5）
- **その後、記録された判断が無い** —— 同テストが `writeState(SESSION, { phase: 'proposed', currentQuestion: null, invocation: 'idle', retries: 0 })`（`decision` 無し）を確認。**なお U2（`GET /api/strokes/:id`）は `phase`・`invocation`・`path` しか返さず `decision` を載せない**（`server/api/strokes/[id]/index.get.ts`）。判断の有無が外から見えるのは `state.json` と、U10（`POST …/approve`）が「重ねての判断」で 409 phase を返すかどうか（`approve.post.ts`）である
- **改名・配信・A8 は起きていない** —— 同テストが `promoteSessionToProject` / `broadcastProjectCreation` / `forgetSubmissions` / `$fetch` の不発を確認
- **画面が衝突後に別名で承認し直せる（`DELETE` → `POST` → `promote`）** —— 取り下げ済みなので `DELETE` は判断が無く 204 で何も変えず（`approve.delete.ts`）、`POST` は `state.decision === undefined` なので受理される（`approve.post.ts`）。`promote` 側は「取り下げた後に別の名前で承認し直せば、その名前で昇格する」で確認

## 7. レビュー

- [x] 7.1 `/santa-method` で独立レビュアー2体を回した。`typescript-reviewer` エージェントはこの環境に無いため、既定のレビュアー構成で代替（親 change `fix-server-api-layout` design.md「Risks」）
  - **1周目** — レビュアーC は PASS、レビュアーB は FAIL（critical 3件）。指摘と対応:
    1. **`promoteSessionToProject` の二度目の `assertNameAvailable` から出た衝突が `catch` の外にあり、判断が取り下げられない** → `catch` の範囲を改名まで広げた（2.3）。回帰テストを足した（3.5）
    2. **`isNameConflict` を endpoint の docstring と handler の間に挟んだため、70 行の doc が handler から切り離れた** → helper を doc の上へ移した（2.1）
    3. **同じ spec の兄弟 Requirement（`後始末は段ごとに閉じる`・`昇格に失敗したら承認を確定させず…`）が「判断は残る」と無条件のまま残り、archive 後に自己矛盾する** → 両方を MODIFIED で直した（5.1・5.2）
  - 反映した suggestion — 衝突経路の `endRun`／取り下げの順序の検証（3.6）、tasks のチェックボックス更新
  - **2周目** — 新しいレビュアー2体。一方は PASS、もう一方は FAIL（critical 1件）。指摘と対応:
    1. **「占有前に読んだ `state` はこの間に書き換わることはない」というコメントの断言が成り立たない** —— 根拠に挙げた2つの書き手のうち承認（U10）を反証できていない。U10 は busy ガードの対象外で（`approve.post.ts`「busy ガードは U7・U9 のみ」）、この占有も U10 を止めない。スナップショットを丸ごと書き戻すと間に入った書き込みが消える → 1周目に見送った `withStateLock` を採り、**中で読み直してから書く**形にした（design D1b・2.9）。回帰テストを足した（3.7b）
  - 反映した suggestion（2周目）— `project.test.ts` で 409 の理由の印を固定（3.9）、`project/generation` の Scenario「環境が名前を受け付けない」の主体を明示（5.3）
  - **反映しなかった指摘が2件（いずれも「この change では変えない」）**
    - `docs/specs/api/sessions/promote.md` 行11「どの時点で失敗しても…判断そのままで残り」が行12 の name-conflict 規定と緩く矛盾している —— **docs は触らない**指示どおり。openspec 側は今回そろえたので、docs 側は別 change で拾う
    - `retryPromotion()` から入った 409 name-conflict は `conflictName` を立てるだけで画面に文言が出ない（承認モーダルが閉じているため）—— 変更前からの挙動で regression ではない。design の Risks に記録した
  - **3周目** — さらに新しいレビュアー2体で再レビューし、両方 PASS

## 8. 締め

- [ ] 8.1 change の成果物を commit する（worktree のブランチ `fix-promote-name-conflict-withdrawal` へ）
- [ ] 8.2 ユーザーから完了承認を得て、`openspec/tickets/fix-promote-name-conflict-withdrawal.md` の `status` を `Wait-for-archive` にする —— **親 change `fix-server-api-layout` が PR のマージをもって代行する**（親 design.md D3）。この change の担当はここへ手を付けない
