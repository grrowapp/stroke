# サーバ API の契約

画面（`app/`）・エージェント（`claude -p`）とサーバ（`server/`）の境界。型は `shared/stroke.ts`。
ここに並ぶ番号が実際にどう繋がるかは `docs/specs/architecture/question-flow.md`、入れ物の形と検証の規定は
`docs/specs/core/schema.md`。
方式の詳細（決定・シーケンス）は `openspec/changes/migrate-claude-p-to-api-endpoint/design.md` を参照。

## セッションの参照方法

**セッション uuid は URL に載せる。** cookie では持たない。

| 画面 | ルート |
|---|---|
| 概要入力（セッション開始前） | `/` |
| 画面1（ストローク） | `/strokes/<uuid>` |
| 画面2（proposal 確認） | `/strokes/<uuid>/proposal` |

概要を投稿するとセッションが作られ、`/strokes/<uuid>` へ移る。

## 全体設計

- 1リソース1パス。書き手は POST、読み手は GET または WS 配信。
- POST は受理だけを返す（本文なし・204）。例外は U1（`sessionId` を返す）だけ。
- ストロークの問いと差し戻しへの問い返しは区別しない。提出は1口（A5）・配信は1チャネル
  （W1）に統合し、strokes に一様に記録する。proposal の初提出は strokes にマーカー行として
  記録する。
- HTTP はステートレス。POST は受理・返却して即完結し、AI の呼び出し結果を待たない。結果は
  エージェントの提出（A5・A7）を受理した瞬間、サーバが WS（W1・W2）でブラウザへ中継する。
- **AI の起動は U13 が唯一の入口。** 受理系（U1・U7・U9）は受理と記録で完結し、AI を
  起動しない。画面は受理の成功応答の直後に U13 を呼ぶ（specs/api/invoke-agent）。

## エンドポイント一覧

### ユーザー（画面・管理）が操作する — 9本

| # | メソッド / パス | 内容 |
|---|---|---|
| U1 | `POST /api/strokes` | 概要を投稿する（セッション開始。id を発行して返す。起動しない） |
| U2 | `GET /api/strokes/:id` | セッションの状態（phase・呼び出しの実行状態）を見る |
| U3 | `GET /api/strokes/:id/strokes` | 済んだストロークの全件を見る（パンくず・粒開き。エージェントも読む） |
| U7 | `POST /api/strokes/:id/answer` | 今の1問に回答する（ストロークの問い・問い返しの区別なし。起動しない） |
| U9 | `POST /api/strokes/:id/send-back` | 差し戻す（指摘一式を送る。起動しない） |
| U10 | `POST /api/strokes/:id/approve` | 承認する |
| U11 | `POST /api/strokes/:id/delete` | セッションを消す（セッションに属するものが残らない） |
| U12 | `GET /api/strokes` | 残っているセッションを一覧する |
| U13 | `GET /api/strokes/:id/invoke-agent` | AI を起動する（claude 起動の唯一の入口。cwd をクエリで受け取る） |

### エージェントが操作する — 5本

| # | メソッド / パス | 内容 |
|---|---|---|
| A1 | `GET /api/strokes/:id/overview` | 概要を取得する |
| A4 | `GET /api/strokes/:id/send-back` | 差し戻しの指摘一式を取得する |
| A5 | `POST /api/strokes/:id/question` | 今の1問を提出する（ストロークの問い・問い返しの区別なし） |
| A7 | `POST /api/strokes/:id/proposal` | proposal を提出する（受理した本文を残す） |
| A8 | `POST /api/strokes/:id/submission` | 実行の記録（`invocation`）を変える。**叩くのは invokeAi だけ** |

### WS 配信 — 2本（サーバ → 画面のみ。画面からは何も送らない）

| # | パス | 内容 |
|---|---|---|
| W1 | `/api/strokes/:id/ws/question` | 今の1問分。A5 の受理・接続の瞬間に配信 |
| W2 | `/api/strokes/:id/ws/proposal` | proposal と名前候補。A7 の受理・接続の瞬間に配信 |

対称性: リソースは「書き手 POST ↔ 読み手 GET / WS」の1対。

| リソース | 書く | 読む |
|---|---|---|
| `/overview` | U1 | A1 |
| `/answer` | U7 | U3（strokes の末尾） |
| `/send-back` | U9 | A4 |
| `/question` | A5 | W1（画面）・U3（記録） |
| `/proposal` | A7 | W2（画面）・U3（マーカー） |
| `/submission` | A8 | U2（`invocation`） |

A8 だけはエージェントの口に置かれているが、**claude は叩かない**。実行の記録を書くのは
invokeAi だけである（`openspec/specs/api/stroke/submission`）。

## 各 endpoint の入出力

### U1 `POST /api/strokes`

- input: `{ overview: string }`（空・空白のみは 400）
- output: `{ sessionId: string }`

### U2 `GET /api/strokes/:id`

