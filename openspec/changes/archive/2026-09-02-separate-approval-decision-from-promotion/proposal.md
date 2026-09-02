## Why

`POST /api/strokes/:id/approve`（U10）は1回の呼び出しで3つを続けて行う。実装（`server/api/strokes/[id]/approve.post.ts`）を読んで確かめた。

1. **判断の前提を見る** — phase が `proposed` か（:34-39）、`docs/proposal.md` が残っているか（:44）、その名前が空いているか（:52）
2. **昇格する** — セッションディレクトリを確定した名前へ改名し（`promoteSessionToProject`・:62）、続けて `phase: 'approved'` を書く（:68）。書き込みが失敗したら改名を戻す（`revertPromotion`・:76）
3. **steering を起こす** — 昇格先を cwd に添えて U13 を叩く（:98）。届かなければ `invocation` を `failed` へ倒す（:105）

**承認の判断は、この中に独立した段として存在していない。** 1 は前提の確認で、判断が確定した印はどこにも書かれない。判断が下りたことを表す唯一の記録は `phase: 'approved'` であり、それは 2 の途中で、改名が済んだ後にしか書かれない。判断・昇格・起動が1本に畳まれていることで、次が付いてくる。

- **判断を戻す形が無い。** 判断が下りた瞬間に改名まで進むので、押し間違いに気づいたときに残っているのはプロジェクトだけである。セッションの削除（U11）は `approved` を受理せず（`docs/specs/api/contract.md:184`）、残る手はプロジェクトごと消すこと（`api/project/delete`）で、**ストロークの往復の記録ごと消える**。戻せるのは「無かったことにする」形だけで、「判断を取り下げてもう一度読む」形が無い
- **後始末が段ごとに分かれていない。** 2 の失敗は改名を戻すことで拾い（:74-78）、3 の失敗は `invocation` を倒すことで拾う（:99-108）。どちらも `approve.post.ts` の中にあり、どの段で落ちたかで戻す先が変わる分岐はここにしかない。**やり直しの入口は承認の再実行1つだけ**で、段を選べない
- **昇格した後にしか steering を起こせない。** 3 は改名の成功に続けてしか走らない。届かなかったときの受け皿は巡回（`server/plugins/01.retry-failed.ts`）で、そこへ渡すために endpoint が `invocation` を `failed` へ倒す。**起動の段の後始末が、承認の endpoint と巡回の2箇所に割れている**

**`CONTEXT.md` の「承認はプロジェクト生成の唯一の引き金」は変えない。** 引き金であることと、同じ操作の中で全部を走らせることは別である。昇格は承認の判断が下りているときにだけ起こる、という関係はそのまま残す。

### ticket が挙げる押し間違いの根拠は、この画面には当たらなかった

ticket と ADR-0017 は「`update-ui-approval-review` が承認と即時却下を同じ並びに置くので、隣り合うぶん押し間違いの危険が増える」を理由の1つに挙げ、両者の順序を決めてから着手することを求めている。**裏を取ったところ、この2つは別の承認である。**

- U10 を叩くのは proposal 確認の画面（`app/pages/strokes/[sessionId]/proposal.vue:108`「承認して作る」→ `useProposalReview.ts:328-331` の `openApprove()` → 確認モーダル `app/components/review/Modals.vue:70-92` →「作る」→ `useProposalReview.ts:372` の `approve()`）。**この画面には既に確認モーダルが挟まっており、1押しでは確定しない。** 隣に並ぶのは差し戻しだけで、却下は無い
- `update-ui-approval-review` が並べ替えるのは**本家 spec-workflow の承認依頼**を扱う画面（`app/components/workspace/ApprovalCard.vue`・`app/pages/projects/[projectId]/approvals/`）で、送り先は `POST /api/projects/:projectId/approvals/:id/:action` である。U10 は出てこない

したがって**順序の依存は無く、どちらを先に通してもよい**。判断を戻せるようにする理由は押し間違いの確率ではなく、上の1つ目——判断を取り下げる形が系に無く、戻し方が「往復の記録ごと消す」しかないこと——である。

## What Changes

**承認の判断・昇格・steering の起動を、それぞれ自分の受け口を持つ段にする。**

- **U10 `POST /api/strokes/:id/approve` は承認の判断だけを受ける。** 確定した名前を伴う判断を記録して返す。**改名しない・`phase` を動かさない・起動しない。** 判断が記録されている間もセッションはセッションのままで、一覧に生成中としては現れない
- **`DELETE /api/strokes/:id/approve` を足す。** 記録した判断を取り下げる。昇格が済んだ後は受理しない——そこから先は取り消しではなくプロジェクトの削除である
- **昇格の受け口を新設する。** 判断が記録されているセッションを、確定した名前へ改名して `phase: 'approved'` にする。**判断が無ければ受理しない**（承認が唯一の引き金であることは、ここで守られる）。**起動しない**
- **steering の起動は U13 のまま**で、昇格の受け口はそれを呼ばない。受理と起動を分けるのは U9 差し戻しと同じ既存の作法（`useProposalReview.ts:287-313`）であり、U10 だけがそこから外れていた
- **判断は、それが下された proposal に結びつける。** proposal が出し直されたら判断は失効する。差し戻しの後に古い判断で昇格が通る道を作らない
- **後始末を段ごとに閉じる。** 判断の記録に失敗したら何も起きていない。昇格に失敗したら改名を戻して判断は残す（同じ判断でやり直せる）。起動に失敗したら昇格は残し、起動の段だけをやり直す
- **BREAKING**: U10 の応答が返った時点の意味が変わる。いまは「プロジェクトが在る」だったものが「判断が記録された」になる。画面は承認の後に昇格を要求する必要があり、`project-creation` の配信も昇格の段へ移る

