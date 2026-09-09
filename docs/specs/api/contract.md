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
- **AI の起動は U13 が唯一の入口。** 受理系（U1・U7・U9・U10・U14・U15）は受理と記録で完結し、
  AI を起動しない。画面は受理の成功応答の直後に U13 を呼ぶ。承認の流れは U10（判断）→ U14（昇格）
  → U13（steering の起動）→ U15（完成の記録）の4段で、U13 が届かなければ巡回が拾う。U15 は画面では
  なく invoke-agent が叩く。起動から実行の記録までの仕組みと責務は
  [architecture/invoke-agent.md](../architecture/invoke-agent.md)。
- **phase は `stroking → proposed → approved → activated` の一方向。** 値の集合は `shared/stroke.ts` の
  `PHASES` が1つ持つ。`approved` は生成中、`activated` は完成（steering の3文書と承認依頼が本家に
  揃った）。生成中か完了かは phase だけで決まり、`.spec-workflow/` の有無も `invocation` も見ない。
  完成したかを判定するのは U15 ではなく invoke-agent である
  （[architecture/invoke-agent.md](../architecture/invoke-agent.md)「作業が行われたかの判定」）。

## 各 endpoint の入出力

### U1 `POST /api/strokes`

- input: `{ overview: string }`（空・空白のみは 400）
- output: `{ sessionId: string }`

### U2 `GET /api/strokes/:id`

- output: `{ phase: 'stroking' | 'proposed' | 'approved' | 'activated', invocation: 'running' | 'idle' | 'failed' | 'error', path: string }`
- `path` は対象のディレクトリ。画面はこれを cwd として U13 に渡す（endpoint に導出させない）
- リロード時に1回読み、画面の行き先（`stroking`=画面1 / `proposed` 以降=画面2）と
  待機・失敗表示を決める。**回答や差し戻しを送って待っている間だけ**、数秒おきに読み直す。
- 昇格後（`approved` / `activated`）も `invocation` を持つ。昇格したプロジェクトでは steering の
  実行が起こるためで、`idle` に潰さずそのまま返す。`activated` は完成の記録（U15）だけが書く。
- `failed` のとき、ユーザーの再試行は同じ入力 POST（U7 / U9）の再送と、その成功応答後の U13。
  巡回（`server/plugins/01.retry-failed.ts`）も `failed` を拾って起こし直す。
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
- エラー: 400 形式不正 / 404 / 409 phase（承認以降＝`approved` / `activated`・答えるべき問いが無い）

### U9 `POST /api/strokes/:id/send-back`

- input: `SendBackPayload`（`response` / `comments[]` / `annotations` / `nextSteps`）
- output: 本文なし（204）
- 実行中でも受理する（busy は見ない。多重起動は U13 が止める）
- エラー: 400 指摘0件・形式不正 / 404 / 409 phase（`proposed` のみ受理）

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
  巡回・再キックの対象になるため一覧から外さない。完成した対象は `phase: 'activated'` で
  載る（起動時の書き上げはこの一覧の `approved` かつ `invocation: 'idle'` を拾って U15 を
  叩く）。`state.json` を
  持たないディレクトリは載らない
- サーバが動いていないときの削除・一覧・作成は `yarn session`（`docs/specs/architecture/session-workflow.md`）

### A1 `GET /api/strokes/:id/overview`

- output: `{ overview: string }`
- エラー: 404 セッションなし・概要なし

### A4 `GET /api/strokes/:id/send-back`

- output: `SendBackPayload`
- エラー: 404 セッションなし・差し戻しがまだ無い

### A5 `POST /api/strokes/:id/question`

- input: `Question`（`header` / `detail` / `question` / `options[]`）
- output: 本文なし（204）
- エラー: 400 スキーマ不適合 / 404 / 409 phase（承認以降＝`approved` / `activated` は拒否）

### A7 `POST /api/strokes/:id/proposal`

- input: `{ proposal: string, projectName?: string }`（`projectName` は kebab-case のときだけ候補採用）
- output: 本文なし（204）
- **受理した本文を残す。** セッションの `docs/proposal.md` へ書き、以後に繋ぎ直した画面
  （W2 の接続時配信）でも承認（U10）でも同じ proposal が得られる。出し直しは上書きで、
  残るのは最後に受理した1件だけ。
- **残せなければ受理しない。** 書けなかったときは失敗を返し、phase も進めず W2 へも
  配信しない。受理したのに残っていない状態を作らない。
- 順序は「残す → phase を進める → W2 配信」。
- エラー: 400 本文が空 / 404 / 409 phase（承認以降＝`approved` / `activated` は拒否）/ 500 残せなかった

### A8 `POST /api/strokes/:id/submission`

- input: `{ invocation: 'running' | 'idle' | 'failed' | 'error', retries?: number }`
- output: 本文なし（204）
- 実行の記録を指定の値に変えるだけの endpoint。**`invocation` を書き込めるのはここだけ**であり、
  叩くのは invoke-agent だけとする。claude（エージェント）と画面は叩かない
  A5・A7 も `invocation` に触れない。
- 値の意味づけも遷移の判定もここでは持たない。`retries` は渡されたときだけ上書きする
  （`error` からの再実行で 0 に戻すのに使う）。
- **成功の決着は流さない。** `idle` は「終わった」であって「できた」ではなく、`done` を配信するのは
  完成の記録（U15）だけ。生成中（`approved`）の対象が `error` に達したときの `failed` だけをここから流す。
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
invoke-agent だけである（[architecture/invoke-agent.md](../architecture/invoke-agent.md)）。
