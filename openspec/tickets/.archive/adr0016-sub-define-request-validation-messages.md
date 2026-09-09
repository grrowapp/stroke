---
status: ready-for-agent
tags:
  - enhancement
---

# adr0016-sub-define-request-validation-messages

入力検証のエラーが「何を直せばよいか」を伝えていない。制約ごとのメッセージが定義されておらず、検証ライブラリの既定文が送り手へ届く。

## 事実

実測 2026-08-28（`yarn check:stroke` でストロークを流した結果）。

A5（`POST /api/strokes/:id/question`）が返していたのはこの1文だけだった。

```
問いの構造として読み取れない。
```

エージェントの `send-question` は 13回中5回が 400。原因はすべて `options[].description` が **51 文字**（上限 50）で、**1 文字**の超過だった。何を削れば通るか分からず、内容を捨てた極端に短い問いを投げて通し方を探る挙動になった。

```
header=6  question=12 detail=125 opts=3 maxdesc=51   -> 400
header=2  question=5  detail=3   opts=2 maxdesc=2    -> 400
header=3  question=6  detail=4   opts=3 maxdesc=2    -> 400
```

提出された問いの実物: `分けるか？` `分けるか2？`

違反箇所を返すようにしたところ 400 は 5 件 → 1 件になり、その 1 件も理由が届いて次で通った。

```
問いの構造として読み取れない。
options.0.description: Too big: expected string to have <=50 characters（現在 52） /
options.2.description: Too big: expected string to have <=50 characters（現在 53）
```

ただし `Too big: expected string...` は zod の既定文である。日本語の受け口に英語の実装都合の文が出ている。

## 残っている穴

**検証を通していない受け口**

```
server/api/strokes/[id]/question.post.ts   （questionViolations は別経路で追加した）
server/api/strokes/[id]/delete.post.ts
```

**制約にメッセージが無い箇所**（`server/utils/stroke/request-schemas.ts`）

```
あり: overview: min(1, '概要が要る。')
      value:    min(1, '回答が要る。')
      comment:  min(1, '指摘の本文が要る。')

なし: id / timestamp / bg / border / startOffset / endOffset ...
```

**`server/utils/stroke/question.ts` の長さ・件数の上限はすべてメッセージ無し**

```
header:      max(12)
detail:      max(300)
question:    max(20)
options:     min(1).max(5)
description: max(50)
```

## 求めるもの

- 送り手が組み立てて送るすべての受け口で、入力を検証の定義に通す
- 制約ごとにメッセージを定義する。既定文に委ねない
- 違反は全部返す。1つずつ直させない
- 長さ・件数の違反には現在値を添える

change: `adr0016-sub-define-request-validation-messages`（proposal / specs 作成済み、実装は未着手）
