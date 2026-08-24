# Tasks — implement-portal-mvp

`specs/` が何を作るか、`design.md` がどう作るかを持つ。ここは順序と粒度だけを持つ。

## 1. 足場

- [x] 1.1 `git init` して feature ブランチを切り、`.gitignore` を置く（`node_modules` / `.nuxt` / `.output` / `.env`）
- [x] 1.2 yarn 4 で Nuxt4 を初期化する。`nuxt` / `@nuxt/ui` / `tailwindcss` / `zod` を入れ、`yarn.lock` をコミットする
- [x] 1.3 `nuxt.config.ts` に SSR 有効・`imports: { autoImport: false }`・`components: { dirs: [] }` を設定する。`#imports` からの明示 import が通ることを1ファイルで確認する
- [x] 1.4 `package.json` に `dev` / `build` / `preview` / `typecheck` / `test` / `test:e2e` を置き、`vitest` と `@playwright/test` を入れる
- [x] 1.5 `nuxt typecheck` と `nuxt build` が通り、`node .output/server/index.mjs` で起動することを確認する
- [x] 1.6 本家 URL と監視する親パスを環境変数から読む設定を1か所に作る。ソースに埋めない（specs/upstream-connection）

## 2. 本家の形の確認と記録

design.md の Risks が求めているもの。ここがずれると 4章以降が全部ずれる。

- [x] 2.1 稼働中の本家に対して WebSocket を張り、`initial` / `task-status-update` / `approval-update` の実ペイロードを1回取得する。design.md の「本家の形（実測）」の表と突き合わせ、ずれがあれば design.md を直してから先へ進む
- [x] 2.2 `ApprovalRequest` の `category: 'spec' | 'steering'` と、承認依頼の飛び先が承認画面であることを `docs/adr/` に追記する。ADR-0002 の「ステアリング文書の更新は検出できない」から「ステアリングは通知に関係しない」と読み違えられるため
- [x] 2.3 Nuxt UI のテーマ機構で本家 v2.2.5 の design token（`ui.md` の Visual Language の実測値）を再現できるかを確認する。再現できない場合は先へ進まず、本家準拠の範囲をユーザーと決め直す

## 3. 接点層（`server/utils/upstream/`）

本家に触るのはこの章だけ。書き込み系の関数は一切置かない（design.md 決定11）。

- [x] 3.1 親パスを直下1階層だけ走査し、`.spec-workflow` を持つディレクトリを返す（specs/project-directory）。親パス未設定・親パスが読めない・0件 を呼び出し側が区別できる形で返す
- [x] 3.2 `activeProjects.json` を読み、`{projectId, projectPath, workflowRootPath, projectName, instances}` として返す
- [x] 3.3 本家 REST の読み取りクライアントを作る。`GET /api/projects/:projectId/info` / `.../specs` / `.../specs/:name/all` / `.../specs/:name/tasks/progress` / `.../steering/:name` / `.../approvals` / `.../approvals/:id/content` のみ
- [x] 3.4 本家 WebSocket クライアントを作る。`ws://<host>/ws?projectId=<id>` に接続し、切断時は指数バックオフ（初回1秒・上限30秒）で再接続する
- [x] 3.5 本家から受け取るペイロードの zod スキーマを書き、3.3 と 3.4 の出口で検証する。形が合わないものは通さず記録に残す（specs/upstream-connection）
- [x] 3.6 3.1〜3.5 のユニットテストを書く。特に 3.1 の3状態の区別と、3.5 が形の違うペイロードを弾くこと

## 4. 制御層 — プロジェクト（`server/utils/control/`）

- [x] 4.1 走査結果と registry entry を `workflowRootPath` で突き合わせ、アクティブ / 未接続 を判定する（design.md 決定1）。同一 `workflowRootPath` に entry が複数ある場合は先頭の `projectId` を使う
- [x] 4.2 一覧を「アクティブが上・未接続が下」で並べ、表示名を走査ディレクトリ名にして返す（specs/project-directory）
- [x] 4.3 ブラウザ向けの `GET /api/projects` を作り、4.2 の結果と親パス未設定 / 0件 / 走査失敗 を区別できる形で返す
- [x] 4.4 4.1〜4.2 のユニットテストを書く。アクティブが0件・プロジェクトが0件・同一 `workflowRootPath` に entry が複数 の各ケースを含める

