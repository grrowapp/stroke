# mcp/tools/question Specification

## Purpose
ストロークの問いを送るツール（`send-question`）の契約を定める。問いは文章ではなく構造化データであり、専用の引数スキーマを持つ。

## Requirements

### Requirement: 問いを構造化引数で送る

ツールの引数は問いの構造——header（話題タグ）・detail（詳細説明）・question（問い本文）・options（選択肢の一覧。各選択肢は label・description・任意の recommended を持つ）——とする SHALL。ツールは問いを自セッションのストロークの問いとして送る SHALL。成功の結果は `status: 204` を持つ SHALL（送信先は本文なしの 204 を返す）。失敗の結果は `status`（HTTP ステータスコード）・`errorCode`（失敗の種別を表す機械可読コード。検証エラー（400）は `validation_error`、セッションが無い場合（404）は `session_not_found`、承認済みで送れない場合（409）は `phase_conflict`）・`error`（送信先が返したエラー本文）を持つ SHALL（`mcp/server` の形式）。

ツール側で引数の値の検証を行って送信を止めてはならない（MUST NOT）——検証の正は送信先にある。ただし各引数の説明は、送信先が課している長さ・件数の上限（header 12文字・detail 300文字・question 20文字・options は1件以上5件以内で description 50文字）を含む SHALL。上限は説明として伝えるだけで、上限を根拠にツール側で送信を止めてはならない（MUST NOT）。

#### Scenario: 引数スキーマが上限を説明として持っている

- **GIVEN** invoke.ts が起動した claude が `/mcp` へ接続している
- **WHEN** その接続で `send-question` の引数スキーマの定義を取る
- **THEN** header・detail・question・options（および options の description）の説明に、送信先が課している上限が書かれている

#### Scenario: 送った問いが画面に表示される

- **GIVEN** 対象のセッションがストローク中である
- **WHEN** claude が header・detail・question・options を渡して問いを送る
- **THEN** 結果に `status: 204` が入り、セッション画面（`/strokes/<セッション id>`）にその問いが表示される（検証側がブラウザで開いて確かめる）

#### Scenario: 送信先の検証に通らない

- **GIVEN** 対象のセッションがストローク中である
- **WHEN** 送信先の検証に通らない問いを送る
- **THEN** 結果はエラーで、`status: 400`・`errorCode: validation_error` と、**送信先が返した本文をそのまま**（`error`）持つ。本文には違反した項目と理由が含まれる（例: `問いの構造として読み取れない。options.0.description: 選択肢の説明は50字まで。（現在 57）`）。ツールが要約・切り詰めをしてはならない（MUST NOT）——送り手はこの内容だけを頼りに直す

#### Scenario: セッションが存在しない

- **GIVEN** 対象のセッションが削除されている
- **WHEN** 問いを送る
- **THEN** 結果はエラーで、`status: 404`・`errorCode: session_not_found` と、送信先のエラー本文「そのセッションは無い。」（`error`）を持つ

#### Scenario: 承認済みのセッションには送れない

- **GIVEN** 対象のセッションが承認済みである
- **WHEN** 問いを送る
- **THEN** 結果はエラーで、`status: 409`・`errorCode: phase_conflict` と、送信先のエラー本文「承認済みのセッションには提出できない。」（`error`）を持つ

#### Scenario: 検証エラーの後に送り直す

- **GIVEN** 対象のセッションがストローク中であり、直前の送信が検証エラーで受け付けられていない
- **WHEN** 内容を直した問いを同じツールで送る
- **THEN** 結果に `status: 204` が入り、セッション画面にその問いが表示される
