## 1. 分からないことを先に測る

design.md の決定2・決定4・Migration Plan が前提に寄りかかっている。着手の形がここで決まる。

- [ ] 1.1 **proposal を書く口が A7 だけか**を実測する。`sessionProposal(...).write` の呼び出し元を全部数え、A7（`server/api/strokes/[id]/proposal.post.ts`）以外に無いことを確かめる。**在ったら決定2 を design.md に追記して見直す**
- [ ] 1.2 `stateSchema`（`server/utils/stroke/session-store.ts:83-94`・`phase` の `z.discriminatedUnion`）が未知のフィールドを落とすか残すかを実測する。`decision` を持つ `state.json` を旧スキーマで読んで、**読めること**と**書き戻したときに `decision` が消えるかどうか**を見る。design.md Migration Plan は「読めるが、parse で strip され書き戻しで消える」と書いている。**残るなら Migration Plan の巻き戻しの記述を直す**
- [ ] 1.3 昇格の直後に `invocation` を `failed` にしたとき、**プロジェクト一覧の見え方が変わらない**ことを実測する（`server/utils/control/creating.ts` は `invocation` を読まない、が前提）。変わるなら決定4 を見直す
- [ ] 1.4 巡回（`server/plugins/01.retry-failed.ts`）が拾ってキックしたときと、画面がキックしたときで、**渡る値が同じ**ことを確かめる（`kind: 'steering'` と cwd）。巡回は一覧の `path` を渡す
- [ ] 1.5 測った結果を design.md の該当する決定へ追記する

## 2. 判断を持てるようにする

- [ ] 2.1 `server/utils/stroke/session-store.ts` の `SessionState` と `stateSchema` の `proposed` に、判断のフィールドを足す（`decision?: { projectName }`。**`phase` の値は増やさない**・design.md 決定1）
- [ ] 2.2 判断を読む・書く・消すための口を `session-store.ts` に置く。**`phase` を動かさない**ことを型で表す
- [ ] 2.3 単体テストを書く。判断を持つ `state.json` が読めること／持たない既存の `state.json` が「判断なし」として読めること／判断を書いても `phase` が `proposed` のままであること
- [ ] 2.4 **わざと壊して落ちることを確かめる。** 判断の書き込みで `phase` も一緒に書き換えるようにすると、2.3 のどれが落ちるかを目で見る（確かめたら戻す）

## 3. U10 を判断だけの受け口にする

- [ ] 3.1 `server/api/strokes/[id]/approve.post.ts` から、改名（:62）・`phase` の書き込み（:68）・配信（:84）・起動の要求（:98）・`invocation` を倒す後始末（:99-108）・`forgetSubmissions`（:96）を落とす
- [ ] 3.2 残す前提の判定を確かめる。局面（:34-39）・proposal の存在（:44）・名前の衝突（:52）は判断の受理の前提として残す
- [ ] 3.3 「既に判断が記録されているセッションへ重ねて判断を下すことは受理しない」を足す（`api/session/approve`）
- [ ] 3.4 doc コメントを書き直す。**「承認は昇格の唯一の引き金」は残し、「同じ呼び出しの中で走る」を落とす**
- [ ] 3.5 単体テストで、承認を受けても**ディレクトリの名前が変わらない**こと・`phase` が `proposed` のままであること・起動が要求されないことを固定する
- [ ] 3.6 **既に昇格した対象（`phase: 'approved'`）への承認を受理しない**ことを単体で押さえる（`api/session/approve` Scenario「昇格した後に承認が届く」）。:34-36 の分岐が残ることの確認になる
- [ ] 3.7 存在しないセッション id への承認が 404 で何も変えないことを単体で押さえる（同 Scenario「存在しない id で承認が届く」・`requireSessionId`）

## 4. 判断の取り消しを足す

- [ ] 4.1 `DELETE /api/strokes/:id/approve` を **`server/api/strokes/[id]/approve.delete.ts`** に足す（design.md 決定3）。メソッド接尾辞を落とさない——落とすと `GET /api/strokes/:id/approve` でも取り消しに到達する（`api/project/delete`）。同じ path をファイルで分ける形は `send-back.get.ts` / `send-back.post.ts` の先例に揃う
- [ ] 4.2 昇格が済んだ対象（`phase: 'approved'`）への取り消しを受理しない
- [ ] 4.3 取り消しが proposal・ストロークの往復の記録・ディレクトリの中身を**変えない**ことを単体で押さえる
- [ ] 4.4 判断が無いセッションへの取り消しが何も変えないことを押さえる

## 5. proposal の出し直しで判断を失効させる

