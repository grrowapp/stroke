## 1. WS の束ね方を1つにする（振る舞いは変えない）

design.md D6。先に土台を揃える。ここで既存の W1 / W2 が壊れていないことを確かめてから、その上に足す。

- [x] 1.1 `server/utils/ws/registry.ts` を作り、キーを持つ／持たないの両方を扱える registry の実装を1つ置く
- [x] 1.2 `server/utils/stroke/ws-channels.ts` の `createRegistry()` を 1.1 に差し替える。`questionChannel` / `proposalChannel` の外向きの形（`register` / `unregister` / `publish`）は変えない
- [x] 1.3 `server/utils/control/board.ts` の `peers: Set<Peer>` を 1.1 のキー無し registry に差し替える。`addPeer` / `removePeer` / `broadcast` の外向きの形は変えない
- [x] 1.4 `board.ts` 冒頭のコメントを「通知を配信するハブ」から「上層へのサーバー発イベントの口」に書き換え、`ws/delivery` の規約を参照させる
- [x] 1.5 既存の WS 関連のユニットテストを通す。あわせて `yarn check:ws-disconnect` を通す

## 2. 型と契約

- [x] 2.1 `shared/types.ts` に `ProjectCreation`（`'done' | 'in-progress' | 'failed'`）を足す
- [x] 2.2 `ProjectSummary` に `creation: ProjectCreation` を足す。`connection` の union は広げない（design.md D2）
- [x] 2.3 `BoardMessage` に `{ type: 'project-creation'; name: string; state: ProjectCreation }` を足す
- [x] 2.4 `snapshot` メッセージに `creating: string[]`（今まさに生成中のプロジェクト名）を足す
- [x] 2.5 `docs/specs/api/contract.md` の WS 配信の記述を直す。board とストローク側 W1 / W2 を、`ws/delivery` という1つの規約の下に並べ直す

## 3. サーバー — 生成中を母集合に加える

- [x] 3.1 `server/api/projects.get.ts` で `listSessionsCore(projectShareRoot)` を、走査・registry と並列に呼ぶ
- [x] 3.2 `phase === 'approved'` の件を生成中の候補として取り出し、`invocation` から `creation` を導く（`error` → `'failed'`、それ以外 → `'in-progress'`）
- [x] 3.3 `server/utils/control/directory.ts` の `buildProjectDirectory` が候補を受け取れるようにし、**ディレクトリ名**で走査結果に重ねる（design.md D1）
- [x] 3.4 重なった場合は生成中を優先する。`.spec-workflow` が先に現れても、`invocation` が終わるまでは生成中のまま（design.md D7）
- [x] 3.5 生成中・失敗の行では `connection` を `'disconnected'`、`projectId` / `pid` / `lastModified` / `pendingApprovals` をすべて `null` にする
- [x] 3.6 `compareProjects` の並びを アクティブ → 未接続 → 生成中・失敗 に変える。同じ区分の中は名前順のまま
- [x] 3.7 `countPendingApprovals` が生成中の件を問い合わせ対象にしないことを確かめる（registry に無いので既にそうなるはずだが、明示的に確認する）
- [x] 3.8 `directory.ts` のユニットテストを足す — 生成中が最下部に来る／`.spec-workflow` が現れても生成中が優先される／完了したら通常の行になる

## 4. サーバー — 配信の起点

- [x] 4.1 `board.ts` に `broadcastProjectCreation(name, state)` を足す
- [x] 4.2 ~~`board.ts` の `snapshot()` に、その時点で生成中のプロジェクト名を載せる~~ → **取り下げ。** 接続より前に完了したものは接続後にイベントを出さないので、抑止するものが存在しない。代わりに画面側が `snapshot` で一覧を取り直す（design.md D4 を更新済み）
- [x] 4.3 `server/api/strokes/[id]/approve.post.ts` の昇格成功の直後に `'in-progress'` を配信する。配信の失敗が承認の成否に影響しないようにする
- [x] 4.4 `server/utils/stroke/ai.ts` の `setInvocation`（A8）から配信する。`idle` → `'done'`、`error` → `'failed'`。`failed`（リトライ待ち）では配信しない（design.md D5）
- [x] 4.5 `setInvocation` からの配信を `phase === 'approved'` のときだけに限る。ストロークのセッションでは配信しない
- [x] 4.6 配信の起点のユニットテストを足す — 昇格で `in-progress`／`idle` で `done`／`error` で `failed`／`failed` では何も出ない／`approved` でないセッションでは何も出ない

## 5. 画面 — 生成中の行

