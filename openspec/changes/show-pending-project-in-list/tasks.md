## 1. WS の束ね方を1つにする（振る舞いは変えない）

design.md D6。先に土台を揃える。ここで既存の W1 / W2 が壊れていないことを確かめてから、その上に足す。

- [x] 1.1 `server/utils/ws/registry.ts` を作り、キーを持つ／持たないの両方を扱える registry の実装を1つ置く
- [x] 1.2 `server/utils/stroke/ws-channels.ts` の `createRegistry()` を 1.1 に差し替える。外向きの形は変えない
- [x] 1.3 `server/utils/control/board.ts` の `peers: Set<Peer>` を 1.1 のキー無し registry に差し替える。外向きの形は変えない
- [x] 1.4 `board.ts` 冒頭のコメントを「上層へのサーバー発イベントの口」に書き換え、`ws/delivery` を参照させる
- [x] 1.5 既存の WS 関連のユニットテストと `yarn check:ws-disconnect` を通す

## 2. 型と契約

- [x] 2.1 `shared/types.ts` に `ProjectCreation` を足す
- [x] 2.2 `ProjectCreation` を **`'done' | 'in-progress'` の2値**にする。失敗の状態は持たない（失敗はモーダルで決着し、行として居座らない）
- [x] 2.3 `ProjectSummary` に `creation` を足す。`connection` の union は広げない（design.md D2）
- [x] 2.4 `BoardMessage` に `{ type: 'project-creation'; name: string; state: ProjectCreationOutcome }` を足す
- [x] 2.5 **行の型と配信の型を分ける。** 行（`ProjectSummary.creation`）は `'done' | 'in-progress'` の2値。配信（`project-creation` の `state`）は失敗も運ぶ——モーダルを出す引き金として要る。失敗は行として残らないが、決着としては起きる
- [x] 2.6 `docs/specs/api/contract.md` の WS 配信の記述を直す。W1 / W2 と board を `ws/delivery` の下に並べ直す

## 3. サーバー — 生成中を母集合に加える

判定は**ファイルシステムの事実だけ**で行う。`invocation` は見ない（design.md D7）。

- [x] 3.1 `server/utils/control/creating.ts` を、`phase: 'approved'` だけを読む薄い列挙に書き換える。`listSessionsCore` への相乗りをやめる——あれは巡回のための検査（`openspec/` と `config.yaml`）を含んでおり、母集合の判定に使う筋ではない
- [x] 3.2 `server/api/projects.get.ts` で、走査・registry と並列に呼ぶ
- [x] 3.3 `buildProjectDirectory` が候補を受け取り、**ディレクトリ名**で走査結果に重ねる（design.md D1）
- [x] 3.4 判定を「走査に無ければ生成中、有れば完了」の2択にする。`invocation` による分岐（`running` なら生成中に留める・`error` なら失敗）を落とす
- [x] 3.5 生成中の行では `connection` を `'disconnected'`、`projectId` / `pid` / `lastModified` / `pendingApprovals` を `null` にする
- [x] 3.6 `compareProjects` の並びを アクティブ → 未接続 → 生成中 にする（失敗の区分を落とす）
- [x] 3.7 `countPendingApprovals` が生成中の件を問い合わせ対象にしないことを確かめる
- [ ] 3.8 `directory.ts` のユニットテストを、`invocation` を使わない判定に合わせて書き直す

## 4. 生成の順序を入れ替える

design.md 「書き換える要件」。`phase` を書いた直後に落ちると uuid のまま `approved` の残骸が残り、それが一覧に出てしまう。

- [x] 4.1 承認の処理を **衝突確認 → 改名 → `phase` を書く** の順にする
- [x] 4.2 `phase` の書き込みに失敗したら**改名を戻す**。今の「古い場所へ `phase` を書き戻す」をやめる
- [x] 4.3 `openspec/specs/project/generation` の該当要件を書き換える（delta の `## MODIFIED Requirements` に反映済み）
- [ ] 4.4 ユニットテストを足す — 改名が失敗したらセッションは元の名前・`proposed` のまま／`phase` の書き込みが失敗したら改名が戻る

## 5. 削除の口

design.md D11・D12。パスに動詞を置かず、メソッドで振り分ける。判定は endpoint、実行は共通。

