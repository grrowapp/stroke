# add-activated-phase — tasks

区間はこの形で確定している。

```
approved ──────────── 生成中 ────────────> activated
 [承認後]                                    [提出後]
```

書く主体と契機は決まっている。

```
誰が   invokeAi（claude のプロセスを終了まで握っている）
いつ   プロセスが終わり、結果を判定した時点
どう   承認 API を phase 付きで叩く。新規 endpoint を生やさない
```

## 1. 契約を決める

形は design.md D4・D5 で決めてある。ここはその確認と、資料への反映である。

- [ ] 1.1 承認 API の入力を判別可能ユニオンにする（design.md D4）。`{ projectName }` は従来どおり、`{ phase: 'activated' }` を足す。**`phase` は `'activated'` のリテラルのみ受ける**
- [ ] 1.2 ADR-0014 に照らす。遷移が入力の形として契約に現れ、渡していない内部状態で振る舞いが変わらないことを確かめる
- [ ] 1.3 「出し終えた」の判定を実機で確かめる（design.md D5）。`.spec-workflow/approvals/` 配下に承認依頼のファイルが現れることと、その置き場が ADR-0008 の基準（2.2.7）と合っていること
- [ ] 1.4 `CONTEXT.md` に用語として足す。「生成中」は既にあるが、その終わりを指す言葉が無い。**あわせて「終わりは `.spec-workflow/` が出来たとき」の一文を直す**（design.md「上位資料への整合反映」。ユーザー承認後）
- [ ] 1.5 `docs/specs/api/contract.md` の U10（:162-176）・U2（:129）・U12（:192）を直す（ユーザー承認後）
- [ ] 1.6 `docs/specs/plan/portal-stroke-exit.md` の図（:19-20）を直す（ユーザー承認後）

## 2. phase の値を1箇所に閉じる（先にこれ）

いま値の集合が**5箇所**にある（design.md Context）。値を足す前に閉じておかないと、足すたびに全部を触ることになる。

- [ ] 2.1 `shared/stroke.ts` の `Phase` を、値の一覧を1つ持つ形にする。型はそこから導く（design.md D2）
- [ ] 2.2 `server/handler/phase.ts` の `readPhase` から `=== 'stroking' || === 'proposed' || === 'approved'` の連鎖を外し、2.1 の一覧に照らす形にする
- [ ] 2.3 **`server/utils/stroke/session-core.ts:242` のもう1つの `readPhase` も同じ形にする。** proposal.md はこれを数えていない。片方だけ直すと U12 の一覧が `activated` を `'unknown'` として返し、巡回の母集合が変わる
- [ ] 2.4 `session-store.ts` の zod を、リテラル3本の列挙から 2.1 の一覧を使う形にする
- [ ] 2.5 **判定は述語で表す。** `isBeforeApproval` / `isAfterApproval` に倣い、イコール比較を呼び出し側へばら撒かない
- [ ] 2.6 ここまでで振る舞いが変わっていないことを確かめる（値はまだ3つのまま）

## 3. `activated` を足す

- [ ] 3.1 2.1 の一覧に `activated` を足す
- [ ] 3.2 既存の `state.json` に `activated` は無い。読めない値として弾かれないこと、既存のプロジェクトが `approved` のまま読めることを確かめる
- [ ] 3.3 述語を design.md D3 の形にする。`isAfterApproval` に `activated` を**含める**（含めないと完成したプロジェクトがどちらの削除の口からも消せなくなる）。区間の内側を表す `isGenerating` を足す
- [ ] 3.4 `DELETE /api/projects/:projectId` で `activated` のプロジェクトが消せることを確かめる。決着のモーダルの「破棄する」もここを通る

## 4. `invokeAi` から書く

- [ ] 4.1 承認 API が phase を受け取れるようにする（1.1 で決めた形）。**新規 endpoint は生やさない**
- [ ] 4.2 `invokeAi` の成功の分岐（`ai.ts:112-123`）から、承認 API を叩いて `activated` を書く
- [ ] 4.3 「出し終えた」の確認を design.md D5 の形で入れる。`.spec-workflow/approvals/` 配下に承認依頼のファイルが1件以上あることを確かめる。**本家 REST にも、自前 MCP の呼び出し回数にも拠らない**（承認依頼は自前 MCP を通らない）
- [ ] 4.4 steering の起動にも `didWork` を渡す。**いまストローク側にしか渡っておらず**（`invoke.ts:148`）、未指定は `ai.ts:120` で素通りする。素通りしている限り、空振りの正常終了が成功の分岐へ落ちる
- [ ] 4.5 判定に失敗したとき `activated` を書かないことを確かめる。**書けないときに黙って成功へ倒さない**

