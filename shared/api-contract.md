# サーバ API の契約

画面（`app/`）・エージェント（`claude -p`）とサーバ（`server/`）の境界。型は `shared/types.ts`。
方式の詳細（決定・シーケンス）は `openspec/changes/migrate-claude-p-to-api-endpoint/design.md` を参照。

## セッションの参照方法

**セッション uuid は URL に載せる。** cookie では持たない。

| 画面 | ルート |
|---|---|
| 概要入力（セッション開始前） | `/` |
| 画面1（ストローク） | `/s/<uuid>` |
| 画面2（proposal 確認） | `/s/<uuid>/proposal` |

概要を投稿するとセッションが作られ、`/s/<uuid>` へ移る。

## 全体設計

- 1リソース1パス。書き手は POST、読み手は GET または WS 配信。
- POST は受理だけを返す（本文なし・200）。例外は U1（`sessionId` を返す）だけ。
- ストロークの問いと差し戻しへの問い返しは区別しない。提出は1口（A5）・配信は1チャネル
  （W1）に統合し、strokes に一様に記録する。proposal の初提出は strokes にマーカー行として
  記録する。
- HTTP はステートレス。POST は受理・返却して即完結し、AI の呼び出し結果を待たない。結果は
  エージェントの提出（A5・A7）を受理した瞬間、サーバが WS（W1・W2）でブラウザへ中継する。

## エンドポイント一覧

### ユーザー（画面）が操作する — 6本

| # | メソッド / パス | 内容 |
|---|---|---|
| U1 | `POST /api/overview` | 概要を投稿する（セッション開始。id を発行して返す） |
| U2 | `GET /api/:id` | セッションの状態（phase・呼び出しの実行状態）を見る |
| U3 | `GET /api/:id/strokes` | 済んだストロークの全件を見る（パンくず・粒開き。エージェントも読む） |
| U7 | `POST /api/:id/answer` | 今の1問に回答する（ストロークの問い・問い返しの区別なし） |
| U9 | `POST /api/:id/send-back` | 差し戻す（指摘一式を送る） |
| U10 | `POST /api/:id/approve` | 承認する |

### エージェントが操作する — 4本

| # | メソッド / パス | 内容 |
|---|---|---|
| A1 | `GET /api/:id/overview` | 概要を取得する |
| A4 | `GET /api/:id/send-back` | 差し戻しの指摘一式を取得する |
| A5 | `POST /api/:id/question` | 今の1問を提出する（ストロークの問い・問い返しの区別なし） |
| A7 | `POST /api/:id/proposal` | proposal を提出する |

### WS 配信 — 2本（サーバ → 画面のみ。画面からは何も送らない）

| # | パス | 内容 |
|---|---|---|
| W1 | `/api/:id/ws/question` | 今の1問分。A5 の受理・接続の瞬間に配信 |
| W2 | `/api/:id/ws/proposal` | proposal と名前候補。A7 の受理・接続の瞬間に配信 |

対称性: リソースは「書き手 POST ↔ 読み手 GET / WS」の1対。

| リソース | 書く | 読む |
|---|---|---|
| `/overview` | U1 | A1 |
| `/answer` | U7 | U3（strokes の末尾） |
| `/send-back` | U9 | A4 |
| `/question` | A5 | W1（画面）・U3（記録） |
| `/proposal` | A7 | W2（画面）・U3（マーカー） |

## 各 endpoint の入出力

### U1 `POST /api/overview`

- input: `{ overview: string }`（空・空白のみは 400）
- output: `{ sessionId: string }`

### U2 `GET /api/:id`

- output: `{ phase: 'stroking' | 'proposed' | 'approved', invocation: 'running' | 'idle' | 'failed' }`
- リロード時に1回読み、画面の行き先（`stroking`=画面1 / `proposed` 以降=画面2）と
  待機・失敗表示を決める。**回答や差し戻しを送って待っている間だけ**、数秒おきに読み直す。
- `failed` のとき、ユーザーの再試行は同じ入力 POST（U7 / U9）の再送。
- エラー: 404 セッションなし

### U3 `GET /api/:id/strokes`

- output: `{ strokes: Stroke[] }`
- `Stroke` は `proposal: false`（問いと回答のペア。問い返しも同じ形）か
  `proposal: true`（proposal 初提出のマーカー。`question` / `answer` は null）のどちらか。
- エラー: 404 セッションなし

### U7 `POST /api/:id/answer`

- input: `Answer`（`{ kind: 'option' | 'free', value: string }`）
- output: 本文なし（200）
- エラー: 400 形式不正 / 404 / 409 busy（実行中の追加送信）/ 409 phase（`approved`・答えるべき問いが無い）

### U9 `POST /api/:id/send-back`

- input: `SendBackPayload`（`response` / `comments[]` / `annotations` / `nextSteps`）
- output: 本文なし（200）
- エラー: 400 指摘0件・形式不正 / 404 / 409 busy / 409 phase（`proposed` のみ受理）

### U10 `POST /api/:id/approve`

- input: `{ projectName: string }`
- output: 本文なし（200）
- エラー: 400 形式不正 / 404 / 409 name-conflict / 409 phase（`proposed` のみ受理）/ 500 生成失敗

### A1 `GET /api/:id/overview`

- output: `{ overview: string }`
- エラー: 404 セッションなし・概要なし

### A4 `GET /api/:id/send-back`

- output: `SendBackPayload`
- エラー: 404 セッションなし・差し戻しがまだ無い

### A5 `POST /api/:id/question`

- input: `Question`（`header` / `detail` / `question` / `options[]`）
- output: 本文なし（200）
- エラー: 400 スキーマ不適合 / 404 / 409 phase（`approved` は拒否）

### A7 `POST /api/:id/proposal`

- input: `{ proposal: string, projectName?: string }`（`projectName` は kebab-case のときだけ候補採用）
- output: 本文なし（200）
- エラー: 400 本文が空 / 404 / 409 phase（`approved` は拒否）

### W1 `/api/:id/ws/question`

- メッセージ: `Question`
- 配信タイミング: A5 の受理・接続の瞬間（現在の1問があれば1件）
- 画面は最後に届いた1件で表示を上書きする

### W2 `/api/:id/ws/proposal`

- メッセージ: `ProposalMessage`（`{ proposal: string, projectName: string | null }`）
- 配信タイミング: A7 の受理・接続の瞬間（現在の proposal があれば1件）
- 画面は最後に届いた1件で表示を上書きする

## 約束

- **404**: 存在しないセッション uuid、または GET で対象がまだ保存されていない。
  画面はセッション未存在なら概要入力（`/`）へ戻す。
- **409 (`busy`)**: そのセッションで呼び出しが実行中のときの追加送信（U7・U9 のみ）。
- **409 (`name-conflict`)**: 承認時に `/opt/projects/<name>` が既に存在するとき。
- **409 (`phase`)**: その操作が今の phase に当てはまらない。
- 502 は無い。リトライを尽くした失敗は `invocation: failed`（U2）で伝わる。ユーザーの
  再試行は同じ入力 POST（U7 / U9）の再送。
