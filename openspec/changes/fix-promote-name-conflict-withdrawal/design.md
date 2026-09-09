## Context

動機は proposal.md（Why）。ここは**取り下げをサーバのどこへ置くか**と、**画面から補いを外したときに何が残るか**を決める。

現状と制約:

- 昇格（U14）の受け口は `server/api/strokes/[id]/promote.post.ts`。占有（`beginRun`）の中で「衝突確認（`assertNameAvailable`）→ 改名（`promoteSessionToProject`）→ `phase` を書く（`writeState`）」を回し、`finally` で占有を解く
- `assertNameAvailable` は 409 name-conflict（`conflict('name-conflict', …)` = `data.reason` に印が乗る）と、名前の形が不正なときの 400 の2種を投げうる（`server/utils/stroke/project.ts`）
- 判断の取り下げは U10 の取り下げ（`server/api/strokes/[id]/approve.delete.ts`）が `writeState(sessionId, withoutDecision(state))` で行っている。`withoutDecision` は `ProposedState` を受けて `ProposedState` を返す（`server/utils/stroke/session-store.ts`）
- 画面は `useProposalReview.promote()` の 409 name-conflict 分岐で `DELETE …/approve` を送り、`conflictName` を立てて別名の入力へ戻している
- 基準は `docs/specs/api/sessions/promote.md`（name-conflict は判断を取り下げて 409。改名・`phase` 書き込みの失敗は判断を残す）と `docs/specs/api/sessions/approve.md`（取り下げは判断が無ければ何も変えず 204）。**どちらも書き換えない**

## Goals / Non-Goals

**Goals:**

- 昇格の受け口だけを見て「衝突なら判断は残っていない」と言える状態にする。呼び手が画面かどうかに依らない
- 判断を「残す失敗」と「取り下げる失敗」の書き分けを、コードの分岐と冒頭コメントの両方で読めるようにする
- 画面から取り下げの補いを外し、同じ処理が2箇所に無い状態にする

**Non-Goals:**

- U10（判断の記録）の name-conflict 確認を変えること。記録の時点で衝突すれば判断を作らずに 409 で、docs どおり
- endpoint の path・メソッド・status・`data.reason` の形を変えること
- 画面の見た目・操作の変更（`ui.md` を作らないのはこのため）
- `docs/` の書き換え。**関連 docs の書き換えは無い**——name-conflict 時の判断の扱いを書いているのは `docs/specs/api/sessions/promote.md`・`approve.md` だけで、そこが基準の側である

## Decisions

### D1. 取り下げは占有（`beginRun`）の中、衝突を検出したその場で行う

衝突確認（`assertNameAvailable`）と改名（`promoteSessionToProject`）を1つの `try`/`catch` で包み、name-conflict だったときだけ `writeState(sessionId, withoutDecision(state))` を通してから、受け取った 409 をそのまま投げ直す。

- **`catch` が改名まで覆う理由** — 衝突を投げうる口は2つある。ここの `assertNameAvailable` と、`promoteSessionToProject` が `rename` の直前にもう一度通す同じ確認（`rename` は相手が空ディレクトリだと黙って置き換えうるための二度目。`server/utils/stroke/project.ts`）である。1回目の確認と改名の間に同じ名前が現れる並び（別セッションの並行昇格など）があり、そこから出た 409 も規定の上では同じ「名前の衝突」なので、扱いを分けない。改名そのものの失敗は 500（`data.reason` を持たない）なので、同じ `catch` に入っても D2 の判定で取り下げの対象にならない
- 代替: 1回目の `assertNameAvailable` だけを包む → 二度目の確認から出た衝突で判断が残り、`api/session/promote` の「名前の衝突だけは例外とし…取り下げてから…返す SHALL」を条件付きでしか満たせない。却下

- **占有の中に置く理由** — 衝突の確認と判断の書き換えは1つの区間である。占有の外（`finally` の後）へ出すと、確認から取り下げまでの間に同じ対象の起動が割り込める。占有の区間を「衝突確認 → 改名 → `phase` 書き込み」に絞る規定（`api/session/promote`「対象で実行中の呼び出しがある間は昇格させない」）は区間を**縮める**ことを禁じていない範囲で読むより、既に区間内にある衝突確認と同じ場所へ足すほうが素直
- **`writeState` を直に使う理由** — U10 の取り下げ（`approve.delete.ts`）と同じ書き方。判断の書き込み口は `withDecision` / `withoutDecision` を通す型で既に絞られている（`phase` を動かす書き方は型で通らない）。取り下げのためだけに内部 `$fetch` で `DELETE …/approve` を叩くのは、同じ処理を経由の分だけ遠回りにするだけで、`invocation` の A8 のような「書き込み口を1つに保つ」規定も無い
- 代替: 取り下げを `promoteSessionToProject` 側（`server/utils/stroke/project.ts`）へ入れる → あの関数はファイルの移動だけを知る道具で、セッションの判断を知らない。責務が混ざる。却下

### D1b. 取り下げは `withStateLock` の中で読み直してから書く

冒頭で読んだ `state` を書き戻さず、`withStateLock(sessionId, …)` の中で `readState` し直し、そこでもまだ判断があるときだけ `withoutDecision` を書く。

- **スナップショットを書き戻せない理由** — 冒頭の `readState` は占有（`beginRun`）を取る前で、そこから衝突の検出までの間に判断が入れ替わりうる。**承認（U10）は busy ガードの対象外**であり（`approve.post.ts`「busy ガードは U7・U9 のみ。承認はエージェントの呼び出しを起動しないため対象にしない」）、この占有も U10 を止めない。古いスナップショットを丸ごと書き戻すと、間に入った書き込みが黙って消える
- **`withStateLock` を使う理由** — `state.json` の read-modify-write をこの repo で直列化する既定の書き方であり、`writeInvocation`（`session-store.ts`）・`activate.post.ts`・`invoke.ts` が同じ形を取っている
- **読み直して判断が無ければ何もしない** — 取り下げの目的は既に達している。`approve.delete.ts`「判断が無ければ何も変えない」と同じ判定
- 代替: コメントで「この間に書き換わることはない」と断る → U10 を止める仕組みが無いので、その断りは成り立たない。却下（santa-method レビュー2周目の指摘）