**変えないもの。** 承認が昇格の唯一の引き金であること。昇格が改名だけであること（`project/generation`）。`.spec-workflow/` を作らないこと。生成中の判定がファイルシステムの事実だけに拠ること。巡回が `failed` だけを拾うこと（`portal/batch`）。

## Capabilities

### New Capabilities

- `api/session/promote`: 判断が記録されたセッションをプロジェクトへ昇格させる受け口。判断が無ければ受理せず、昇格の成否だけを返し、次の実行を起こさない

### Modified Capabilities

- `api/session/approve`: U10 の責務を「承認の判断を記録すること」だけに絞る。いまの spec は同じ endpoint に昇格の実行と次の実行の起こしまでを負わせている（`昇格が成功したら次の実行を起こし`）。判断の取り消しと、proposal の出し直しによる失効を足す
- `project/generation`: 昇格が承認と同じ呼び出しの中で起きるという前提を、記録された判断を引き金とする形へ改める。「改名を先に行い、成功してから `phase` を `approved` にする」順序と、「`approved` かつ未改名の宙吊りを作らない」禁止はそのまま残す——判断の記録は `phase` を動かさないので、この禁止は昇格の段の中で今までどおり成立する

**`agent/invocation` は挙げない。** 挙げるかどうかを検討したうえで、挙げない。昇格の受け口は `invocation` を `failed` にするが（design.md 決定4）、その書き込みを **A8 経由に倒す**ので（design.md 決定7）、`agent/invocation:133`「`invocation` の書き込みは A8 を通してのみ行う SHALL」は破れない。値の集合も遷移の意味も変わらない。**いまの `approve.post.ts:105` はこの SHALL に反しており、この change はそれを新しい受け口へ移植せずに解消する**——例外を spec で認める delta は書かない。

## Impact

**サーバー**

- `server/api/strokes/[id]/approve.post.ts` — 改名・`phase` の書き込み・起動の要求・`invocation` を倒す後始末を落とし、判断の記録だけにする
- `server/api/strokes/[id]/approve.delete.ts`（新規）— 判断の取り消し。同じ path をメソッドで振り分ける（design.md 決定3）
- `server/api/strokes/[id]/promote.post.ts`（新規）— 昇格の受け口。`assertNameAvailable` → `promoteSessionToProject` → `phase` の書き込み → `revertPromotion` の巻き戻しと、`broadcastProjectCreation` がここへ移る。起こし直しの目印（`invocation: 'failed'`）は**直に書かず A8 を通す**（design.md 決定7）
- `server/utils/stroke/session-store.ts` — 判断を持つ場所。`stateSchema` の `proposed` に判断のフィールドが増える（`phase` の値は増やさない）
- `server/utils/stroke/project.ts` — 変更なしの見込み。改名と巻き戻しの実体は既に段として切り出されている
- `server/api/strokes/[id]/proposal.post.ts`（A7）— proposal の出し直しで判断を失効させる
- `server/plugins/01.retry-failed.ts` / `server/utils/stroke/sweep.ts` — 判定は変えない。昇格の段が起動の段へ何を残すかは design で決める

**画面**

- `app/composables/useProposalReview.ts` — `approve()` が承認 → 昇格 → 起動の3段を順に叩く形になる。`promotionFailed` / `retryPromotion` / `discardSession` の「決着の器」は残るが、やり直しの単位が段になる
- `app/pages/strokes/[sessionId]/proposal.vue` — 承認後・昇格前の局面が画面に現れる。**この change では面のデザインを決めない**（`ui.md` を作らない）。決めるのは段と受け口であり、面の置き方は後続に委ねる

**共有型**

- `shared/stroke.ts` — `Phase` は `stroking | proposed | approved` のまま増やさない。判断は `proposed` の状態として持つ

**テスト**

- `test/server/utils/stroke/promotion-order.test.ts` — 昇格の順序を固定している。段が移るだけで順序は変わらない想定
- `test/server/utils/stroke/creation-broadcast.test.ts` — 配信の起点が昇格の段へ移る
- `test/e2e/stroke-exit.spec.ts` / `test/e2e/proposal-persistence.spec.ts` / `test/e2e/workspace.spec.ts` — 承認から一覧までの流れが段を踏む形になる

**上位資料（`docs/`）**

