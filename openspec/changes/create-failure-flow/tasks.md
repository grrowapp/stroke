## 1. 着手

- [ ] 1.1 `openspec/tickets/create-failure-flow.md` の `status` を `Doing` にする
- [ ] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（既に同じものが在れば追記しない。`tags` は追記のみで既存の項目を消さない）

## 2. docs（承認を得てから着手する）

- [ ] 2.1 design.md「docs への整合反映」の反映内容をユーザーへ諮り、承認を得る。**承認前に `docs/` を書き換えない**
- [ ] 2.2 `docs/specs/architecture/failure.md` を新設する。節は 失敗の段階 / 通知 / 対処の選択肢 / 破壊を伴う選択肢の承諾 / 行き止まりを作らない の5つ。ユーザーが挙げた「ヘッダーの警告色の『最初に戻る』→ 削除の警告 → 承諾 → 最初へ」を適用例として添える
- [ ] 2.3 `docs/specs/api/contract.md` の U2 の `error` の説明から画面の導線を外し、`failure.md` への参照にする。`error` が終端であることは残す
- [ ] 2.4 `docs/specs/architecture/session-workflow.md`「実行の記録（`invocation`）」の削除の行に、承諾を経ること（`failure.md`）への参照を添える

## 3. 画面

- [ ] 3.1 一覧（`app/pages/strokes/index.vue`）で `invocation: 'error'` の件を見分けられるか確かめる。見分けられなければ表示を足す（design.md「Open Questions」）
- [ ] 3.2 `app/composables/useWaitingRetry.ts` に「一覧へ戻る」（対象を残して離れる）を足す。`discard` は承諾を得た後にだけ呼ぶ形へ変える
- [ ] 3.3 `error` の表示に3つの選択肢（再実行 / 一覧へ戻る / 最初に戻る）を出す。「最初に戻る」は警告色で、他の2つと同じ見た目で並べない
- [ ] 3.4 「最初に戻る」の承諾を出す。消えるもの（それまでのやり取り）を示し、承諾しなければ何も消えないことを確かめる
- [ ] 3.5 削除の後の行き先を概要の入力（`/`）へ変える（design.md「削除した後の行き先を概要の入力へ変える」）
- [ ] 3.6 巡回に拾われない失敗（初回起動の失敗）の表示にも、同じ3つの選択肢と承諾を適用する

## 4. テスト

- [ ] 4.1 `useWaitingRetry` の単体テストに、承諾の前に `discard` が呼ばれないことと、「一覧へ戻る」で対象が残ることを足す
- [ ] 4.2 E2E に `error` からの3経路（再実行 / 一覧へ戻って開き直す / 承諾して最初へ戻る）を足す
- [ ] 4.3 E2E に「承諾せずに閉じるとセッションが残る」を足す
- [ ] 4.4 `yarn test` と `yarn test:e2e` を通す

## 5. 仕上げ

- [ ] 5.1 `openspec validate create-failure-flow --strict` を通す
- [ ] 5.2 'typescript-reviewer' エージェントに '/santa-method' でレビューを実行させる。レビューが完全にパスするまで続ける
- [ ] 5.3 change の成果物を commit する
- [ ] 5.4 ユーザーから完了承認を得て、`openspec/tickets/create-failure-flow.md` の `status` を `Wait-for-archive` にする