### D2. 取り下げるのは name-conflict のときだけ。判定は `data.reason` の印で行う

`catch` に入る失敗は3種ある——衝突の 409、名前の形が不正な 400（`assertProjectName`）、改名が転んだ 500（`promoteSessionToProject`）。後ろ2つは衝突ではないので取り下げない。判定は 409 の理由の印（`conflict()` が `data.reason` に載せるもの）を読む小さな述語を `promote.post.ts` にローカルで置く。置き場は endpoint の docstring より**上**——この repo は helper → endpoint doc → handler の順で並べており（`server/api/strokes/[id]/answer.post.ts`）、doc と handler の間に挟むと doc が handler から離れる。

- 代替: `statusCode === 409` だけで判定する → この受け口の中で 409 になりうるのは衝突だけだが、`assertNameAvailable` の中身が増えたときに黙って壊れる。印を読むほうが意図に近い。却下
- 代替: 述語を `server/utils/stroke/conflict.ts` へ公開の helper として置く → 置き場としては筋が通るが、読む側が今のところ1箇所しかない。**issue の「修正するファイル」の外へ出る**ので、2箇所目が要るまで待つ。却下

### D3. 取り下げの書き込みが失敗したら、その失敗をそのまま返す（409 に上書きしない）

`writeState` が失敗したときは、その例外が 409 の代わりに外へ出る（500 相当）。取り下げを握り潰して 409 name-conflict を返すことはしない。

- **理由** — 取り下げが書けていないのに「取り下げた」ことになっている 409 を返すと、応答と `state.json` が食い違う。`api/session/promote` の新しい規定（衝突なら判断は取り下げられている）を破った応答を作るより、書けなかったことを伝えるほうが正しい
- **失われるものは無い** — 判断は残っているので、画面は次の承認（`DELETE` → `POST`）で今までどおり置き換えられる。画面には「昇格の実行が失敗した」器（`promotionNotice`）が出る
- 代替: `.catch(() => undefined)` で握り潰して必ず 409 を返す → 画面の流れは滑らかになるが、嘘の 409 を作る。却下
- **これは issue に無い決めである。** 挙動の差は「取り下げの `state.json` 書き込みが I/O で失敗した」という稀な経路に限られ、docs にも規定が無い。上の理由で自分で決めた

### D4. 画面は 409 name-conflict を「取り下げ済み」として扱う。次の承認は `DELETE` → `POST` のまま

`promote()` の 409 name-conflict 分岐から `DELETE …/approve` を外し、`conflictName` を立てるだけにする。次の承認（`approve()`）は今までどおり `DELETE` → `POST` を送る。

- **`DELETE` を残す理由** — `approve()` の `DELETE` は衝突のためだけのものではない。「承認と昇格の間で画面が落ちたセッションを開き直したときに残っている判断を置き換える」ための道であり、判断が無ければ何も変えず 204（`docs/specs/api/sessions/approve.md`「取り下げ」）。衝突の後に通っても無害な1往復で、これを消すと別の経路が壊れる
- 代替: `approve()` の `DELETE` も外す → 重ねての判断は 409 phase で弾かれる（`api/session/approve`）ので、開き直しの経路が壊れる。却下
- `retryPromotion()`（決着の器の「やり直す」）は 500 の経路からしか立たないので触らない

## Risks / Trade-offs

- [衝突の後、画面が送る `DELETE …/approve` が 1 往復だけ無駄になる] → 判断が無ければ 204 で何も変えない仕様（`approve.md`）どおりの往復であり、衝突以外の経路で要る。残す
- [取り下げの書き込みが失敗したとき、画面に出るのが「プロジェクトを作れませんでした」ではなく決着の器（やり直す／破棄する）になる] → D3。判断は残っているので「やり直す」で同じ判断のまま再試行でき、そこで再び衝突すれば今度は取り下げが走る。詰まらない。ただし `retryPromotion()` から入った 409 name-conflict は `conflictName` を立てるだけで、承認モーダルが閉じているため画面に文言が出ない（`Modals.vue` は承認モーダルの中でしか出さない）。**これは変更前からの挙動で、この change では変えない**——D3 の経路が新しくここへ繋がるので、拾うなら別 change（santa-method レビュー2周目の指摘）
- [サーバが取り下げるようになったことを知らない別の呼び手が、衝突の後に `DELETE …/approve` を送る] → 204 で何も変わらない。壊れない
- [占有の中で書き込みが1つ増える] → 増えるのは衝突したときだけで、その場合は改名も `phase` の書き込みも走らない。占有の長さは実質変わらない

## Migration Plan

1. `promote.post.ts` に取り下げを足し、冒頭コメントの書き分け（残す／取り下げる）を直す
2. `promote.post.test.ts` の衝突のケースを書き換える（`decision` が消える・改名／配信／A8 が起きない）
3. `useProposalReview.ts` の 409 name-conflict 分岐から `DELETE …/approve` を外し、コメントをサーバが取り下げる旨へ
4. `yarn test`・`yarn typecheck`

巻き戻し: 3 ファイルだけの変更で、単独でリバートできる。リバートすると docs との食い違いが元に戻るだけで、画面は自分で取り下げる形に戻る。

## Open Questions

なし。D3 は issue に無い決めだが、この change の中で決め切っている（先送りしていない）。