- [ ] 5.1 A7（`server/api/strokes/[id]/proposal.post.ts`）で、proposal を残せたときに記録された判断を消す（design.md 決定2）
- [ ] 5.2 **失効するのは proposal が出し直された時点であって、差し戻しを送った時点ではない**ことを単体で押さえる（design.md Risks）
- [ ] 5.3 失効した後に昇格を要求すると受理されないことを押さえる
- [ ] 5.4 **わざと壊して落ちることを確かめる。** 5.1 を外すと 5.3 が落ちることを目で見る

## 6. 昇格の受け口を作る

- [ ] 6.1 `server/api/strokes/[id]/promote.post.ts`（新規）を作る。**本文を取らない**（design.md 決定3）
- [ ] 6.2 記録された判断が無ければ受理しない。**責務の不成立として書く**（ADR-0014 補足1・design.md 決定3）
- [ ] 6.3 3.1 で落とした昇格の実体をここへ移す。順序は「衝突確認 → 改名 → `phase` を書く」のまま、書き込みに失敗したら `revertPromotion` で戻す（`project/generation`）
- [ ] 6.4 巻き戻したとき**記録された判断を残す**。同じ判断のまま昇格をやり直せることを単体で押さえる
- [ ] 6.5 `broadcastProjectCreation` をここへ移す（design.md 決定5）。判断の記録では配信しないことを押さえる
- [ ] 6.6 `forgetSubmissions(sessionId)` をここへ移す（昇格で旧 id が用済みになる時点）
- [ ] 6.7 **起動を要求しない。** `invokePath` の `$fetch` をここへ持ち込まないことを、テストで固定する
- [ ] 6.8 昇格の完了時点で `invocation` を `failed` にする（design.md 決定4）。**`writeState` で直に書かず、A8（`submissionPath(projectName)` への POST）を通す**（design.md 決定7）。書き方は `01.retry-failed.ts:54-60` と同じ形に揃える。**なぜ `failed` なのか**を doc コメントに書き、同箇所の同じ用法を参照として置く
- [ ] 6.9 6.8 の A8 呼び出しを**応答を返す前に待ち切る**（design.md 決定7）。昇格の応答を見た側が続けて叩く U13 に追い越されないこと・`agent/invocation:133`「A8 を通してのみ」を破っていないことを、`submissionPath` が呼ばれることの確認としてテストで固定する
- [ ] 6.10 A8 の呼び出しが失敗しても**昇格を巻き戻さない**ことを押さえる（`api/session/promote`「後始末は段ごとに閉じる」）。記録して先へ進む
- [ ] 6.11 存在しないセッション id への昇格が 404 で何も変えないことを単体で押さえる（`api/session/promote` Scenario「存在しない id で昇格が要求される」・`requireSessionId`）
- [ ] 6.12 既に昇格した対象への重ねての昇格を受理しないことを単体で押さえる（同 Scenario「既に昇格した対象を昇格させようとする」）
- [ ] 6.13 `test/server/utils/stroke/promotion-order.test.ts` が引き続き通ること（順序そのものは変えていない）
- [ ] 6.14 `test/server/utils/stroke/creation-broadcast.test.ts` の配信の起点を昇格の段へ移す

## 7. 起動の段を巡回へ引き渡す

- [ ] 7.1 `server/utils/stroke/sweep.ts` と `server/plugins/01.retry-failed.ts` の説明を「失敗した実行」から「**起こし直す対象**」へ揃える。**判定（`shouldRetry`）は1行のまま変えない**（`portal/batch` の MUST NOT）
- [ ] 7.2 同じ doc の指し先を直す。`sweep.ts:7` が「巡回そのものは `server/plugins/02.retry-failed.ts`」と書いているが、実体は **`01.retry-failed.ts`** である（`02` は存在しない）。7.1 で同じ段落を書き直すので、ついでに直す
- [ ] 7.3 昇格した直後の対象を巡回が拾って起動することを、単体または結合で押さえる
- [ ] 7.4 巡回と画面のキックが重なっても二重起動しないことを確かめる。止めるのは U13 の busy ガード（`invoke-agent.get.ts:47` の `beginRun`）
- [ ] 7.5 **わざと壊して落ちることを確かめる。** 6.8 を `idle` に戻すと 7.3 が落ちることを目で見る

## 8. 画面を段を踏む形にする

