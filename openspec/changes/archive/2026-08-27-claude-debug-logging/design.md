## Context

動機は proposal.md の Why を参照。設計の前提になる事実は次の通り。

- claude の生出力（stdout）が揃うのは `runClaude`（`server/utils/stroke/claude.ts`）の終了ハンドラだけで、呼び出し元へは成否と要約（`ClaudeRunResult`）しか返らない
- 設定を引くのは端（endpoint・CLI）だけで、共有モジュールは引数で受け取る（`docs/specs/core/settings-reference.md`）。起動処理は内部で設定を引き直してはならない（`openspec/specs/agent/invocation`）
- ストローク側設定の正は `settings-reference.md` で、追記にはユーザー承認が要る（ADR-0004）

## Goals / Non-Goals

**Goals:**

- 呼び出しごとの生出力を、設定された出力先へ調査用に残す仕組みの設計
- 既定 OFF・書き出し失敗の無影響という spec の契約を、既存の設定規範（端が引く・引数で渡す）の上で成り立たせる

**Non-Goals:**

- ログのローテーション・保持期間・容量管理（調査用の一時的な口であり、運用機能にしない）
- stderr・実行時間・終了コードなど生出力以外の記録（要るなら別 change）
- 画面からのログ閲覧

## 流れ

```
nuxt.config.ts (claude.debugLogDir 追加・既定 '')
  │ 端（invoke.ts の呼び出し元）が設定を解決
  ▼
ClaudeRunOptions.debugLogDir（未設定なら undefined）
  ▼
runClaude の close ハンドラ
  │ stdout が確定した時点で、debugLogDir があれば書く
  ▼
<debugLogDir>/<YYYYMMDD-HHmmss-SSS>-<セッション uuid>.json
```

## Decisions

### Decision: 設定は `claude.debugLogDir` の1つで、空なら無効

**選択肢**: (a) 出力先のパス1つで有効/無効を兼ねる / (b) 有効フラグと出力先を別の設定にする。

(a) を採る。spec が「有効/無効のフラグは出力先の設定と別に持たない」と規定しており、設定2つは「フラグ ON だが出力先が無い」という壊れた組み合わせを作る。既定は空文字（= 無効）で、`config.ts` のスキーマ検証は空を許す。

### Decision: 書く場所は `runClaude` の終了ハンドラ、出力先は引数で渡す

**選択肢**: (a) `runClaude` が受け取った `debugLogDir` を使って自分で書く / (b) `runClaude` が生出力を戻り値に足し、`invokeAi` 側で書く。

(a) を採る。(b) は `ClaudeRunResult` の型変更が全呼び出し元へ波及し、調査用の複製のために本流の契約を変えることになる。(a) は `ClaudeRunOptions` に任意項目を1つ足すだけで済む。設定の解決は端が行い `runClaude` は渡された値を使うだけなので、「起動処理は設定を引き直さない」（`agent/invocation`）と両立する。値の解釈も補正もしない。

### Decision: ファイル名は `<YYYYMMDD-HHmmss-SSS>-<セッション uuid>.json`

時刻を先頭に置くのは名前順ソート＝時系列にするため。ミリ秒まで入れるのは同秒の衝突を避けるため。コロンを使わないのはファイル名として安全にするため。セッション uuid は呼び出し側が渡した値を使い、渡されていない呼び出し（claude 採番の新規起動）は応答から読めた `session_id`、それも無ければ `unknown` とする。

### Decision: 書き出しは同期を待たず、失敗は警告1行だけ残して握りつぶす

spec の「書き出し失敗は呼び出しへ影響しない」を、書き出しを呼び出しの完了処理から切り離すことで満たす。出力先ディレクトリは書き出し時に `mkdir -p` で用意し、mkdir・write のどちらの失敗も呼び出しの結果に反映しない。無音だと「設定したのにログが無い」調査が詰むため、サーバーログへ警告を1行出す。

## Risks / Trade-offs

- [ログに会話本文・コストが残る] → 既定 OFF。運用者が明示して初めて有効になり、出力先も運用者が決める
- [ログが溜まり続ける] → ローテーションは作らない（Non-Goals）。調査が終わったら設定を外して手で消す運用
- [書き出し失敗が呼び出し結果から見えない] → 意図した契約（spec）。警告1行で追える最低限だけ残す

## Migration Plan

なし。既定 OFF の設定追加のみで、既存の挙動・データに影響しない。`settings-reference.md` への追記はこの change の承認過程で行う（ADR-0004）。
