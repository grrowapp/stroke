# Design — implement-portal-mvp

## Context

動機は `proposal.md` の Why を参照。要求は `specs/` の5つを参照。

この change を縛る既定の制約は次のとおりで、いずれもこの change で決めたものではない。

- **層と依存の向き** — 画面 → 制御 → 接点 の一方向。ディレクトリ配置と命名は steering の `structure.md` に従う
- **技術** — Nuxt4（SSR あり）/ Nuxt UI / TailwindCSS / zod / Vitest / Playwright、yarn 4。steering の `tech.md`
- **本家の基準** — spec-workflow-mcp v2.2.5。公開 API だけでなくペイロードの形・registry の構造・PID による生存判定にも依存する。`docs/adr/0002-upstream-observed-behaviour.md`
- **加工の禁止** — 本家から受け取った情報を再構成する仕様を勝手に足さない。`docs/adr/0001-do-not-derive-from-upstream-data.md`
- **base2 は git リポジトリではない** — `git init` から始まる

### 本家の形（実測）

本 change の判断の土台になる事実。手元 checkout の **v2.2.7** のソースで確認した。基準の v2.2.5 はタグが無く差分を取れていない（🔶 未検証）。

| 対象 | 実測した形 |
|---|---|
| registry entry | `{projectId, projectPath, workflowRootPath, projectName, instances[]}`（`src/core/project-registry.ts`） |
| `projectId` の作り方 | `SHA-1(projectPath)` の base64url 先頭16文字。**`workflowRootPath` からではなく workspace のパスから作られる** |
| WebSocket | `ws://<host>/ws?projectId=<id>`。接続直後に `initial`（`{specs, approvals}`）と `projects-update` |
| `task-status-update` | `{specName, taskList, summary, inProgress}`。`summary` は `{total, completed, inProgress, pending, blocked, headers}` |
| `approval-update` | 保留中の承認依頼の配列 |
| `spec-update` / `steering-update` | 再描画用の同期信号 |
| `ApprovalRequest` | `{id, title, filePath, type, status, createdAt, category: 'spec'｜'steering', categoryName, ...}` |
| ステアリング | 常に product / tech / structure の3本。存在は `GET /api/projects/:projectId/info` の `steering`、中身は `GET /api/projects/:projectId/steering/:name` |
| タスク進捗 | `GET /api/projects/:projectId/specs/:name/tasks/progress` が `{total, completed, inProgress, progress, taskList, lastModified}` を返す |

## Goals / Non-Goals

**Goals:**

- 本家に触るコードを `server/utils/upstream/` の1か所に閉じ、本家の形が変わったときに直す範囲を狭くする
- 「何が起きたか」の判定を制御層で終え、画面には結果だけを渡す
- 書き込み経路をコード上に存在させない。認証を持たないまま外部公開するため、書ける口を作らないことで担保する
- `ui.md`（archive の `steering-dashboard-portal`）が「実装中に決めてよい」とした項目を、ここで決め切る

**Non-Goals:**

- 本家の全画面を再現すること。下層は4画面に留める
- 通知の抽象化。spec-workflow-mcp 以外のイベント源を想定した構造にしない
- 性能の作り込み。単一利用者・数プロジェクト・ブラウザ1〜2枚が前提（`tech.md`）

## Decisions

### 1. 走査結果と registry の突き合わせは `workflowRootPath` で行う

`projectId` は `SHA-1(projectPath)` であり、`projectPath` は workspace のパス（例 `/home/vagrant/work/stroke-board/base2`）である。一方、走査で見つかるのは `.spec-workflow` を持つディレクトリ（例 `/opt/projects/stroke-board`）で、これは `workflowRootPath` にあたる。**走査結果から `projectId` は計算できない。**

したがって、走査で見つけたディレクトリと registry entry の対応は `workflowRootPath` の一致で取る。

- 一致する entry があり、その `instances` が空でなければ **アクティブ**。その entry の `projectId` を使う
- 一致する entry が無ければ **未接続**。`projectId` は不明のままでよい（未接続は入場できないため必要にならない）

**採らなかった案**: 走査結果から `projectId` を計算する。`projectPath` が分からないため計算できない。
**採らなかった案**: `GET /api/projects/list` を母集合にする。未接続プロジェクトが返らない（ADR-0002）。

🔶 `SPEC_WORKFLOW_SHARED_ROOT` を使った worktree 共有では、複数の workspace が1つの `workflowRootPath` を共有しうる。その場合、走査した1ディレクトリに registry entry が複数対応する。`.spec-workflow` の中身は同一なのでどれを使っても同じ内容が読める。**先頭の entry の `projectId` を使う**。

### 2. 一覧の単位と表示名は走査したディレクトリに合わせる

一覧の1行は「走査で見つかった `.spec-workflow` を持つディレクトリ」1つに対応させ、表示名はそのディレクトリ名とする。

registry の `projectName`（例 `stroke-board · base2`）を使わない理由は、未接続のプロジェクトでは取得できず、アクティブと未接続で表示名の出どころが変わってしまうため。同じ一覧に並ぶものは同じ規則で名前を付ける。