## 5. 制御層 — 通知

- [x] 5.1 プロジェクトごとの基準（保留中の承認依頼 ID 集合、spec ごとの `{total, completed, inProgress}`）をメモリに持つ入れ物を作る
- [x] 5.2 接続時に基準を作る処理を書く。`initial` の `approvals` と、tasks を持つ spec ごとの `GET .../tasks/progress` を1回ずつ（design.md 決定4）
- [x] 5.3 `task-status-update` と前回値を比較して タスク完了 / 全件完了 / タスク着手 を判定する（design.md 決定5）。完了と全件完了が同時に成立したら2件出す
- [x] 5.4 `approval-update` と前回値を比較して 承認依頼の発生 を判定する。`category` と `categoryName` を通知に持たせる
- [x] 5.5 5.3〜5.4 のユニットテストを書く。**状態遷移ごとに1テスト**（`tech.md` の Testing Requirements）。接続直後に通知が出ないこと、同じスナップショットが2回届いても通知が出ないこと、ステアリング更新と承認の消滅で通知が出ないことを含める
- [x] 5.6 通知の一覧をメモリに持ち、発生時刻の降順・上限200件で保持する（design.md 決定6）
- [x] 5.7 アクティブ集合の変化に追従して本家への接続を張り替える起動時プラグインを書く（design.md 決定8）。増えたら接続して基準を作り、消えたら切断して基準を捨てる
- [x] 5.8 ブラウザ向け WebSocket ルートを作り、接続中のブラウザへ通知を配信する。現在の一覧も送る（specs/notification-feed）

## 6. 上層の画面

- [x] 6.1 本家 v2.2.5 の design token を CSS カスタムプロパティとして定義し、Nuxt UI のテーマから参照させる（design.md 決定12・2.3 の結論に従う）
- [x] 6.2 ヘッダーと上層のタブナビゲーション（通知 / プロジェクト一覧）を作る。接続状態をヘッダーに出す
- [x] 6.3 通知画面を作る。プロジェクト / 種別 / 内容 / 最終更新 の4列。0件のときの表示を含める
- [x] 6.4 ブラウザ側の WebSocket 受信 composable を作り、通知の一覧とトーストの発火に配る
- [x] 6.5 トーストを作る。右上固定・縦積み・5秒で自動消滅・× で手動消滅・1行テキスト・クリック不可・種別4色・フォーカスを奪わない（specs/notification-toast）。音は鳴らさない
- [x] 6.6 プロジェクト一覧画面を作る。アクティブが上・未接続は非活性でフォーカスも受けない。親パス未設定 / 0件 / 走査失敗 / アクティブ0件 の各表示を入れる
- [x] 6.7 プロジェクト一覧に「登録」「作成」を非活性で置く（specs/project-directory）
- [x] 6.8 6.3・6.5・6.6 のユニットテストを書く

## 7. 下層の画面

- [x] 7.1 `projects/<projectId>/` のレイアウトを作る。左サイドバー（仕様書 / ステアリング / タスク / 承認）、ヘッダー左に「← ポータルへ戻る」、プロジェクト名と接続状態。プロジェクト切替の口は置かない（specs/project-workspace）
- [x] 7.2 `projectId` が解決できない場合（本家停止で registry から消えた等）に未接続として扱い、上層へ戻す
- [x] 7.3 ブラウザ向けの読み取り REST を Nitro に作る（仕様書一覧 / 仕様書本文 / ステアリング本文 / タスク進捗 / 保留中の承認と対象文書の中身）。ブラウザから本家へは触らせない
- [x] 7.4 仕様書画面を作る。一覧と本文の表示のみ。編集・承認の操作は置かない
- [x] 7.5 ステアリング画面を作る。product / tech / structure の3本の有無と本文。未作成の状態を出す
- [x] 7.6 タスク画面を作る。タスクとその状態の表示のみ。状態を変える操作は置かない
- [x] 7.7 承認画面を作る。保留中の承認依頼と、その対象文書の中身を表示する。承認・却下の操作は置かない。対象が既に保留中でない場合が分かるようにする
- [x] 7.8 各画面で、本家との接続が切れたときに未接続と分かる表示にする。対象が存在しない場合の表示を入れる（specs/project-workspace）