- [x] 5.1 `server/handler/**` に削除の実行を1つ置く。phase の判定は持たせない
- [x] 5.2 `server/utils/stroke/session-core.ts` の `deleteSessionCore` から phase の判定を外す
- [x] 5.3 `server/api/sessions/[id]/index.delete.ts` を作る（`DELETE /api/sessions/:id`）。**approval 前**の phase だけを許す
- [x] 5.4 `server/api/strokes/[id]/delete.post.ts` を消す
- [x] 5.5 `server/api/projects/[projectId]/index.delete.ts` を作る（`DELETE /api/projects/:projectId`）。**approval 以降**の phase だけを許し、`.spec-workflow/` を持つものは拒否する
- [x] 5.6 実行中の呼び出しを持つものは両方とも受理しない
- [ ] 5.7 呼び出し元を直す — `app/composables/useWaitingRetry.ts`（済）、E2E 4本（`agent-question` / `proposal-persistence` / `stroke-exit` / `ws-disconnect`。済）、**`scripts/ws-disconnect-check.ts` が旧 path のまま残っている**
- [ ] 5.8 `docs/specs/api/contract.md` の U11 を直し、プロジェクト削除の項を足す — 一覧の表と補足は済。**L178 の見出しが `POST /api/strokes/:id/delete` のまま残っている**
- [ ] 5.9 ユニットテストを足す — 判定が endpoint 側にあること／実行が1つであること／`.spec-workflow` を持つものが消えないこと

## 6. projectId の導出

破棄のリクエストは `projectId` で組む。失敗したプロジェクトは本家に登録されておらず registry から引けないので、**サーバー側で導出して応答に入れる**。画面は受け取った値を使うだけで、id の作り方を知らない。

- [x] 6.1 本家 `spec-workflow-mcp` のソース（`node_modules/@pimzino/spec-workflow-mcp/dist/core/project-registry.js`）で `projectId` の作り方を確認した — SHA-1 を **base64url** で書き、**先頭16文字**（hex ではない・全長でもない）。**渡しているのは `workspacePath`（`:159`）であって `workflowRootPath` ではない**（design.md D13）
- [x] 6.2 導出を `server/utils/upstream/project-id.ts` に置く。**本家に触る知識は接点に閉じる**
- [x] 6.3 registry から引けない行の `projectId` を、導出した値で埋める
- [ ] 6.4 実機で、生成したプロジェクトの registry の値と導出した値が一致することを確かめる。合わなければ導出をやめ、破棄の指し方を決め直す
- [ ] 6.5 **渡している値が `workspacePath` に当たることを、コードの上でも読み違えない形にする** — 導出に渡しているのは `ProjectSummary.workflowRootPath` という名前のフィールドだが、本家が id の材料にしているのは `workspacePath` である（design.md D13）。承認で作ったものは両者が一致するという前提を、`directory.ts` の `unfinished()` と `project-id.ts` の引数名・コメントに明記する
- [ ] 6.6 `SPEC_WORKFLOW_SHARED_ROOT` を使った共有ルートの下では導出値が本家の id と合わないことを確かめ、そのとき破棄がどう振る舞うか（404 になる）を決める

## 7. サーバー — 配信の起点

- [x] 7.1 `board.ts` に `broadcastProjectCreation(name, state)` を足す
- [x] 7.2 承認の昇格成功の直後に `'in-progress'` を配信する。配信の失敗が承認の成否に影響しないようにする
- [x] 7.3 完了と失敗の配信の起点を、`invocation` を見ない判定に合わせて置き直す — 起点は `setInvocation` のまま。ただし流すのは**合図**であって行の状態ではない（design.md D5）
- [x] 7.4 配信を `phase === 'approved'` のときだけに限る
- [ ] 7.5 配信の起点のユニットテストを、新しい判定に合わせて書き直す

## 8. 画面 — 生成中の行

見せ方は prototype で確定済み。

- [x] 8.1 `useBoardSocket` で `project-creation` を受け取る。**snapshot では発火させない**
- [x] 8.2 `useBoardSocket` に購読の口を足す（`onProjectCreation` / `onSnapshot`）
- [x] 8.3 生成の出来事を受けたら `refreshNuxtData` で `/api/projects` を取り直す（design.md D3）
- [ ] 8.4 生成中の行の見せ方を prototype の確定値に合わせる — 行の地は `#161f32`（通常の地の上に重ねる）／フォルダアイコンを外し、**その位置でローダーを回す**（白・帯 180°・太さ 2px・大きさ 15px・回転 0.9s ＋ 明滅 1.6s）／名前と日付は未接続と同じ薄さ／**明滅は行に掛けない**
- [x] 8.5 状態の列に「生成中」を出す。PID は出さない
- [x] 8.6 未処理の通知と最終更新は「無いことが分かる表示」にする
- [x] 8.7 生成中の行を選択不可にする
- [ ] 8.8 チップの見せ方を prototype の確定値に合わせる — 4状態で同じ形（幅 76px・中身は中央）、灯るのはアクティブだけ、未接続はガラスのまま消えている
- [ ] 8.9 **失敗の行の残りを落とす** — `main.css` の `.sb-row-failed`、`index.vue` の「作成に失敗」に触れる分岐とコメント。行の状態は3つだけになる（specs `project/directory`）

## 9. 画面 — 決着の知らせ方

