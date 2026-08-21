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