- `docs/specs/api/contract.md` の U10（:162-176）は、承認が改名と起動まで行うことを規定している。**この change で食い違いが出るが、書き換えは design.md で提案し、ユーザー承認を得るまで行わない**（`docs/agents/issue-tracker.md`「更新対応」）
- `docs/adr/0011-steering-stage-follows-approval.md`（archive 済み・確定先は `docs/specs/plan/portal-stroke-exit.md`）は「承認ボタン → 一覧へ戻る」を定めている。**自動で始まること自体は変えない**が、起こす主体が承認の endpoint でなくなる

**他の change との関係**

- `update-ui-approval-review` とは**独立**（上の「押し間違いの根拠」節。触る画面も endpoint も重ならない）
- `fix-approved-project-not-listed` / `update-project-list-view` は昇格後の一覧を扱う。昇格の段そのものは変わらないので影響しない見込み

## 私が取った決め（未承認の仮定）

この change では**ユーザーへの grilling を行っていない**（`/AskUserQuestion` を使っていない）。上に並ぶ主張——ticket の前提を覆したこと・**BREAKING** の宣言・design.md の決定1〜7——は、**いずれも実装と spec を読んで私が取ったもので、ユーザーの承認を得ていない。** 差し戻す場合はこの表の行を指すこと。

| 件 | 決め | 理由 |
| --- | --- | --- |
| ticket 反証（順序依存） | **`update-ui-approval-review` との順序依存は無い。どちらを先に通してもよい** | 実測で、U10 を叩く画面（proposal 確認）と `update-ui-approval-review` が並べ替える画面（本家 spec-workflow の承認依頼）が別物だった。ticket と ADR-0017 の記述は覆るが、**ADR は独断で直さず諮る**（design.md「ticket / ADR-0017 の記述との食い違い」・tasks 10.7） |
| U10 の意味を変える | **BREAKING として宣言し、互換の受け口を残さない** | 「承認したらプロジェクトが在る」を残したまま段を分けると、判断だけの状態が2通りに読める。呼び出し側は E2E 3本で押さえられる範囲に閉じている |
| 決定1 | **判断は `state.json` の `proposed` 状態に持たせ、`Phase` の値は増やさない** | `Phase` の3値は phase 判定・画面・contract が前提にしている。「判断が下りてもセッションはセッションのまま」がこの change の骨子なので、局面を増やすのは筋が違う |
| 決定2 | **失効は「proposal を書く口（A7）が判断を消す」で実現し、版の印を持たない** | 書く口が1つなら、そこで消せば足りる。**ただし前提に依存する**ので tasks 1.1 で実測し、テストで固定する |
| 決定3 | **昇格の受け口は `POST /api/strokes/:id/promote`。名前を引数に取らない。取り消しは `approve.delete.ts`** | 名前はユーザーが確定したもので、昇格はシステムの動作。引数で受けると判断と違う名前で昇格できてしまう。`promote` という動詞句はストローク側の受け口の並びに沿う |
| 決定4 | **昇格の完了時点の `invocation` を `failed` にする** | 巡回は `failed` しか拾わない。`idle` のまま残すと、起動が一度も届かなかった対象を誰も起こし直さない。値を増やすと `portal/batch` の MUST NOT（巡回に条件を足さない）に正面から反する |
| `failed` 語彙の流用 | **失敗していないのに `failed` と書くことを受け入れる** | 系は既にこの値を「起こし直す対象」の意味で使っている（`server/plugins/01.retry-failed.ts:54-60` は前プロセスの残骸を「失敗したから」ではなく「誰も起こし直さないから」倒している）。**語彙のずれは残る**——値を増やさない代わりに、doc の説明を「失敗した実行」から「起こし直す対象」へ揃える（tasks 7.1） |
| 決定5 | **3段を叩くのは昇格を要求した側（画面）。承認モーダルの確定後は自動で昇格へ続ける** | 今の体験（承認 → 一覧へ戻る）を変えない。取り消せる余地は「API としてそこに在る」ことで満たし、面の置き方は後続に委ねる |
| 決定6 | **昇格の失敗の器は残し、「やり直す」を昇格の呼び直しに変える** | 器そのものは `project/generation` が規定している。変えるのは中身だけ |
| 決定7 | **昇格の受け口は `invocation` を直に書かず、A8 を通して倒す** | `agent/invocation:133` の「A8 を通してのみ」を破らない。**いまの `approve.post.ts:105` はこれに反しており、新しい受け口へ移植しないという判断である。** `agent/invocation` に例外を認める delta を書く道は採らなかった |
| 面のデザインを決めない | **`ui.md` を作らず、取り消しをどこに出すかは後続へ委ねる** | この change が問うているのは段と受け口である。面まで決めると、承認しない限り段の話が進まなくなる |
| 上位資料 | **`docs/` と ADR を1行も書き換えない** | `docs/agents/issue-tracker.md`「更新対応」により、整合反映は design.md で提案し承認を得るまで行わない（design.md「上位資料への整合反映」5件・tasks 10章） |