- [x] 5.1 `app/composables/useBoardSocket.ts` で `project-creation` を受け取る。`onNotification` と同じ構造で、**snapshot では祝いのイベントを発火させない**（`creating` の保持は 4.2 の取り下げにより不要。代わりに `onSnapshot` で一覧を取り直す）
- [x] 5.2 `useBoardSocket` に、生成の出来事を購読する口を足す（`onProjectCreation` 相当）
- [x] 5.3 `app/pages/projects/index.vue` で生成の出来事を受けたら `refreshNuxtData` で `/api/projects` を取り直す（design.md D3）
- [x] 5.4 生成中の行に、不透明度の低下・回転するローダー・行全体のゆっくりした明滅の3つを同時に当てる
- [x] 5.5 状態の列に「生成中」を出す。PID は出さない
- [x] 5.6 未処理の通知と最終更新の列を、生成中では「無いことが分かる表示」にする。承認時刻などで埋めない
- [x] 5.7 生成中の行を選択不可にする。押しても何も起きず、キーボードのフォーカスも受けない（`connection !== 'active'` の既存の分岐でそのまま満たせるかを確かめ、足りなければ足す）

## 6. 画面 — 失敗の行

- [x] 6.1 `creation === 'failed'` の行からローダーと明滅を外す。不透明度の扱いは 8. の prototype で決める
- [x] 6.2 状態の列に「作成に失敗」を出し、未接続と見分けがつくようにする
- [x] 6.3 失敗の行にも作成を起こし直す操作を置かないことを確かめる（リトライはサーバの巡回が持つ）

## 7. 画面 — 完了と祝い

- [x] 7.1 `canvas-confetti` を dependencies に足す。クライアント側の動的 import に限り、SSR のバンドルに載せない（design.md D8）
- [x] 7.2 祝いの面のコンポーネントを作る。名前と文言を載せ、行の中に収めず、画面遷移せず、画面全体を覆わない
- [x] 7.3 `state === 'done'` の出来事を受けたときだけ祝いを出す。snapshot で既に生成中だったもの・既に完了していたものでは出さない
- [x] 7.4 祝いは放っておけば自ら引く。操作を要求せず、フォーカスも奪わない
- [x] 7.5 祝いと同時に、その行から生成中の表現（不透明度・ローダー・明滅）を外す
- [x] 7.6 `prefers-reduced-motion` に従う。confetti を止め、メッセージは残す

## 8. prototype と ui.md

design.md の Open Questions（祝いの寸法・速度・粒の量、`prefers-reduced-motion` 下での落とし方、失敗の行の見せ方）はここで決める。

- [ ] 8.1 `/prototype` の UI ブランチで、プロジェクト一覧の中に祝いの見せ方の variant を3つ立てる（`?variant=` で切り替え）
- [ ] 8.2 失敗の行の見せ方も同じ prototype に載せる。「表現方法はちゃんとして」の一点であり、未接続との見分けがつくことを実物で確かめる
- [ ] 8.3 ユーザーにブラウザで見てもらい、選んだものと理由を `ui.md` に記録する。想像で書かない
- [ ] 8.4 `ui.md` で決まった値を 6. と 7. の実装に反映する

## 9. ドキュメント

- [x] 9.1 `docs/specs/plan/portal-stroke-exit.md` の「画面のイメージ」の図を直す。今は「新プロジェクトはまだ現れない → しばらくして現れる」と書かれており、この change の後は誤りになる
- [x] 9.2 `openspec/changes/replace-polling-with-push/proposal.md` に追記する。W3 を4本目の endpoint ではなく、W1 / W2 のいずれかのメッセージ種別として足す形に変わること（design.md D9）
- [x] 9.3 `CONTEXT.md` に「生成中」を足すかを判断する。ドメインの言葉として定着させるなら足し、しないなら足さない理由を残す

## 10. 検証

- [x] 10.1 `yarn typecheck` を通す
- [x] 10.2 `yarn test` を通す
- [x] 10.3 `yarn spec`（`openspec validate --all`）を通す
- [ ] 10.4 E2E を足す — 承認してモーダルを閉じると、一覧の最下部に生成中の行が出ている ／ **書いた（`e2e/stroke-exit.spec.ts`）が未実行。** この環境に Playwright のブラウザが入っていない（`~/.cache/ms-playwright` が空）。`yarn playwright install chromium` が要る
- [ ] 10.5 E2E を足す — 一覧を開いたまま完了が届くと、行が通常に変わり祝いが出る。開き直すと祝いは出ない ／ **書いたが未実行**（同上）
- [ ] 10.6 E2E を足す — 生成中のプロジェクトがある間、画面からサーバへの繰り返しの取得が発生しない ／ **書いたが未実行**（同上）
- [ ] 10.7 `yarn dev`（ポート 3399）で実物を動かし、承認 → 生成中 → 完了 → 祝い の一巡を目で確かめる。確認後はサーバを停止し、ポートの解放を確かめる
