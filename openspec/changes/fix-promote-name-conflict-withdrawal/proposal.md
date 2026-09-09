## Why

`docs/specs/api/sessions/promote.md`「振る舞い」は、**昇格（U14）が name-conflict のときは判断を取り下げて 409 name-conflict を返す**と定めている。実装はそうなっていない——サーバは判断を残したまま 409 を返し、画面（`useProposalReview.ts`）が 409 を見てから自分で `DELETE …/approve` を送って取り下げを補っている。

取り下げの主体が docs と実装で食い違っているため、次の2つが起きる。

- **API を画面以外から使うと規定どおりに動かない。** 衝突で 409 を受けたのに判断が残る。docs を読んで作った呼び手は、取り下げ済みを前提にできない
- **同じ処理が2箇所にある。** 承認（U10）の name-conflict は判断を作らずに弾き、昇格（U14）の name-conflict は画面が後から取り消す。片方だけ直しても揃わない

昇格は**セッションディレクトリの改名だけ**であり（`docs/specs/api/sessions/promote.md`）、衝突は「その判断のままでは二度と昇格できない」失敗である。改名や `phase` の書き込みの失敗（同じ判断のままやり直せる）とは性質が違い、docs はそれを判断の扱いの差——**残す／取り下げる**——で書き分けている。実装をこの書き分けに合わせる。

## What Changes

- **昇格の受け口が、name-conflict を検出したときに判断を取り下げてから 409 name-conflict を返す。** 取り下げは占有（`beginRun`）の中で、改名の前に行う
- **改名・`phase` の書き込みの失敗（500）は今までどおり判断を残す。** 「同じ判断のまま昇格だけをやり直せる」規定は変えない
- **画面から取り下げの補いを外す。** `useProposalReview.promote()` の 409 name-conflict 分岐が送っていた `DELETE …/approve` を削る。衝突した名前を出して別名の入力へ戻す流れ（`conflictName`）と、次の承認が `DELETE` → `POST` の順で判断を下し直す流れはそのまま
- 画面の見た目・操作は変わらない。**BREAKING ではない**——衝突後に画面が次に叩く `DELETE …/approve` は、判断が無ければ何も変えず 204 を返す（`docs/specs/api/sessions/approve.md`「取り下げ」）

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `api/session/promote`: 「U14 POST /api/sessions/:id/promote — 判断のあるセッションを昇格させる」に、名前の衝突で昇格できないときの扱い（判断を取り下げてから伝える）を足す。あわせて「後始末は段ごとに閉じる」の「昇格に失敗したとき…記録された判断は残る」を、改名・`phase` の書き込みで失敗したときに限る形へ直す（無条件のままだと同じ spec の中で自己矛盾する）
- `project/generation`: 「昇格の直前に既存名との衝突を確認する」の THEN に「判断を取り下げる」を足し、取り下げの主体がシステム（サーバ）であることを読める形にする。あわせて「昇格に失敗したら承認を確定させず、宙吊りの状態を作らない」の「失敗したとき…判断もそのまま残る SHALL」も、失敗の種類で分かれる形へ直す

## Impact

- `server/api/strokes/[id]/promote.post.ts` — 占有の中の衝突確認に取り下げを足す。冒頭コメントの書き分けを直す
- `test/server/api/strokes/promote.post.test.ts` — 衝突のケースを「判断はそのまま残る」から「取り下げてから 409」へ。改名・配信・A8 が起きないことも見る
- `app/composables/useProposalReview.ts` — `promote()` の 409 name-conflict 分岐から `DELETE …/approve` を外す
- `docs/` は触らない。基準は `docs/specs/api/sessions/promote.md`・`approve.md` で、実装がそこへ寄る側である
- 依存・API の形（path・メソッド・status・`data.reason`）は変わらない
