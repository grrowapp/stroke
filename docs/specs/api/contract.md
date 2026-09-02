# サーバ API の契約

画面（`app/`）・エージェント（`claude -p`）とサーバ（`server/`）の境界。型は `shared/stroke.ts`。
ここに並ぶ番号が実際にどう繋がるかは `docs/specs/architecture/question-flow.md`、入れ物の形と検証の規定は
`docs/specs/core/schema.md`。

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
- ストロークの問いと差し戻しへの問い返しは区別しない。提出は1つの endpoint（A5）・配信は1チャネル
  （W1）に統合し、strokes に一様に記録する。proposal の初提出は strokes にマーカー行として
  記録する。
- HTTP はステートレス。POST は受理・返却して即完結し、AI の呼び出し結果を待たない。結果は
  エージェントの提出（A5・A7）を受理した瞬間、サーバが WS（W1・W2）でブラウザへ中継する。
- **AI の起動は U13 が唯一の入口。** 受理系（U1・U7・U9・U10・U14）は受理と記録で完結し、
  AI を起動しない。画面は受理の成功応答の直後に U13 を呼ぶ（specs/api/invoke-agent）。承認の
  流れは U10（判断）→ U14（昇格）→ U13（steering の起こし）の3段で、U13 が届かなければ巡回が拾う。

## エンドポイント一覧

### ユーザー（画面・管理）が操作する — 10本

| # | メソッド / パス | 内容 |
|---|---|---|
| U1 | `POST /api/strokes` | 概要を投稿する（セッション開始。id を発行して返す。起動しない） |
| U2 | `GET /api/strokes/:id` | セッションの状態（phase・呼び出しの実行状態）を見る |
| U3 | `GET /api/strokes/:id/strokes` | 済んだストロークの全件を見る（パンくず・粒開き。エージェントも読む） |
| U7 | `POST /api/strokes/:id/answer` | 今の1問に回答する（ストロークの問い・問い返しの区別なし。起動しない） |
| U9 | `POST /api/strokes/:id/send-back` | 差し戻す（指摘一式を送る。起動しない） |
| U10 | `POST /api/strokes/:id/approve` | 承認の判断を記録する（改名しない・起動しない）。`DELETE` 同 path で取り消し |
| U11 | `DELETE /api/sessions/:id` | セッションを消す（セッションに属するものが残らない）。承認**前**の局面のものだけ |
| U12 | `GET /api/strokes` | 残っているセッションを一覧する |
| U13 | `GET /api/strokes/:id/invoke-agent` | AI を起動する（claude 起動の唯一の入口。cwd をクエリで受け取る） |
| U14 | `POST /api/strokes/:id/promote` | 判断のあるセッションをプロジェクトへ昇格させる（本文なし・起動しない） |

U11 だけ path が `/api/sessions/` なのは、capability（`openspec/specs/api/session/delete`）が
そう規定しているためである。他の U 系は実装が `/api/strokes/` のままで、spec と食い違っている
——削除に触ったこの機会に、削除だけを spec 側へ寄せた。

**削除はメソッドで振り分ける。** パスに `delete` という動詞を置かず、メソッドを絞らない
handler も作らない。`delete.ts`（メソッド接尾辞なし）にすると `GET /api/…/delete` でも
消えてしまう——Nitro がメソッドとして読むのはドットで続く接尾辞だけである。

### プロジェクトを操作する — 1本

| # | メソッド / パス | 内容 |
|---|---|---|
| P1 | `DELETE /api/projects/:projectId` | 作りきれなかったプロジェクトを消す。承認**以降**の局面のものだけで、`.spec-workflow/` を持つものは拒否する |

対象は `projectId` で指す。生成中・失敗した行は本家に登録されておらず registry から引けない
ので、**本家と同じ式で導出した値**を使う（`server/utils/upstream/project-id.ts`）。

削除の実行は U11 と共通で `server/handler/delete.ts` に1つ置く。**どの局面のものを許すかは
各 endpoint が持つ**——共通の実行に呼び出し元を知らせて分岐させない。

### エージェントが操作する — 5本

