# schema

## `state.json`

| 項目 | 型 | 必須 | 中身 |
|---|---|---|---|
| `phase` | `"stroking"` \| `"proposed"` \| `"approved"` | 必須 | セッションの局面 |
| `currentQuestion` | `Question` \| `null` | `approved` 以外は必須 | 今ユーザーが答えるべき問い |
| `invocation` | `"running"` \| `"idle"` \| `"failed"` \| `"error"` | `approved` 以外は必須 | 実行の記録。`error` はリトライ上限に達した終端（`docs/specs/architecture/session-workflow.md`「実行の記録」） |
| `retries` | `number` | 任意 | これまでに起こし直した回数。上限とタイムアウトの判定が読む |
| `runId` | `string` | 任意 | steering の会話の続き先。claude が採番した id を覚えて次回 `--resume` に渡す |
| `decision` | `object` | 任意 | 承認の判断。記録されている間もセッションは `proposed` のまま（`docs/specs/api/sessions/approve.md`） |
| `projectName` | `string` | `approved` は必須、他は任意 | `approved` 前は AI が提案した kebab-case の候補、`approved` は確定した名前 |

```json
{
  "phase": "proposed",
  "currentQuestion": {
    "header": "配線確認",
    "detail": "概要には「配線確認用。何も作らない。」とあり、実装対象が無いことは確定している。",
    "question": "作らないまま進めてよいか",
    "options": [
      {
        "label": "進めてよい",
        "description": "決定「何も作らない」を記録して proposal 作成へ進む",
        "recommended": true
      },
      {
        "label": "作るものを足す",
        "description": "概要を書き直してやり直す"
      }
    ]
  },
  "projectName": "one-memo",
  "invocation": "idle"
}
```

```json
{
  "phase": "approved",
  "projectName": "one-memo"
}
```

## `strokes.json`

| 項目 | 型 | 必須 | 中身 |
|---|---|---|---|
| `proposal` | `false` \| `true` | 必須 | `false` = 問いと回答のペア行、`true` = proposal の初提出を示すマーカー行 |
| `question` | `Question` \| `null` | 必須 | `proposal: true` では `null` |
| `answer` | `Answer` \| `null` | 必須 | `proposal: true` では `null` |

```json
[
  {
    "proposal": false,
    "question": {
      "header": "配線確認",
      "detail": "概要には「配線確認用。何も作らない。」とあり、実装対象が無いことは確定している。",
      "question": "作らないまま進めてよいか",
      "options": [
        {
          "label": "進めてよい",
          "description": "決定「何も作らない」を記録して proposal 作成へ進む",
          "recommended": true
        }
      ]
    },
    "answer": { "kind": "option", "value": "進めてよい" }
  },
  {
    "proposal": true,
    "question": null,
    "answer": null
  }
]
```

## `Question`

| 項目 | 型 | 必須 | 中身 | 規定 |
|---|---|---|---|---|
| `header` | `string` | 必須 | 話題タグ | 1〜12字 |
| `detail` | `string` | 必須 | 詳細説明 | 1〜300字 |
| `question` | `string` | 必須 | 問い本文 | 1〜20字 |
| `options` | `QuestionOption[]` | 必須 | 選択肢 | 1〜5件 |

## `QuestionOption`

| 項目 | 型 | 必須 | 中身 | 規定 |
|---|---|---|---|---|
| `label` | `string` | 必須 | 選択肢の見出し | 1字以上。上限なし |
| `description` | `string` | 必須 | それを選ぶと何がどうなるか | 1〜50字 |
| `recommended` | `boolean` | 任意 | 推奨の印 | `true` は多くとも1つ |

## `Answer`

| 項目 | 型 | 必須 | 中身 |
|---|---|---|---|
| `kind` | `"option"` \| `"free"` | 必須 | 選択肢を選んだか、自由入力で書いたか |
| `value` | `string` | 必須 | `option` は選んだ `label`、`free` は書いた本文。1字以上 |

```json
{ "kind": "option", "value": "進めてよい" }
```

```json
{ "kind": "free", "value": "どちらでもない。まず環境を確認したい。" }
```