- [ ] 8.1 `app/composables/useProposalReview.ts` の `approve()`（:372-408）を、**U10（判断）→ U14（昇格）→ U13（起動）**の順に叩く形にする。作法は `sendBack()`（:287-313。受理の POST が :298、起動の要求が :308）に揃える
- [ ] 8.2 段ごとの失敗の扱いを分ける。判断の失敗は今までどおり警告、昇格の失敗は決着の器（`promotionNotice`・:346 → `promotionNoticeDone()`・:349-352 → `promotionFailed`・:344）、起動の失敗は起動の段のやり直しへ
- [ ] 8.3 `retryPromotion()`（:355-358）を、**承認の呼び直し（:357 の `approve()`）ではなく昇格の呼び直し**にする（design.md 決定6）
- [ ] 8.4 `discardSession()`（:361-370）を見直す。**完了条件**——(a) 判断が記録された状態でも `DELETE /api/sessions/:sessionId`（:364）が受理されること（U11 は `approved` を受理しないが、判断の記録は `phase` を動かさないので `proposed` のまま通る。実測で確かめる）／(b) 破棄の後に `/projects` へ戻る（:369）ところまで変えないこと／(c) **判断を取り消してから消す形にしない**——破棄はセッションごと消すのであって、判断だけを戻す `DELETE .../approve`（4章）とは別の道である。この3つを満たしたら手を入れない
- [ ] 8.5 **面のデザインは変えない。** 承認モーダルの確定後は今までどおり自動で昇格へ続き、一覧へ戻る（design.md 決定5・Non-Goals）。ボタンや文言を足さない
- [ ] 8.6 `yarn typecheck` が通る

## 9. 通しで確かめる

- [ ] 9.1 着手時の `yarn test` の本数とファイル数を記録する
- [ ] 9.2 `test/e2e/stroke-exit.spec.ts` / `test/e2e/proposal-persistence.spec.ts` / `test/e2e/workspace.spec.ts` / `test/e2e/agent-question.spec.ts` を、承認から一覧までが段を踏む形で通ることを確かめる（`playwright.config.ts` の `testDir` は `./test/e2e`）。**`yarn build` を挟む**（E2E はビルド済みの `.output/server/index.mjs` に対して走る）
- [ ] 9.3 **段を踏まない呼び方が落ちること**を目で見る。8.1 の昇格の呼び出しを外すと、承認しても一覧に生成中の行が出ないことを E2E で確かめる（確かめたら戻す）
- [ ] 9.4 `yarn test` の増分が、2〜8章で足した分だけであることを確かめる
- [ ] 9.5 **本体 spec の `## Purpose` を直接書き直す。** `openspec/specs/api/session/approve/spec.md:4` が「確定された名前の受け取りから、昇格の実行、次の実行の起こしまでを担い」のままである。**delta の `## Purpose` は既存 capability では無視され、archive にも写らない**（specs の instruction が明記）ので、本体を直接編集するしかない。U10 の責務が「承認の判断を記録すること」だけになったことと、取り消し（`DELETE`）を持つことを書く
- [ ] 9.6 `openspec validate separate-approval-decision-from-promotion --strict --store stroke` が valid であること。**`yarn check` は判定に使わない**（未着手の change を落とすため。先行 change の記録に従う）

## 10. 上位資料への整合反映（ユーザー承認が要る）

`docs/agents/issue-tracker.md`「更新対応」により、**承認前に上位資料を書き換えない**。

- [ ] 10.1 design.md「上位資料への整合反映」の5件をユーザーに諮る
- [ ] 10.2 承認されたら `docs/specs/api/contract.md` の U10（:162-176）を判断の記録だけに縮め、取り消し（`DELETE`）を足す
- [ ] 10.3 承認されたら同 contract.md に U14（昇格）を、一覧の表（:43）と本文へ足す
- [ ] 10.4 承認されたら同 contract.md の U12（:196）に、昇格の直後の `invocation` について1行足す
- [ ] 10.5 承認されたら `docs/specs/plan/portal-stroke-exit.md`「承認ボタン → 一覧へ戻る」の、steering を起こす主体の記述を直す。**自動で始まること自体は変えない**（ADR-0011）
- [ ] 10.6 ADR を起こすかどうかの決めを仰ぐ。**独断で立てない**
- [ ] 10.7 ticket / ADR-0017 の「親との関係」（`update-ui-approval-review` との順序の依存）が実測に当たらないことを報告し、直すかどうかの決めを仰ぐ。**独断で ADR を書き換えない**

## 11. レビューと完了承認

- [ ] 11.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。**レビューが完全にパスするまで続ける**
- [ ] 11.2 ADR-0017 の完了判定4項目を実測で突き合わせる — 判断・昇格・起動が別々に扱えること／判断の後・昇格の前に取り消せること／失敗した段だけをやり直せ後始末が段ごとに分かれていること／**承認がプロジェクト生成の唯一の引き金であることが変わっていない**こと
- [ ] 11.3 ユーザーから完了承認を得る
- [ ] 11.4 成果物を commit する（この worktree のブランチへ直接）。**11.1〜11.3 を通してから**——レビューが直しを出す・突き合わせが穴を見つける・承認が下りないのいずれでも、commit の中身が変わる