- output: `{ phase: 'stroking' | 'proposed' | 'approved', invocation: 'running' | 'idle' | 'failed' | 'error', path: string }`
- `path` は対象のディレクトリ。画面はこれを cwd として U13 に渡す（endpoint に導出させない）
- リロード時に1回読み、画面の行き先（`stroking`=画面1 / `proposed` 以降=画面2）と
  待機・失敗表示を決める。**回答や差し戻しを送って待っている間だけ**、数秒おきに読み直す。
- `phase: 'approved'` も `invocation` を持つ。昇格したプロジェクトでは steering の実行が
  起こるためで、`idle` に潰さずそのまま返す。
- `failed` のとき、ユーザーの再試行は同じ入力 POST（U7 / U9）の再送と、その成功応答後の U13。
  巡回（`server/plugins/02.retry-failed.ts`）も `failed` を拾って起こし直す。
- `error` はリトライ上限に達した**終端**。システムは自動では何もしない。画面は再実行
  （`U13?reset=1`。回数のリセットは U13 が行う）か削除（U11）を出す。**画面は A8 を叩かない。**
- エラー: 404 セッションなし

### U3 `GET /api/strokes/:id/strokes`

- output: `{ strokes: Stroke[] }`
- `Stroke` は `proposal: false`（問いと回答のペア。問い返しも同じ形）か
  `proposal: true`（proposal 初提出のマーカー。`question` / `answer` は null）のどちらか。
- エラー: 404 セッションなし

### U7 `POST /api/strokes/:id/answer`

- input: `Answer`（`{ kind: 'option' | 'free', value: string }`）
- output: 本文なし（204）
- 実行中でも受理する（busy は見ない。多重起動は U13 が止める）
- エラー: 400 形式不正 / 404 / 409 phase（`approved`・答えるべき問いが無い）

### U9 `POST /api/strokes/:id/send-back`

- input: `SendBackPayload`（`response` / `comments[]` / `annotations` / `nextSteps`）
- output: 本文なし（204）
- 実行中でも受理する（busy は見ない。多重起動は U13 が止める）
- エラー: 400 指摘0件・形式不正 / 404 / 409 phase（`proposed` のみ受理）

### U10 `POST /api/strokes/:id/approve`

- input: `{ projectName: string }`
- output: 本文なし（204）
- 承認は**セッションディレクトリを `<projectName>` へ改名するだけ**である。新しい
  ディレクトリを作らず、ファイルも動かさない（`openspec/specs/project/generation`）。
- 前提: `docs/proposal.md` が在ること。書くのは A7 で、残せたときだけ受理を成立させるので、
  `proposed` まで進んだセッションでは通常在る。外から消された場合は 409（proposal が
  見つからない）で止まる。**承認は proposal を書かず、既にあるものに触れない。**
- 順序は「衝突確認 → phase 書き換え → 改名」で、改名が失敗したら phase を `proposed` へ
  書き戻す。`approved` かつ未改名の宙吊りは作らない。
- 改名の成功直後に steering の claude を起こす（cwd＝生成先。完了は待たない・ADR 0011）。
  昇格に失敗したときは起こさない。
- エラー: 400 形式不正 / 404 / 409 name-conflict / 409 phase（`proposed` のみ受理）/
  409 proposal なし / 500 改名失敗

### U11 `POST /api/strokes/:id/delete`

- input: 本文なし
- output: 本文なし（204）
- 消したときは、そのセッションに属するもの（セッションディレクトリ配下の状態・生成物・
  openspec の change）が残らない。
- **消せるのはセッションだけ。** 承認で昇格した対象（`phase: 'approved'`）はもう
  プロジェクトなので受理しない。対象の id は昇格でプロジェクト名に変わり、`:id` は形では
  絞れない（steering の起動と実行の記録がその名前で来る）ため、**削除の到達範囲を止めるのは
  この phase の判定だけ**である。
- エラー: 404 セッションなし / 409 phase（`approved` は拒否）/ 409 busy（実行中の呼び出しを持つ間は受理しない）

### U12 `GET /api/strokes`

- output: `SessionSummary[]`（`{ id, phase, updatedAt, path, invocation }`。`updatedAt` は
  `state.json` の mtime。読めない `state.json` は `phase: 'unknown'`）。新しいものから並ぶ。
  1件も無ければ `[]`
- `path` は対象のディレクトリ。**キックする側はこれを cwd として U13 に渡す**（endpoint に
  導出させない）。`invocation` は実行の記録で、巡回はこれが `failed` の件だけを拾う
- 一覧には実体の揃ったセッション（ディレクトリ・openspec ルート・スキーマ設定済み）だけが
  載る。**作成直後（初回起動前）のセッションはまだ載らない**。U13 はこの符合で初回か継続かを
  判定する