| # | メソッド / パス | 内容 |
|---|---|---|
| A1 | `GET /api/strokes/:id/overview` | 概要を取得する |
| A4 | `GET /api/strokes/:id/send-back` | 差し戻しの指摘一式を取得する |
| A5 | `POST /api/strokes/:id/question` | 今の1問を提出する（ストロークの問い・問い返しの区別なし） |
| A7 | `POST /api/strokes/:id/proposal` | proposal を提出する（受理した本文を残す） |
| A8 | `POST /api/strokes/:id/submission` | 実行の記録（`invocation`）を変える。**叩くのは invokeAi だけ** |

### WS 配信 — 3本（サーバ → 画面のみ。画面からは何も送らない）

配信の規約は `openspec/specs/ws/delivery` が持つ。要点は3つ。**サーバ → 画面の一方向**、
**接続した瞬間に現在分を流す**、そして **出来事の種類が増えても口を増やさない**。増やして
よいのは運ぶ相手が違うときだけで、同じ相手へ届く出来事が2種類あることを理由に口を2本に
しない。

| # | パス | 相手 | 内容 |
|---|---|---|---|
| W1 | `/api/strokes/:id/ws/question` | セッション1件を見ている画面 | 今の1問分。A5 の受理・接続の瞬間に配信 |
| W2 | `/api/strokes/:id/ws/proposal` | セッション1件を見ている画面 | proposal と名前候補。A7 の受理・接続の瞬間に配信 |
| WB | `/ws` | 上層を開いているブラウザ | 上層へのサーバー発イベント。**メッセージの種別で分ける** |

WB が運ぶ種別（`BoardMessage`）。

| 種別 | いつ | 内容 |
|---|---|---|
| `snapshot` | 接続の瞬間 | 通知の一覧・本家との接続状態 |
| `notification` | 本家由来の通知が起きたとき | 通知1件 |
| `upstream-connection` | 本家との接続が変わったとき | 繋がっているか |
| `project-creation` | 昇格・生成の完了・生成の失敗 | プロジェクト名と `done` / `in-progress` / `failed` |

WB は行の中身を運ばない。プロジェクト一覧の正は `GET /api/projects` の1つのままで、WB は
「取り直せ」の合図と、完了を祝う引き金である。

`snapshot` は現在分であって、出来事ではない。受けた画面は一覧を取り直す（切れていた間の
変化がそこで揃う）が、トーストも祝いも出さない。

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
- **判断を記録するだけ**である。改名しない・`phase` を動かさない・起動しない。昇格は
  U14、steering の起こしは昇格の成功を見た側の U13。判断が記録されている間もセッションは
  `proposed` のままで、一覧に生成中としては出ない
- 前提: `docs/proposal.md` が在ること。書くのは A7 で、`proposed` まで進んだセッションでは
  通常在る。外から消された場合は 409（proposal が見つからない）で止まる。**承認は proposal を
  書かず、既にあるものに触れない**
- 既に判断があれば 409 phase。画面は判断を置き換えるとき、先に `DELETE` を1回送ってから
  `POST` する
- **`DELETE /api/strokes/:id/approve`** — 記録した判断を取り下げる（204）。取り消すのは判断
  だけで、proposal・往復の記録・ディレクトリには触れない。判断が無ければ何も変えず 204。
  昇格の後は 409 phase（そこから先はプロジェクトの削除）
- エラー: 400 形式不正 / 404 / 409 name-conflict（記録の時点でも衝突を確認）/ 409 phase

### U11 `DELETE /api/sessions/:id`

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
- output: `{}`（200）。読み取り（GET）のため 204 を使わない
- 受理で即完結する。`running` 化・起動・完了検知・タイムアウト・上限判定は非同期の
  invokeAi が担い、応答はそれを待たない。
- **完了は invokeAi が子プロセスの output stream で検知する。** 提出（A5・A7）は完了の
  合図ではない（`openspec/specs/agent/invocation`）。
- 初回か継続か・渡す定型は、セッション一覧（U12）に符合するかで導く
  （`openspec/specs/agent/invocation`）。初回は実行環境（openspec ルート・スキーマ設定）を
  整えてから起動する。
- `phase: 'approved'` でも受け付ける。昇格したプロジェクトでは steering を起こすためで、
  渡す定型と cwd だけが変わる（起動処理は呼び出し元を区別しない）。
