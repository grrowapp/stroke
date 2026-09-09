# サーバ API の契約

画面（`app/`）・エージェント（`claude -p`）とサーバ（`server/`）の境界。型は `shared/stroke.ts`。
**この資料は全ての endpoint に共通する約束だけを持つ。** 各 endpoint の入出力は1本につき1ファイルで
`docs/specs/api/sessions/` と `docs/specs/api/strokes/`、WS 配信は `docs/specs/api/ws/delivery.md`、
endpoint の一覧は `docs/specs/api/overview.md` にある。番号が実際にどう繋がるかは
`docs/specs/architecture/question-flow.md`、入れ物の形と検証の規定は `docs/specs/core/schema.md`。

## セッションの参照方法

**セッション uuid は URL に載せる。** cookie では持たない。どの endpoint も対象の id を URL で受け取る。

画面とルートの対応は `docs/specs/architecture/question-flow.md`「画面とルート」。

## 全体設計

- 1リソース1パス。書き手は POST、読み手は GET または WS 配信。
- POST は受理だけを返す（本文なし・204）。例外は U1（`sessionId` を返す）だけ。
- ストロークの問いと差し戻しへの問い返しは区別しない。提出は1つの endpoint（A5）・配信は1チャネル
  （W1）に統合し、strokes に一様に記録する。proposal の初提出は strokes にマーカー行として
  記録する。
- HTTP はステートレス。POST は受理・返却して即完結し、AI の呼び出し結果を待たない。結果は
  エージェントの提出（A5・A7）を行った実行が決着した瞬間（A9）、サーバが WS（W1・W2）で
  ブラウザへ中継する。提出の受理では中継しない。
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

## 責務範囲

**endpoint の責務は原則1つ。** 1つの endpoint は軸を1つだけ持ち、2つ目の軸を持たない。軸とは、
その endpoint が受け持つ1つの事である——「完成を記録する」「実行の記録を書く」「要求を受けて
AI を起動する」。

**責務範囲は軸を起点に前後の幅を持つ。** 軸の成立に不可分な前と後——受理してよいかの検証、受理した
ことの記録、受理に続く配信——は責務範囲の**内**である。

**責務範囲を点で捉えた責務外判定は、責務判定の誤用である。** 「軸そのもの以外は責務外」と読むと、
検証も記録も配信も責務外になり、endpoint はその軸を成立させられなくなる。

**責務外の判定は軸の数で行う。** ある処理が責務外かどうかは、それが2つ目の軸に属するかどうかで
決める。軸が1つのまま前後へ広がっているものを責務外と判定しない。

既存の判断はこの形で説明が付く。

| endpoint | 軸 | 幅の内 | 責務外（別の軸） |
|---|---|---|---|
| U15（完成の記録） | phase を `approved` から `activated` へ変えたことを記録する | 記録に続く WS 配信 | 完成したかの判定（ADR-0014） |
| A8（実行の記録） | 渡された値を `invocation` へ書く | 形式の検証 | 値の意味づけと遷移の判定 |
| U13（AI の起動） | 要求を受けて AI を起動する | 起動の材料の組み立て | 起動したプロセスの終了を待って結果を返すこと |

## 約束

**status の意味はここが決める。どの endpoint がどれを返すかは、各 endpoint の資料が持つ。**
ここに endpoint の名前を並べない——並べると、endpoint が増減するたびにこの資料が変わる。

| status | 意味 | 呼び手の次の手 |
|---|---|---|
| **404** | 対象が無い。または GET で、まだ保存されていない | セッションが無いなら概要入力（`/`）へ戻す |
| **409 `name-conflict`** | 昇格先の名前が既に使われている | 別の名前で出し直す |
| **409 `phase`** | いまの phase にその操作が当てはまらない | 何もしない。phase が進むのを待つ |
| **503** | 環境か設定を直すまで通らない | **待っても通らない。** 直してからやり直す |

**409 と 503 の分かれ目は「待てば通るか」である。** 同じ「今は無理」でも、呼び手の次の手が違う。

**「実行中だから受理しない」という応答は無い。** 受理系は AI が走っていても受理する。起動（U13）は冪等で、対象が既に走っていればその要求は満たされているものとして受理し、新しい呼び出しを開始しない。同じ対象で2つの呼び出しを走らせないのは変わらないが、それを断る理由として呼び手へ返すものは持たない。

**502 は無い。** リトライを尽くした失敗は実行の記録（`invocation: failed`）で伝わる。ユーザーの再試行は、同じ入力の再送と、その成功応答に続く起動である。リトライが上限に達した後の扱いは
`docs/specs/architecture/failure.md`。

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

**A9（`/settlement`）はこの表に無い。** 決着は自分で書き置く内容を持たず、局面（U2 が読む
`phase`）と配信（W1・W2）へ効くだけで、対になる読み手が無いためである。叩くのは A8 と同じく
invoke-agent だけである。
