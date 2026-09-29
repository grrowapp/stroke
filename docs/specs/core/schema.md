# schema

## `state.json`

| 項目 | 型 | 必須 | 中身 |
|---|---|---|---|
| `phase` | `"stroking"` \| `"proposed"` \| `"approved"` \| `"activated"` | 必須 | セッションの局面。`stroking → proposed → approved → activated` の一方向。値の集合は `shared/stroke.ts` の `PHASES` が持つ。`approved` は生成中、`activated` は完成（steering が文書を出し終えたことを U15 が記録した） |
| `currentQuestion` | `Question` \| `null` | 昇格前（`stroking` / `proposed`）は必須 | 今ユーザーが答えるべき問い |
| `invocation` | `"running"` \| `"idle"` \| `"failed"` \| `"error"` | 昇格前は必須。昇格後（`approved` / `activated`）は省略時 `idle` | 実行の記録。`error` はリトライ上限に達した終端（`docs/specs/architecture/session-workflow.md`「実行の記録」） |
| `retries` | `number` | 任意 | これまでに起こし直した回数。上限とタイムアウトの判定が読む |
| `runId` | `string` | 任意 | steering の会話の続き先。claude が採番した id を覚えて次回 `--resume` に渡す。完成の記録で消えない |
| `decision` | `object` | 任意 | 承認の判断。記録されている間もセッションは `proposed` のまま（`docs/specs/api/sessions/approve.md`） |
| `projectName` | `string` | 昇格後は必須、他は任意 | 昇格前は AI が提案した kebab-case の候補、昇格後は確定した名前 |
| `startedBy` | `string` \| `null` | 任意 | ストロークを始めた利用者のメールアドレス。token の無い接続・CLI から始めたもの、この項目が入る前のものは `null` か省略で、管理者にだけ見える。昇格しても引き継ぐ |

昇格後の2つの局面（`approved` / `activated`）は同じ形で、違うのは `phase` の値だけ。完成の記録（`docs/specs/api/sessions/activate.md`）は `phase` だけを書き換え、他の項目に触れない。

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
  "projectName": "one-memo",
  "invocation": "failed",
  "retries": 0
}
```

```json
{
  "phase": "activated",
  "projectName": "one-memo",
  "invocation": "idle",
  "retries": 0,
  "runId": "8a6e1f4c-2b7d-4e0a-9c31-5d2f7b8e9a10"
}
```

## `access.json`

許可と管理者の登録。置き場は `<projectShareRoot>/.stroke-board/access.json`。ユーザー管理画面で編集するデータで、設定ではない（`docs/specs/core/settings-reference.md`「`access`」）。

| 項目 | 型 | 必須 | 中身 |
|---|---|---|---|
| `users` | `Record<string, string[]>` | 必須 | メールアドレス（小文字）→ 許可のあるプロジェクトのディレクトリ名 |
| `admins.emails` | `string[]` | 必須 | 管理者に指名したメールアドレス（小文字） |
| `admins.networks` | `string[]` | 必須 | token の無い接続を管理者とする接続元ネットワーク（CIDR） |
| `admins.hosts` | `string[]` | 必須 | token の無い接続を管理者とするホスト名（port を除いた形・小文字） |

ファイルが無いあいだは、`users` は空、`admins` は `runtimeConfig.access.admins` として読む。保存した時点からファイルの内容だけが判定に使われる。

```json
{
  "users": { "guest@example.com": ["one-memo"] },
  "admins": { "emails": ["lead@example.com"], "networks": ["192.168.1.0/24"], "hosts": [] }
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
