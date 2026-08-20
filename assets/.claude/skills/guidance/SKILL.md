---
name: guidance
description: >-
  セッション API スキル（get-overview / get-strokes / get-send-back / question / proposal）の
  呼び出し方法の一覧と、question の詳しい使い方。これらのスキルを使う前に読む。
---

# セッション API スキルの使い方

## 一覧

| スキル | 用途 | 呼び出し方法 |
|---|---|---|
| `/get-overview` | 概要（作りたいシステムの説明）の取得 | `/get-overview` |
| `/get-strokes` | 済んだストロークの記録の取得（末尾が直前の回答） | `/get-strokes` |
| `/get-send-back` | 差し戻しの指摘一式の取得（差し戻しが無ければ 404） | `/get-send-back` |
| `/question` | ストロークの問いの提出（問い返しも同じ口） | `/question '<header>' '<detail>' '<question>' '<options>'` |
| `/proposal` | proposal の提出（差し戻し後の再提出も同じ口） | `/proposal '<filepath>' '<projectName>'` |

## 共通事項

- 接続先とセッション id はスキルの内部で自動解決される（環境変数 STROKE_BASEURL と CLAUDE_SESSION_ID）。引数で渡すものは提出内容だけでよい
- 複数語・記号を含む値はシングルクォートで囲む。値の中に `'` は使えない

## question の詳しい呼び出し方

引数は4つの位置引数で、順序固定。

```
/question '<header>' '<detail>' '<question>' '<options>'
```

| 位置 | 引数 | 内容 |
|---|---|---|
| 1 | header | 話題タグ。12字以内 |
| 2 | detail | 詳細説明。300字以内。既に確定していること、調べて分かった事実 |
| 3 | question | 問い本文。20字以内 |
| 4 | options | 選択肢の JSON 配列を文字列1つで渡す。1〜5件 |

`options` の各要素:

```json
{ "label": "見出し。1〜5語", "description": "それを選ぶと何がどうなるか。50字以内", "recommended": true }
```

- `recommended` を付けるのは多くとも1つ。付けなくてよい。推奨の根拠は書かない
- 差し戻しへの問い返しも、ストロークの問いと同じこの口で提出する。区別しなくてよい
- 規定の長さや件数を超えた提出は 400 で返る。エラーを読んで、同じ呼び出しの中で出し直すこと

呼び出し例（完全形）:

```
/question '認証' '単一ユーザーで運用する前提が確定している。' '認証は作るか？' '[{"label":"作らない","description":"単一ユーザーのため不要になる","recommended":true},{"label":"作る","description":"将来の複数ユーザーに備える"}]'
```

## proposal の呼び出し方

```
/proposal '<filepath>' '<projectName>'
```

- 全文は引数に載せない。先に proposal 全文（Markdown）をファイルへ書き、そのパスを `filepath` に渡す
- `projectName` は kebab-case のプロジェクト名の候補。候補を出さない場合は `''` を渡す（提出 JSON からキーごと省略される）
- 差し戻し後の再提出も同じ口で出す。対応方法（全文を書き直す・一部だけ直す等）は自分で判断する