## 8. 通知からの導線

- [x] 8.1 通知の行から遷移先を決める処理を書く。承認依頼 → 承認画面、タスク3種 → タスク画面（design.md 決定9）。スクロールもハイライトもしない
- [x] 8.2 通知の行をキーボードだけで辿って決定できるようにする（specs/notification-feed）
- [x] 8.3 Playwright で E2E を書く。通知が発生してからトーストが出て、通知画面の行から対象の下層画面へ着地するまでを通す（`tech.md` の Testing Requirements）
- [x] 8.4 本家が1つも起動していない状態と、プロジェクトが0件の状態でも画面が壊れないことを E2E で確認する

## 9. 仕上げ

- [x] 9.1 `nuxt typecheck` / `vitest` / Playwright をすべて通す
- [x] 9.2 走査・接続・通知の各層について、本家の挙動に依存している箇所へ「なぜそう書くか」のコメントを残す（`tech.md` の Code Quality Standards）
- [x] 9.3 起動に必要な環境変数と手順を `README` に書く。本家を別途起動しておく前提を明記する
- [x] 9.4 書き込み系の関数が接点層に1つも無いことを確認する（design.md 決定11）

## 10. 見た目を prototype と本家に寄せる

9章まで終えた実装を prototype と本家のソースに突き合わせたところ、**上層は prototype に沿っているが、下層とトーストは本家から離れている**ことが分かった。prototype は「下層の中身はこの問いの対象外」と明記しており（`navigation.prototype.html` の `projContent`）、下層の様式の出どころは本家しかない。ここを埋める。

出どころは次の3つに固定する。値を発明しない。

- 上層 = `openspec/changes/archive/2026-08-20-steering-dashboard-portal/prototype/navigation.prototype.html`（案A）
- 下層 = 本家 `src/dashboard_frontend/src/modules/pages/*.tsx` と `modules/theme/tailwind.css` / `theme.css`
- トースト = 本家 `modules/notifications/NotificationProvider.tsx` の `NotificationToasts`

- [x] 10.1 トーストを本家の `NotificationToasts` の形にする。`rounded-lg p-4 shadow-lg border`、種別ごとの色は Tailwind の `*-50/-200/-800`（ダーク時 `*-900/20` / `*-800` / `*-200`）、種別アイコン（`w-5 h-5 mt-0.5`）を4種、本文は `text-sm font-medium break-words`、× は `w-4 h-4` の gray。今の実装は `--status-*` を inline style で流し込んでおりアイコンも無い（`ui.md` の Visual Language が指定した組み合わせから外れている）
- [x] 10.2 本家の様式を CSS に足す。`.sb-panel` / `.sb-datatable` / `.sb-icon-tile` / `.sb-status-badge`（success・warning・error・info・pending・in-progress）/ `.sb-progress-track` / `.sb-progress-fill` / `.sb-empty`。値は本家の `tailwind.css` / `theme.css` から取る。上層が使っている prototype 由来のクラス（`sb-table` / `sb-chip` / `sb-tab` / `sb-btn` など）は触らない
- [x] 10.3 下層のシェルの余白を本家に合わせる（本文 `px-6 py-6`）。サイドバーは prototype の 170px のままにする（E2E が固定している）
- [x] 10.4 下層の各画面を `.sb-panel` に載せ、見出しブロック（`text-lg` の見出し + `text-sm` の副題）を本家の形にする
- [x] 10.5 `RecordList` を本家の表（アイコンタイル + 2段テキスト + 右端の「開く」）に作り直す。今は `sb-navitem`（下層サイドバーの項目の見た目）を縦に並べており、本家にも prototype にも無い形になっている
- [x] 10.6 状態の表示を `.sb-status-badge` に統一する。タスクの4状態・ステアリングの有無・承認の category。今の `sb-chip` への inline style（枠色だけ差し替え）は本家に無い形
- [x] 10.7 進捗を本家の `.progress-track` / `.progress-fill` の形で出す。仕様書一覧・タスク一覧・タスク画面
- [x] 10.8 空状態を本家の形にする（中央寄せ・`py-12`・`h-12 w-12` のアイコン・見出し + 説明）。今の破線枠は prototype が「下層の中身は対象外」を示すために置いたダミー枠で、本家には無い
- [x] 10.9 文書の本文を本家の `.markdown-content` の形で出す。今は生テキストを 12px の等幅で流しているだけで、ここが本家との差が一番大きい
- [x] 10.10 10.1〜10.9 を E2E で固定する。期待値は本家のソースから読む（`design-token.spec.ts` が prototype と本家 CSS から読んでいるのと同じやり方）。`nuxt typecheck` / `vitest` / Playwright をすべて通す

