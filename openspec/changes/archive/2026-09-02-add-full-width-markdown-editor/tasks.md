2026-09-01 に proposal / design / specs を「承認画面のコメント欄をしまう」の意図へ書き直した。**それ以前の tasks（編集の面のトグル・3画面）は無効。** prototype の撤去（`66fb66f2`）は済んでいる。

行番号は 2026-09-01 の実測。着手時にずれていたら実ファイルを正とする。

## 1. 承認画面から編集を外す（design 決定5。編集が無いのは承認画面だけ）

- [x] 1.1 `app/pages/projects/[projectId]/approvals/[approvalId].vue` の `#preview` を `MarkdownView` だけにする（`:117-135` の `MarkdownEditor` の枝を落とす）。枠は `sb-panel` のまま（枠の testid は `approval-document`。`document-body` は `MarkdownEditor` のものだったので、承認画面からは消える）
- [x] 1.2 同 — `saveTargetOf` / `target` / `save`（`:55-68`）と `MarkdownEditor` の import（`:23`）を消す（`useProjectApi.ts` の `saveTargetOf` は使い手が無くなったが、そのまま残している）
- [x] 1.3 `test/e2e/document-editing.spec.ts` の describe「承認依頼から対象文書を直す」（`:143-190`）を落とす。代わりに「承認画面には編集の口が無い」を1本足す（対象が編集できる6本のときも無いこと）。仕様書・ステアリングの編集のテストは触らない（ステアリング product / 仕様書 requirements の2本で確かめる）
- [x] 1.4 `modules/markdown/` に触っていないことを `git diff --stat` で確かめる（`MarkdownEditor` の `framed` prop は残す。使い手が居なくなるだけ）— 触ったのは `app/` 2本と `test/e2e/` 4本だけ
- [x] 1.5 `yarn typecheck` と `yarn test` が通る（typecheck exit 0・vitest 730/730）

## 2. コメント欄の列を幅固定にする（design 決定2）

- [x] 2.1 `app/components/review/ApprovalAnnotator.vue` の `grid gap-4 lg:grid-cols-3` ＋ `lg:col-span-2` を、本文 `min-w-0 flex-1` ＋ コメント欄 固定幅の `flex gap-4` に替える（本文の列に testid `approval-main`）
- [x] 2.2 コメント欄の開いた幅を、左のナビが開いている初回に「行の幅 − 16px の 1/3」で測って px で持つ。以後、左の開閉で変えない。ウィンドウの幅が変わったら、左が開いていて一覧が出ているときだけ測り直す（左の状態は cookie `spec-workflow-sidebar-collapsed` を読んで判定。左を畳んだ状態で開いたページでは行が 192px 広いので、その分を引いて測る＝左が開いているときと同じ幅。測るまでは同じ式の `calc((100%-16px)/3)` を当てる）
- [x] 2.3 左を畳んでも一覧の幅が変わらないことを E2E で固定する（`workspace-sidebar` を畳む前後で `approval-comments` の幅が同じ）

## 3. しまう／戻す（design 決定1・3）

- [x] 3.1 `ApprovalAnnotator.vue` に `tucked = ref(false)` を置く。`workspace.vue` は触らない。cookie / localStorage / URL に書かない
- [x] 3.2 しまうと `aside` の幅を 44px にし、中身をつまみに入れ替える。要素は入れ替えず、この1枚の幅だけを変える（`transition: width`）
- [x] 3.3 見出し帯のボタン（`sidebar-collapse` と同じ作り。32px、chevron）でしまう（`approval-comments-tuck`）
- [x] 3.4 しまった帯のどこを押しても戻る（`approval-comments-handle`）
- [x] 3.5 `aside` の右辺に沿った全高のレール（20px）。**背景も線も持たず、hover / active でも色を付けない。** 押すとしまう／戻す（`approval-comments-toggle`。E2E で hover 前後の背景が透明のままであることを固定）
- [x] 3.6 掴んで引く: `aside` の `pointerdown` で開始。6px 動かして初めてドラッグと判定。開いているときは `button, a, textarea, input, select` の上からは掴まない。幅が指に追従し、放した位置が開いた幅の半分より狭ければしまう、広ければ開く。動かさずに放したときは何もしない（クリックを潰さない）（放した直後に届く click は `setTimeout(0)` までの1回だけ捨て、つまみ／レールの上で放しても二重に切り替わらない）
- [ ] 3.7 つまみに残すものを ui.md「Chosen」の採用案どおりにする（design 決定4）。**採用が記録されていなければここで止まる** — 2026-09-01 時点で ui.md「Chosen」に a / b / c の採用は無い。**a（縦書きの帯＋件数バッジ）を仮置き**して先へ進めた。採用が決まったらここで差し替える
- [x] 3.8 左のナビを畳んでも一覧が動かず、一覧をしまっても左が動かないことを確かめる（連動のコードを1行も持たない）— E2E「左のナビを畳んでも一覧は出たままで幅も変わらず…」「つまみを押すと一覧だけが元の幅で戻り、左のナビは動かない」

## 4. E2E

- [x] 4.1 `test/e2e/approval-annotation.spec.ts` / `upstream-style.spec.ts` を列の構造の変化に合わせる（`grid-cols-3` を見ている箇所があれば直す）— `grid-cols-3` を見る箇所は無かった。合わせたのは編集の前提: `approval-annotation.spec.ts`「面を切り替えても編集の直しかけは消えない」を落とし、`upstream-style.spec.ts` の `document-body` を `approval-document` に、`workspace.spec.ts:409` の「編集の口が見える」を「無い」に
- [x] 4.2 足す: しまう（44px）／つまみで戻る／掴んで引いてしまう・開く／左を畳んでも一覧の幅が同じ／開き直すと一覧は出ている／しまっている間もヘッダーと戻る導線が見える（`approval-annotation.spec.ts` describe「コメント欄をしまう」11本。レールが光らない・本文がビューポートに追従・左を畳んだ状態で開いても同じ幅・cookie / storage に書かない も含む）
- [x] 4.3 `yarn build` → `yarn test:e2e` が緑（着手時 221 本 → 終了時 229 本。落とした4本＋足した12本）

## 5. 検証と完了

- [x] 5.1 `yarn typecheck` / `yarn test` / `yarn test:e2e` が通る（exit 0 / 730 passed / 229 passed。2026-09-01）
- [x] 5.2 `openspec validate add-full-width-markdown-editor --strict --store stroke` が valid
- [x] 5.3 ADR-0017「add-full-width-markdown-editor」の完了判定を実測で突き合わせる — 6項目とも E2E で固定済み（しまえる・44px・口4つ・レールが光らない／左を畳んでも幅不変・本文だけ広がる／本文に固定幅無し・ビューポート追従／ヘッダー常時可視／編集の口無し・仕様書とステアリングの編集は既存 E2E のまま／保存しない）。ADR の状態行「未着手（成果物が proposal のみ）」は実態と食い違うが、docs は本 change の責務外なので触っていない
- [ ] 5.4 `typescript-reviewer` でレビュー。呼べなければ報告して止まる — **止まった**。この環境の agent 一覧に `typescript-reviewer` が無い（代替は選んでいない）
- [ ] 5.5 コミット。ユーザーの完了承認 — コミットは済（`cd3c83b8` / `1c9b8870`、ブランチ `create-module-markdown`）。**完了承認は未**