- **承認で昇格した対象も載る。** 昇格後は id がプロジェクト名に変わるが、steering の
  巡回・再キックの対象になるため一覧から外さない。`state.json` を持たないディレクトリは
  載らない
- サーバが動いていないときの削除・一覧・作成は `yarn session`（`docs/specs/architecture/session-workflow.md`）

### U13 `GET /api/strokes/:id/invoke-agent`

- input: クエリ `cwd`（省略可。実行する場所）と `reset`（省略可。ユーザーの再実行）。
  **endpoint は cwd を自分で導出しない**——キックする側（画面・巡回・承認処理）が path を
  渡す。省略時はセッションディレクトリ。`reset` があればリトライ回数を 0 に戻してから起こす。
- output: 本文なし
- 受理で即完結する。`running` 化・起動・完了検知・タイムアウト・上限判定は非同期の
  invokeAi が担い、応答はそれを待たない。
- **完了は invokeAi が子プロセスの output stream で検知する。** 提出（A5・A7）は完了の
  合図ではない（`openspec/specs/agent/invocation`）。
- 初回か継続か・渡す定型は、セッション一覧（U12）に符合するかで導く
  （`openspec/specs/agent/invocation`）。初回は実行環境（openspec ルート・スキーマ設定）を
  整えてから起動する。
- `phase: 'approved'` でも受け付ける。昇格したプロジェクトでは steering を起こすためで、
  渡す定型と cwd だけが変わる（起動処理は呼び出し元を区別しない）。
- 画面は U1・U7・U9 の成功応答の直後にこれを呼ぶ。
- エラー: 404 セッションなし / 409 busy（実行中の多重起動）/ 503 前提が欠けている

### A1 `GET /api/strokes/:id/overview`

- output: `{ overview: string }`
- エラー: 404 セッションなし・概要なし

### A4 `GET /api/strokes/:id/send-back`

- output: `SendBackPayload`
- エラー: 404 セッションなし・差し戻しがまだ無い

### A5 `POST /api/strokes/:id/question`

- input: `Question`（`header` / `detail` / `question` / `options[]`）
- output: 本文なし（204）
- エラー: 400 スキーマ不適合 / 404 / 409 phase（`approved` は拒否）

### A7 `POST /api/strokes/:id/proposal`

- input: `{ proposal: string, projectName?: string }`（`projectName` は kebab-case のときだけ候補採用）
- output: 本文なし（204）
- **受理した本文を残す。** セッションの `docs/proposal.md` へ書き、以後に繋ぎ直した画面
  （W2 の接続時配信）でも承認（U10）でも同じ proposal が得られる。出し直しは上書きで、
  残るのは最後に受理した1件だけ（`openspec/specs/api/stroke/proposal`）。
- **残せなければ受理しない。** 書けなかったときは失敗を返し、phase も進めず W2 へも
  配信しない。受理したのに残っていない状態を作らない。
- 順序は「残す → phase を進める → W2 配信」。
- エラー: 400 本文が空 / 404 / 409 phase（`approved` は拒否）/ 500 残せなかった

### A8 `POST /api/strokes/:id/submission`

- input: `{ invocation: 'running' | 'idle' | 'failed' | 'error', retries?: number }`
- output: 本文なし
- 実行の記録を指定の値に変えるだけの口。**`invocation` の唯一の書き込み口**であり、
  叩くのは invokeAi だけとする。claude（エージェント）と画面は叩かない
  （`openspec/specs/api/stroke/submission`）。A5・A7 も `invocation` に触れない。
- 値の意味づけも遷移の判定もここでは持たない。`retries` は渡されたときだけ上書きする
  （`error` からの再実行で 0 に戻すのに使う）。
- エラー: 400 形式不正 / 404 セッションなし

### W1 `/api/strokes/:id/ws/question`

- メッセージ: `Question`
- 配信タイミング: A5 の受理・接続の瞬間（現在の1問があれば1件）
- 画面は最後に届いた1件で表示を上書きする

### W2 `/api/strokes/:id/ws/proposal`

- メッセージ: `ProposalMessage`（`{ proposal: string, projectName: string | null }`）
- 配信タイミング: A7 の受理・接続の瞬間（現在の proposal があれば1件）
- 画面は最後に届いた1件で表示を上書きする

## 約束

- **404**: 存在しないセッション uuid、または GET で対象がまだ保存されていない。
  画面はセッション未存在なら概要入力（`/`）へ戻す。
- **409 (`busy`)**: そのセッションで呼び出しが実行中のときの起動（U13）と削除（U11）。
  受理系（U7・U9）は実行中でも受理する。
- **409 (`name-conflict`)**: 承認時に `/opt/projects/<name>` が既に存在するとき。
- **409 (`phase`)**: その操作が今の phase に当てはまらない。
- 502 は無い。リトライを尽くした失敗は `invocation: failed`（U2）で伝わる。ユーザーの
  再試行は同じ入力 POST（U7 / U9）の再送と、その成功応答後の U13。