**知らせる面 → フェードアウト → 選ばせるモーダル**。この2つは別物である（design.md D8）。

**この章は 9.1 の prototype から着手する。** 今の形（画面の半分を埋める告知が自ら引き、その後にモーダルが出る）は誰も実物を見ていない。前の prototype の3案はすべて「自ら消える帯だけ」を比べたもので、根拠として使えない。

- [ ] 9.1 **prototype で決着の見せ方を決める** — `/prototype` の UI 分岐を使い、既存の `app/pages/prototype/projects.vue` に案を足す。見るのは、知らせる面の**寸法（画面の半分くらい）**・出方・フェードアウトの速さ・confetti の量、そしてモーダルへ移る間合い。決まったら `ui.md` に反映する
- [ ] 9.2 知らせる面を作る — 画面の半分くらいを埋め、**フェードアウトで自ら消える**。成功は祝い（弾ける演出）、失敗は作りきれなかったこと。行に押し込まず、画面遷移しない。**既存の `CreationCelebration.vue` は帯の寸法なので作り直す**
- [ ] 9.3 選ばせるモーダルを作る — 知らせる面が引いた後に出す。成功は「レビューする / しない」、失敗は「やり直す / 破棄する」。**選ぶまで閉じない**
- [ ] 9.4 成功で「する」— `/projects/<projectId>/approvals/<approvalId>` へ。`approvalId` は `GET /api/projects/<projectId>/approvals` から引く
- [ ] 9.5 `projectId` が取れないときは「する」を選べない状態にする
- [ ] 9.6 失敗で「破棄する」— `DELETE /api/projects/:projectId` を投げて一覧へ戻る
- [ ] 9.7 失敗で「やり直す」— steering を起こし直して一覧へ戻る。行は生成中に戻る。起こす口は U13（AI を起動する唯一の入口）
- [ ] 9.8 決着の瞬間を受け取った画面にだけ出す。開き直した画面には出さない
- [ ] 9.9 **改名失敗**でも同じ面を出す。この時点ではプロジェクトが無く phase は `proposed` なので、破棄はセッション側（`DELETE /api/sessions/:id`）、やり直すは再承認になる。名前の衝突は今の訂正の挙動を変えない
- [ ] 9.10 祝いの演出は `canvas-confetti`（既に導入済み）。クライアント側の動的 import に限る
- [ ] 9.11 寸法・速度（知らせる面の大きさ、フェードアウト、モーダルへ移る間合い）は 9.1 の prototype で決め、`ui.md` に記録する

## 10. ドキュメント

- [x] 10.1 `docs/specs/plan/portal-stroke-exit.md` の「画面のイメージ」の図を直す
- [ ] 10.2 図を今の決定（決着モーダル・失敗の行を持たない）に合わせて直し直す
- [x] 10.3 `openspec/changes/replace-polling-with-push/proposal.md` に、W3 を endpoint ではなくメッセージ種別にする旨を追記
- [x] 10.4 `CONTEXT.md` に「生成中」を足す
- [ ] 10.5 `CONTEXT.md` の「生成中」の定義を直す。作り終えていないのは**ステアリング**であって、プロジェクトは承認の瞬間に出来ている

## 11. 片付け

- [x] 11.2 prototype の成果を `ui.md` に記録する（何を見て何を選んだか）— 行の確定値・チップ・決着の3案とその失効、prototype の在処まで記録済み
- [ ] 11.1 prototype を消す — `app/pages/prototype/**`、`app/components/prototype/**`。**11.2 の後にだけ行う**（値の出所が消えるため）。加えて 9.11（モーダルの寸法・速度）を prototype で決めるなら、それも終えてから消す
- [ ] 11.3 scratchpad の単体プレビュー（`preview/index.html`）と、それを配っている静的サーバーを止める

## 12. 検証

- [x] 12.1 `yarn typecheck` を通す
- [x] 12.2 `yarn test` を通す
- [x] 12.3 `yarn spec` を通す
- [ ] 12.4 上3つを、この change の変更をすべて入れた状態で通し直す
- [ ] 12.5 E2E — 承認するとモーダルが出て、選ぶまで閉じない
- [ ] 12.6 E2E — 一覧の最下部に生成中の行が出る／完了で通常の行になる
- [ ] 12.7 E2E — 生成中の行があっても、画面からサーバへの繰り返しの取得が発生しない
- [ ] 12.8 E2E — 削除が `DELETE` で通り、`GET` では消えない
- [ ] 12.9 実物で一巡を目で確かめる。**3399 は使わない**（別セッションが管理）。空きポートで上げる
- [ ] 12.10 別ポートで上げる場合、`claude.apiBaseUrl` との対応が崩れることに注意する（CLAUDE.md「ポートは 3399 固定。変えるときは両方を揃えて変える」）。見た目の確認だけなら影響しないが、承認からの一巡を通すときは対応を揃える