### 3. 走査は一覧を要求されたときに行う。深さは親パス直下の1階層

走査のタイミングは「上層のプロジェクト一覧が要求されたとき」と「サーバー起動時に1回」。定期実行はしない（`tech.md` の「定期ポーリングで代替しない」）。

深さは親パス直下の1階層のみとする。`/opt/projects/<name>/.spec-workflow` という実測の配置がこの形であり、再帰的に深く潜ると無関係なディレクトリを拾う。

**採らなかった案**: ファイル監視で親パスの変化を追う。プロジェクトの増減は通知対象ではなく（本家と同じ4種に限る）、監視を足す理由が無い。

### 4. 通知の基準は接続時に REST で作る

`initial` は `{specs, approvals}` しか含まず、`specs[].taskProgress` には `inProgress` が無い。着手の判定にはタスク単位の状態が要る。

そこで、あるプロジェクトへ接続したときに次を行う。

1. `initial` の `approvals` から、保留中の承認依頼の ID 集合を基準として取り込む
2. `initial` の `specs` のうち tasks を持つものについて `GET /api/projects/:projectId/specs/:name/tasks/progress` を1回ずつ呼び、`{total, completed, inProgress}` を基準として取り込む

以後は `approval-update` / `task-status-update` の受信ごとに基準と比較し、差から通知を作って基準を更新する。

これは定期ポーリングではなく接続時の1回であり、本家フロントエンドの `NotificationProvider` が `getSpecTasksProgress` で行っているのと同じ取得である（ADR-0001 に照らして、加工を足していない）。

**採らなかった案**: 基準を最初の `task-status-update` で作る。REST 呼び出しは減るが、接続後の**最初の変化が通知にならない**。取れる情報があるのに落とす形になる。

### 5. 通知の判定規則

`task-status-update` の `summary` と前回値を比較する。

| 通知 | 条件 | トースト種別 |
|---|---|---|
| タスク完了 | `summary.completed` が前回値より増えた | success |
| 全件完了 | `summary.total > 0` かつ `summary.completed === summary.total` で、前回はそうでなかった | success |
| タスク着手 | `inProgress`（タスクID）が前回値と異なり、かつ `null` でない | info |
| 承認依頼の発生 | 保留中の承認依頼の ID 集合に、前回値に無い ID が現れた | info |

タスク完了と全件完了は同時に成立しうる。その場合は**2件の通知を出す**（本家 `NotificationProvider` が両方を出しているのと同じ）。

### 6. 通知の粒度は1イベント1行、並びは発生時刻の降順、上限200件

`ui.md` が「実装中に決めてよい」としたものをここで決める。

- **粒度** — 1イベント1行。同じ対象への通知を畳むのは、本家から受け取った情報の再構成にあたる（ADR-0001）。畳むかどうかはユーザーが決める
- **並び** — 発生時刻の降順。直近に起きたことに気づくための画面であるため
- **上限** — プロセス全体で200件。超えたら古いものから落とす。永続化しない以上、上限が無いと再起動までメモリが伸び続ける

### 7. ブラウザと Nitro の間は WebSocket 1本

ブラウザは Nitro との WebSocket を1本だけ張り、そこで全プロジェクトの通知を受ける。プロジェクトごとに張り分けない。

上層と下層のどちらにいても通知を受ける必要があり（トーストは下層でも出る）、画面遷移で接続を張り替えると取りこぼす。

下層の内容取得は Nitro の REST 経由（ブラウザ → Nitro → 本家）とする。ブラウザから本家へは触らせない。

### 8. Nitro が本家へ張る接続は「アクティブ集合」に追従させる

走査 + registry の結果としてアクティブなプロジェクト集合が決まる。Nitro はその集合に対して接続を張り替える。

- 集合に増えたプロジェクト → 新たに接続し、基準を作る（決定4）
- 集合から消えたプロジェクト → 切断し、そのプロジェクトの基準を捨てる
- 集合に居続けるプロジェクト → 何もしない

再接続は指数バックオフ（初回1秒、上限30秒）で試み続ける。再接続が成立したら基準を作り直す（決定4を再実行する）ため、切断中に起きた変化は通知にならない。これは「通知を永続化しない」ことの帰結として受け入れる。

### 9. 通知から下層への遷移は種別で決める

| 通知の種別 | 遷移先 |
|---|---|
| 承認依頼の発生 | そのプロジェクトの承認画面 |
| タスク完了 / 着手 / 全件完了 | そのプロジェクトのタスク画面 |

承認依頼は `category: 'spec' | 'steering'` を持つが、**どちらでも承認画面へ送る**。本家の `ApprovalsPage` は `filePath` の中身を取得して画面内に描画しており、承認画面が対象文書のレビュー面そのものであるため。仕様書画面やステアリング画面へ送ると、対象文書は読めても承認の文脈が落ちる。

この事実は `docs/adr/` に追記する（ADR-0002 が「ステアリング文書の更新は検出できない」と書いており、そこから「ステアリングは通知に関係しない」と読み違えられるため）。