### 10章の途中で分かったこと

計測して初めて出た差で、値の突き合わせでは拾えなかったもの。

- **画面が縦いっぱいに組まれていなかった** — root に `min-h-screen` を置いただけで、その下の flex を伸ばしていなかった。サイドバーが中身の高さ（408px）で切れていた。prototype 案A の `.frame` は縦 flex で `.body { flex:1 }`、本家のサイドバーは `lg:h-screen`
- **本家は画面ごとに形が違う** — 下層を一律「表」にしたが、本家の承認画面は**カードの縦積み**。ステアリングと仕様書は表
- **本家の CSS は自分の Tailwind を打ち消している箇所がある** — `.p-3 { padding: var(--space-3) }` を素のクラスとして持つため、`p-3 sm:p-4 md:p-6 lg:p-8` と書いてあっても常に 12px。**書いてある方ではなく、稼働中の実物を測った方に合わせる**

## 11. 承認と却下を本家の API 経由で行う

`product.md` の Out of Scope に「ワークフローの状態変更 — 承認・却下・タスク更新は本家に委ねる。**二重に書き込む主体を作らない**ため」とあり、当初は承認・却下を持たなかった。

本家の API を呼ぶ形にすれば、**書き込む主体は本家のままで増えない**。ファイルに触るのは本家の `approvalStorage` で、stroke-board は依頼するだけになる。この理由で Out of Scope から外す。

対象は承認への応答だけで、タスクの状態変更とドキュメントの編集は Out of Scope のまま。

- [x] 11.1 接点層に `POST /api/projects/:projectId/approvals/:id/:action` を呼ぶ関数を1つだけ足す。本家が受けるのは `approve` / `reject` / `needs-revision` だが、出すのは前2つ。`needs-revision` は本家では注釈コメントを前提にした流れで、stroke-board はコメントを持たない
- [x] 11.2 `read-only.test.ts` を書き換え、**書き込み口が1つだけ**であることを機械的に固定する（接点層で `POST` を使う箇所が1か所・`PUT` / `PATCH` / `DELETE` が無い・公開メソッドの一覧が想定どおり）
- [x] 11.3 Nitro に POST ルートを1本作る。却下は理由を必須にする（本家に応答として残るため、空のまま送らない）
- [x] 11.4 承認カードに 承認（緑）/ 却下（赤・理由入力）を置く。色と寸法は本家の `ApprovalsPage.tsx` の `btn bg-green-600` / `btn bg-red-600` に合わせる
- [x] 11.5 応答後は一覧を取り直す。先回りして画面から消さない（`ui.md` の「楽観的更新は無し」）
- [x] 11.6 E2E スタブに応答の口を足し、承認・却下が本家へ何を送ったかをテストから確かめられるようにする
- [x] 11.7 `design.md` 決定11 と `specs/project-workspace` を書き換える。`nuxt typecheck` / `vitest` / Playwright をすべて通す
- [x] 11.8 steering の `product.md` の Out of Scope から「ワークフローの状態変更」を外す。本家の `PUT /api/projects/:projectId/steering/product` で書き換え、ダッシュボードの承認を通した。承認・却下と文書編集は実装したので、対象外に残るのはタスクの状態変更だけになる