- 画面は U1・U7・U9 の成功応答の直後にこれを呼ぶ。承認の流れでは昇格（U14）の成功後に呼ぶ。
- エラー: 404 セッションなし / 409 busy（実行中の多重起動）/ 503 前提が欠けている

### U14 `POST /api/strokes/:id/promote`

- input: 本文なし（**名前は判断が持つ。** 引数で受けると判断と違う名前で昇格できてしまう）
- output: 本文なし（204）
- **判断のあるセッションをプロジェクトへ昇格させる。** 判断を下すことも、起動を要求する
  ことも受け持たない。記録された判断が無ければ 409 phase — 承認が昇格の唯一の引き金である
  関係はここで守られる
- 昇格は**セッションディレクトリを判断の名前へ改名するだけ**である（`openspec/specs/project/generation`）。
  順序は「衝突確認 → 改名 → `phase` を書く」で、書き込みが失敗したら改名を戻す。どの時点で
  失敗しても、セッションは元の名前・`proposed`・判断そのままで残り、同じ判断のまま昇格だけを
  やり直せる
- name-conflict のときは判断を取り下げて 409 name-conflict を返す（画面は衝突として出し、
  別名で判断からやり直す）
- 昇格の完了時点で対象の `invocation` は `failed` になる（「起こし直す対象」の印）。画面の
  U13 が届けばすぐ実行に変わり、届かなければ巡回（A8 経由）が拾って steering を起こす
- エラー: 404 / 409 phase（判断なし・昇格済み）/ 409 name-conflict / 500 改名失敗

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
  残るのは最後に受理した1件だけ。
- **残せなければ受理しない。** 書けなかったときは失敗を返し、phase も進めず W2 へも
  配信しない。受理したのに残っていない状態を作らない。
- 順序は「残す → phase を進める → W2 配信」。
- エラー: 400 本文が空 / 404 / 409 phase（`approved` は拒否）/ 500 残せなかった

### A8 `POST /api/strokes/:id/submission`

- input: `{ invocation: 'running' | 'idle' | 'failed' | 'error', retries?: number }`
- output: 本文なし（204）
- 実行の記録を指定の値に変えるだけの endpoint。**`invocation` を書き込めるのはここだけ**であり、
  叩くのは invokeAi だけとする。claude（エージェント）と画面は叩かない
  A5・A7 も `invocation` に触れない。
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

**status の意味はここが決める。どの endpoint がどれを返すかは、各 endpoint の資料が持つ。**
ここに endpoint の名前を並べない——並べると、endpoint が増減するたびにこの資料が変わる。

| status | 意味 | 呼び手の次の手 |
|---|---|---|
| **404** | 対象が無い。または GET で、まだ保存されていない | セッションが無いなら概要入力（`/`）へ戻す |
| **409 `busy`** | 同じ対象で AI が走っている | **待てば通る。** 応答が終わってから同じ操作をやり直す |
| **409 `name-conflict`** | 昇格先の名前が既に使われている | 別の名前で出し直す |
| **409 `phase`** | いまの phase にその操作が当てはまらない | 何もしない。phase が進むのを待つ |
| **503** | 環境か設定を直すまで通らない | **待っても通らない。** 直してからやり直す |

**409 と 503 の分かれ目は「待てば通るか」である。** 同じ「今は無理」でも、呼び手の次の手が違う。

**受理と起動は別である。** 受理系は AI が走っていても受理する。多重起動を止めるのは起動側だけで、受理側は `busy` を見ない。

**502 は無い。** リトライを尽くした失敗は実行の記録（`invocation: failed`）で伝わる。ユーザーの再試行は、同じ入力の再送と、その成功応答に続く起動である。

## 対称性

リソースは「書き手 POST ↔ 読み手 GET / WS」の1対。

| リソース | 書く | 読む |
|---|---|---|
| `/overview` | U1 | A1 |
| `/answer` | U7 | U3（strokes の末尾） |
| `/send-back` | U9 | A4 |
| `/question` | A5 | W1（画面）・U3（記録） |
| `/proposal` | A7 | W2（画面）・U3（マーカー） |
| `/submission` | A8 | U2（`invocation`） |

A8 だけはエージェント側に置かれているが、**claude は叩かない**。実行の記録を書くのは
invokeAi だけである。
