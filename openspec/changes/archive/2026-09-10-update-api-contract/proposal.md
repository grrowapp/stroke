## Why

**この change が動かすのは `docs/specs/api/contract.md` である。** 足すもの（endpoint の責務範囲の判定則）と抜くもの（全 endpoint に共通しない記述）が1つずつあり、どちらも同じ資料の更新である。新しい規範の資料は作らない。

**「endpoint の責務範囲」の判定則がどこにも書かれていない。** いま在るのは個別の判断だけである——U15 は完成したかを判定しない（ADR-0014）、A8 は値の意味づけも遷移の判定も持たない、起動を受け付けた endpoint は応答をプロセスの終了まで待たない。どれも「これはこの endpoint の責務ではない」と言っているが、**何をもって責務の外と判定したのか**は書かれていない。

判定則が無いと、責務範囲が**点**として読まれる。「この endpoint の責務は phase を書き換えることだから、それ以外は全部責務外」と読むと、受理の前の検証も、受理の後の記録も配信も責務外になり、endpoint は責務を果たせなくなる。責務範囲は軸を起点に前後へ幅を持つものであり、点で捉えた責務外判定は責務判定の誤用である（ユーザー指示 2026-09-09）。

書き出し先は `docs/specs/api/contract.md` とする。`docs/specs/api/overview.md` の目録がこの資料を「全ての endpoint に共通する約束」と定めており、責務範囲の判定則はまさにそれに当たる。

**ただし、いまの contract.md は共通の約束の資料として読めない。** 183行のうち、全 endpoint に共通しているのは「全体設計」「約束（status の意味）」「対称性」の3節だけで、残りは個別の事情である。

- **「各 endpoint の入出力」（約100行）** — U1・U2・U3・U7・U9・U12 と A1・A4・A5・A7・A8、W1・W2 の入出力・振る舞い・エラー。1本につき1ファイルという規定（`api/overview.md`）が既に在り、`sessions/` の5本（activate・approve・delete・invoke-agent・promote）はその形で切り出し済みである。切り出されていない残りが contract.md に留まっている
- **「セッションの参照方法」** — 画面とルートの対応表。endpoint の約束ではない

ユーザー指示（2026-09-09）は、**api 全般の指標だけへ集約し、それ以外の記述を切り出すところまでをこの change で行う**ことである。

## What Changes

### 足す — `docs/specs/api/contract.md` に「責務範囲」の節

- **endpoint の責務は原則1つ。** 1つの endpoint は1つの軸を持つ
- **責務範囲は軸を起点に前後の幅を持つ。** 軸の成立に不可分な前と後——受理の前の検証、受理の後の記録・配信——は責務範囲の内である
- **責務範囲を点で捉えた責務外判定は誤用である。** 「軸そのもの以外は責務外」と読んではならない
- **責務外の判定は軸の数で行う。** その endpoint が2つ目の軸を持ったときに責務外となる。既存の判断はこの形で説明が付く
  - U15（完成の記録）— 軸は「phase を `approved` から `activated` へ変えたことを記録する」。記録に続く WS 配信は幅の内。**完成したかの判定は別の軸**なので責務外（ADR-0014）
  - A8（実行の記録）— 軸は「渡された値を `invocation` へ書く」。**値の意味づけと遷移の判定は別の軸**なので責務外
  - U13（AI の起動）— 軸は「要求を受けて AI を起動する」。起動の材料の組み立ては幅の内。**プロセスの終了を待って結果を返すのは別の軸**なので責務外

### 抜く — `docs/specs/api/contract.md` から共通でない記述を切り出す（移設。内容は変えない）

| いま contract.md に在るもの | 移す先 |
|---|---|
| U1 概要の投稿 | `docs/specs/api/sessions/overview.md`（新設） |
| U2 セッションの状態 | `docs/specs/api/sessions/get.md`（新設） |
| U3 済んだストローク | `docs/specs/api/sessions/strokes.md`（新設） |
| U7 回答 | `docs/specs/api/sessions/answer.md`（新設） |
| U9 差し戻し | `docs/specs/api/sessions/send-back.md`（新設） |
| U12 セッションの一覧 | `docs/specs/api/sessions/list.md`（新設） |
| A1・A4・A5・A7・A8 | `docs/specs/api/strokes/{overview,send-back,question,proposal,submission}.md`（新設。`strokes/` は `api/overview.md` の目録に在るがディレクトリがまだ無い） |
| W1・W2 | `docs/specs/api/ws/delivery.md`（既存。W1/W2/WB の表を持つ資料へ吸収する） |
| 「セッションの参照方法」の画面とルートの対応表 | `docs/specs/architecture/question-flow.md`（画面の資料。移し先は design.md で確定する） |

**contract.md に残すもの** — 全体設計・責務範囲（新設）・約束（status の意味）・対称性、および「セッション uuid は URL に載せる。cookie では持たない」（どの endpoint も id を URL で受けるという共通の約束）。

ファイル名は openspec の capability path（`api/session/get`・`api/stroke/submission` など）に揃える。

### パス表記の食い違い

contract.md は U 系を `/api/strokes/:id/...` で書いているが、`api/overview.md` と `api/sessions/*.md` は `/api/sessions/:id/...` である。**切り出し先の資料は docs の正（`/api/sessions/`）に揃える。** 実装の移設は `fix-server-api-layout`（Gitea #17）の範囲であり、この change は実装に触らない。

### 範囲外

- 実装・テスト。この change は docs と specs だけを動かす
- `api/overview.md`・`api/server.md`。並走する `fix-server-api-layout` が基準として参照しており、触らない（同 change の ticket に「基準の `overview.md`・`server.md` には触れない」と在る）
- 責務範囲の判定則を個々の endpoint へ当てて、責務の切り直しを行うこと。判定則を置くところまでを持つ

## Capabilities

### Modified Capabilities

- `api/contract`: 「endpoint の責務は1つの軸を持ち、責務範囲は軸の前後へ幅を持つ」「責務外の判定は軸の数で行い、点で捉えて判定してはならない」を ADDED。応答コードの規約（既存の2つの Requirement）は変えない

## Impact

- docs: `api/contract.md`（183行 → 全般の約束と責務範囲だけ）、`api/sessions/` に6件新設、`api/strokes/` を新設して5件、`api/ws/delivery.md` へ追記、`architecture/question-flow.md` へ表を移す
- 参照の付け替え: contract.md を指している資料（`architecture/question-flow.md`・`core/schema.md`・`api/sessions/*.md`・`api/ws/delivery.md`）のうち、個別 endpoint の記述を指しているもの
- 並走中の change への影響: `fix-server-api-layout`・`fix-session-api-layout` は docs を正として実装を直す側であり、参照先の資料が増える。切り出しの完了を両者へ知らせる
- 実装・テストへの影響なし