### 10. URL の識別子は本家の `projectId` を使う

下層のルートは `projects/<projectId>/...` とする。入場できるのはアクティブなプロジェクトだけで、そのときは registry から `projectId` が必ず引ける（決定1）。

`projectId` は `projectPath` から決定的に導かれるため、同じプロジェクトに対しては安定する。ただし本家が停止すると registry から entry が消えるので、URL を保存して後で開くと解決できなくなる。その場合は「未接続」として扱い、上層へ戻す。

**採らなかった案**: 走査ディレクトリ名を URL に使う。本家 API を呼ぶには結局 `projectId` への解決が要り、停止中は解決できないという性質は変わらない。名前の衝突とエスケープの問題が増えるだけになる。

### 11. 書き込み系の口をコードに作らない

本家の REST には `PUT /specs/:name/:document`、`POST /approvals/:id/:action`、`PUT /tasks/:taskId/status` などの書き込み系が存在する。接点層の REST クライアントには**これらを呼ぶ関数を置かない**。呼べる関数が無ければ、上位から誤って呼ばれることもない。

同様に `POST /api/projects/add` と `DELETE /api/projects/:projectId` も置かない。登録・作成の中身が未決であり（`product.md` の Open Questions）、この change では非活性の入口までしか作らないため。

### 12. design token は CSS カスタムプロパティで持ち、Nuxt UI をその上に載せる

本家 v2.2.5 の token（`--surface-base` などの実測値は `ui.md` の Visual Language）を CSS カスタムプロパティとして定義し、Nuxt UI のテーマからそれを参照する。

Nuxt UI のテーマ機構で本家の token を再現できるかは未検証（`tech.md` の Known Limitations）。**実装の最初のタスクでこれを確認する。** 再現できない場合は、本家準拠の範囲を決め直す判断がそこで要る。

### 13. MVP では通知音を鳴らさない

本家は Howler.js で外部URLの mp3 を読んでいる。外部依存を持ち込むかは未決（`ui.md`）。鳴らさない方は後から足せるが、外部URLへの依存は入れてしまうと外しにくい。

### 14. 状態の表示文言は日本語で直書きする

MVP は日本語のみ（proposal の「MVP から外すもの」）。`ui.md` の States が挙げた各状態の文言は、この change で決めて直書きする。i18n は文言が固まってからの後続 change とする。

## Risks / Trade-offs

- **本家の内部実装に依存しており、更新で壊れる** → 接点層に閉じ込め、基準バージョンを明示し、実測を ADR に残す。ペイロードは zod で検証し、形が変わったら黙って通さず記録に残す
- **確認した本家ソースが v2.2.7 で、基準の v2.2.5 と差分を取れていない** → 実装の最初に、稼働中の本家に対して `initial` / `task-status-update` / `approval-update` の実ペイロードを1回確認する。ずれていたら決定4・5を見直す
- **worktree 共有時に1ディレクトリへ複数 entry が対応する** → 先頭の entry を使う（決定1）。`.spec-workflow` が同一なので読める内容は変わらないが、表示上どの workspace かは区別できない。区別が必要になったら一覧の単位を決め直す
- **切断中に起きた変化が通知にならない** → 永続化しないことの帰結として受け入れる（`tech.md` に既知の制約として記載済み）。再接続後は基準を作り直す
- **死んだ PID がアクティブとして残る** → 本家の制約であり stroke-board では解消できない（ADR-0002）。選べるのに繋がらない行が出うる
- **Nuxt UI で本家 token を再現できない可能性** → 最初のタスクで確認し、できなければ本家準拠の範囲をユーザーと決め直す。後続タスクを全部積んでから気づく形にしない
- **認証なしで外部公開する** → 書き込み系の関数を接点層に置かないことで、読み取り専用であることをコードの形で担保する（決定11）

## Migration Plan

新規実装のため移行対象は無い。

1. `git init` し、feature ブランチを切る（`tech.md` の Branching Strategy）
2. Nuxt4 を初期化し、`.gitignore` を置く。`yarn.lock` をコミットする
3. 環境変数（本家ダッシュボードの URL、監視する親パス）を与えて `nuxt dev` で動かす
4. `nuxt build` の成果物 `.output/` を `node .output/server/index.mjs` で起動できることを確認する

ロールバックはブランチを捨てるだけでよい。本家にも `.spec-workflow/` にも書き込まないため、外部に残る副作用が無い。

## Open Questions

実装後でも安全に決められるもの。specs・方針・タスク分割のいずれも変えない。

- 再接続のバックオフの具体値（初回1秒・上限30秒は仮置き。実運用で調整する）
- 通知の保持上限 200 件の妥当性（永続化しない以上、上限があれば値そのものは後から変えられる）
- 走査の結果をどれくらいの間キャッシュするか（毎回走査で始めて、遅ければ足す）

以下は**この change のスコープ外**として既に決着しており、Open Question ではない。中身が決まるまで着手しない。

- プロジェクトの「登録」が何を指すか（`product.md` の Open Questions）
- 登録・作成の中身と、実処理を担う接続先プロジェクト（同上）
