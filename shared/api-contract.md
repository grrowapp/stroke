# サーバ API の契約

画面（`app/`）とサーバ（`server/`）の境界。型は `shared/types.ts`。

## セッションの参照方法

**セッション uuid は URL に載せる。** cookie では持たない。
URL とセッションが1対1に紐づき、ブックマークで戻れる。

| 画面 | ルート |
|---|---|
| 概要入力（セッション開始前） | `/` |
| 画面1（ストローク） | `/s/<uuid>` |
| 画面2（proposal 確認） | `/s/<uuid>/proposal` |

概要を投稿するとセッションが作られ、`/s/<uuid>` へ移る。

## エンドポイント

| メソッド | パス | 入力 | 出力 | 備考 |
|---|---|---|---|---|
| `POST` | `/api/sessions` | `{ overview: string }` | `SessionView` | 概要でセッションを開始。空なら 400 |
| `GET` | `/api/sessions/:id` | — | `SessionView` | 無い uuid は 404 |
| `POST` | `/api/sessions/:id/answer` | `{ answer: Answer }` | `StrokeResult` | 問いに答える |
| `POST` | `/api/sessions/:id/send-back` | `SendBackPayload` | `StrokeResult` | 差し戻す。コメント0件なら 400 |
| `POST` | `/api/sessions/:id/approve` | `{ projectName: string }` | `ApproveResult` | 承認して生成。衝突は 409 |

## 約束

- **404**: 存在しないセッション uuid。画面は概要入力（`/`）へ戻す。
- **409 (`busy`)**: そのセッションで `claude -p` が実行中のときの追加送信。画面は待機表示のまま。
- **409 (`name-conflict`)**: 承認時に `/opt/projects/<name>` が既に存在するとき。`phase` は `proposed` のまま。
- **409 (`phase`)**: その操作が今の `phase` に当てはまらない。画面が持っている状態が古い。
- **502**: リトライを尽くしても AI から応答が得られなかったとき。`phase` は変えない。
- `StrokeResult.outcome` が `question` なら次の問い、`followup` なら差し戻しへの問い返し、
  `proposal` なら proposal が出た。
- `SessionView.followupQuestion` は「差し戻しに対して AI が問い返してきて、まだ答えていない」状態。
  画面2 はこれを見て点滅する知らせを出す。