## 5. 決着の判定を phase に移す

- [ ] 5.1 `creationOutcomeOf` の**成功**の判定から `invocation` を外し、phase の遷移（`approved` → `activated`）を見る形にする。**失敗（`error`）は `invocation` に残す**（design.md D6）
- [ ] 5.2 `server/utils/control/creating.ts` が `phase` を持ち帰る形にする。いまは `approved` かどうかの真偽しか返していない
- [ ] 5.3 `server/utils/control/directory.ts` の行の `creation` を phase から引く。**走査（`.spec-workflow/` の有無）は母集合を作るためだけに使い、行の状態の判定に使わない**
- [ ] 5.4 **生成中（`approved`）の行を、接続の判定の対象から外す。** registry に載っていても `connection` は `disconnected` にする。これが今回のバグ（生成中の行がアクティブに化けて入場できる）の直接の修正である
- [ ] 5.5 **行と配信が同じ根拠を見ていることを確かめる。** 同じプロジェクトで2つが食い違わないこと
- [ ] 5.6 `session-store.ts` の「`invocation` を合図の材料に使っても…」のコメントを、実態に合わせて書き直す
- [ ] 5.7 `creating.ts` の「`invocation` を読まない」の注記を書き直す。読まない理由は変わったが、**成功の判定材料にしない**ことは残る

## 6. 失敗の応答

- [ ] 6.1 claude がエラーで終わったとき `invocation` を `error` に倒す経路が実際に通ることを確かめる。**いまは `error` を立てる者がいない**
- [ ] 6.2 `error` が W3 の失敗として配信され、モーダルが「やり直す / 破棄する」を出すところまで通す
- [ ] 6.3 `invocation` は失敗の応答に専念させる。成功の判定材料に使っている箇所が残っていないことを確かめる

## 7. 既存の `state.json` を書き上げる

`activated` を足すと、既に完成しているプロジェクトはすべて `approved` のまま残り、そのままでは全部が生成中として並んで入れなくなる（design.md D7）。

- [ ] 7.1 `server/plugins/` に、立ち上がって一度だけ走る書き上げを置く。`01.retry-failed.ts` の「初回だけ `running` を倒す」と同じ場所・同じ考え方
- [ ] 7.2 対象は `phase: 'approved'`。**4.3 と同じ判定**を通し、通ったものだけ `activated` へ上げる
- [ ] 7.3 書き込みは承認 API（`{ phase: 'activated' }`）を通す。**直に書かない**
- [ ] 7.4 通らなかったものは `approved` のまま残ることを確かめる。生成中として並び、決着のモーダルから選び直せる状態が正しい

## 8. 実機で一巡

- [ ] 8.1 承認 → steering 成功 → 完成として記録される → クラッカー → 「レビューする」で承認画面へ着地し、**承認依頼が実際に出ている**
- [ ] 8.2 **承認 → steering が何も作らずに正常終了 → 完成にならない。** クラッカーが上がらないこと。実測 2026-08-30 の `setai-2` と同じ条件を作って踏む
- [ ] 8.3 **今回の報告の経路を踏む**（実測 2026-09-01）。承認 → 一覧で「生成中」を確認 → 通知画面へ移る → 一覧へ戻る → **まだ生成中のままで、アクティブになっていない・入場できない**
- [ ] 8.4 本家 MCP が接続して `.spec-workflow/` ができた直後に一覧を取り直しても、行が完了に変わらないこと
- [ ] 8.5 承認 → steering がエラー → 失敗が届き、「やり直す / 破棄する」が出る
- [ ] 8.6 「やり直す」で起こし直せること、「破棄する」で消えること
- [ ] 8.7 書き上げ（7章）の後、既存の完成済みプロジェクトが従来どおり入場できること

## 9. 検証

- [ ] 9.1 `yarn typecheck` を通す
- [ ] 9.2 `yarn test` を通す
- [ ] 9.3 `yarn test:e2e` を通す
- [ ] 9.4 `openspec validate add-activated-phase --store stroke` が通ることを確かめる
- [ ] 9.5 既存の `state.json`（`activated` を持たない）が読めなくなっていないことを、実物の `/opt/projects` に対して確かめる

## 10. コミット

- [ ] 10.1 この worktree のブランチへ直接コミットする

## 11. レビューと完了承認

- [ ] 11.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行する。レビューが完全にパスするまで続ける
- [ ] 11.2 ユーザーから完了承認を得る
