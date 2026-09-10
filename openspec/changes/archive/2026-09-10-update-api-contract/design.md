## Context

現状は proposal.md「Why」にある。設計として押さえる事実は3つ。

- **`docs/specs/api/contract.md` は 183 行あり、全 endpoint に共通するのは3節だけである。** 残りは個別の endpoint の入出力（約 100 行）と画面のルート表
- **1本につき1ファイルという規定は既にある**（`docs/specs/api/overview.md` の目録）。`sessions/` の5本（activate・approve・delete・invoke-agent・promote）はその形で切り出し済みで、書き方の見本になる。`strokes/` はディレクトリがまだ無い
- **並走する change が2本ある。** `fix-server-api-layout`（親）と `fix-session-api-layout`（子）は「docs は正、実装を直す」方針で、基準の `overview.md`・`server.md` に触れない。**この change は逆に docs だけを動かし、実装に触れない。** 触る対象が重ならない

## Goals / Non-Goals

**Goals**

- 「責務外」を判定するときの物差しを contract.md に置く
- contract.md を「全ての endpoint に共通する約束」の資料に戻す（`overview.md` の目録が定める姿）
- 切り出した記述を、既存の1本1ファイルの形へ収める

**Non-Goals**

- 実装・テストを変えること。この change は docs と specs だけを動かす
- 判定則を個々の endpoint へ当てて責務を切り直すこと。**物差しを置くところまで**を持ち、当てるのは各 change の仕事
- `overview.md`・`server.md` を触ること（並走の基準になっている）
- 実装のパスを `/api/sessions/` へ移すこと（`fix-server-api-layout` の範囲）

## Decisions

### 判定則は「軸の数」で書く

責務範囲を「1つの軸 + 前後の幅」として定め、責務外の判定を**軸が2つになったか**で行う。

**代案として退けたもの** — 「その endpoint がやってよいこと」を列挙する形。列挙は endpoint が増えるたびに伸び、書かれていない処理の可否を判定できない。軸の数で判定すれば、新しい endpoint にもそのまま当たる。

判定則が既存の判断を説明できることを、spec の Scenario で3つ確かめる（U15・A8・U13）。**説明できない既存の判断が見つかったら、判定則の側を疑う**——その場合は tasks を止めてユーザーへ諮る。

### docs への整合反映（**承認を求める**）

`docs/agents/issue-tracker.md`「更新対応」に従い、上位資料への反映をここで諮る。承認を得るまで docs は書き換えない。

**足すもの**

| 資料 | 反映の内容 |
|---|---|
| `docs/specs/api/contract.md` | 「責務範囲」の節を「全体設計」の直後に置く。軸は1つ／範囲は軸の前後へ幅を持つ／点で捉えた責務外判定は誤用／責務外は軸の数で判定する。既存の判断（U15・A8・U13）を例として添える |

**抜くもの**（移設。本文は変えない）

| いま contract.md に在るもの | 移す先 |
|---|---|
| U1・U2・U3・U7・U9・U12 | `docs/specs/api/sessions/{overview,get,strokes,answer,send-back,list}.md`（新設6件） |
| A1・A4・A5・A7・A8 | `docs/specs/api/strokes/{overview,send-back,question,proposal,submission}.md`（新設5件。`strokes/` ディレクトリも新設） |
| W1・W2 | `docs/specs/api/ws/delivery.md`（既存の表と規約の下へ吸収） |
| 「セッションの参照方法」の画面とルートの対応表 | `docs/specs/architecture/question-flow.md`（「画面とルートの対応表は `architecture/question-flow.md` へ移す」） |

**残すもの** — 全体設計・責務範囲・約束（status の意味）・対称性、および「セッション uuid は URL に載せる。cookie では持たない」。

### 切り出したファイルの書き方は `sessions/activate.md` に倣う

見出しは `# <日本語の名前> — <メソッド> <パス>`、冒頭に1〜2文の位置づけと「共通の約束は contract.md」への参照、続けて input / output・「## 振る舞い」・「## エラー」。既存5本がこの形で、揃えれば新設11本も同じ読み方で読める。

**移設で本文を書き換えない。** 表記の統一・言い回しの改善は行わず、切り出しが済んだ状態で差分が「移動だけ」と読めるようにする。例外はパス表記（「切り出し先のパス表記は docs の正へ揃える」）だけである。

### 画面とルートの対応表は `architecture/question-flow.md` へ移す

対象は contract.md 冒頭の「セッションの参照方法」のうち**表の部分**（`/`・`/strokes/<uuid>`・`/strokes/<uuid>/proposal` と画面の対応）。`question-flow.md` は4者の往復を図で示す資料で、画面の行き先はそこで読まれる。

**「セッション uuid は URL に載せる。cookie では持たない」は contract.md に残す。** どの endpoint も id を URL で受け取るという、全 endpoint に共通する約束だからである。

**代案として退けたもの** — `docs/specs/structure/page-structure.md` へ移す形。あれは `pages/` と Page Component の対応の規約であり、どの uuid がどの画面に対応するかは持たない。

### 切り出し先のパス表記は docs の正へ揃える

contract.md は U 系を `/api/strokes/:id/...` で書いているが、`overview.md` と既存の `sessions/*.md` は `/api/sessions/:id/...` である。**切り出し先では `/api/sessions/` に揃える。**

理由 — 目録（`overview.md`）が名前空間の正であり、切り出し先のディレクトリ（`sessions/`）もそちらに従って決まる。`/api/strokes/` のまま `sessions/` へ置くと、資料の中でパスと置き場が食い違う。

**実装との差はこの change では埋めない。** 埋めるのは `fix-server-api-layout`（Gitea #17）で、docs が正である以上、差は実装側の未追随として残る。差が残ることを `docs/specs/plan/structure-migration.md` に書くかどうかは、tasks の中でユーザーへ諮る。

### 参照の付け替えは「個別の記述を指しているもの」だけ

`contract.md` を指す資料は多いが、大半は「共通の約束はここ」という参照で、切り出しの影響を受けない。付け替えるのは、切り出した個別 endpoint の記述を指しているものに限る（`core/schema.md` の `invocation` の説明、`architecture/question-flow.md` の番号の対応、`sessions/*.md` の相互参照）。

## Risks / Trade-offs

- **[並走する2本の change と衝突する]** `fix-server-api-layout` / `fix-session-api-layout` は docs を基準として読む → 触る対象が重ならない（docs だけ／実装だけ）。ただし**参照先の資料が増える**ため、切り出しの完了を両者へ知らせる。tasks の末尾に入れる
- **[移設で記述が失われる]** 100 行を11ファイルへ割ると、抜けが起きうる → 切り出しの後に、U1〜U12・A1〜A8・W1/W2 の**すべてが移設先に在ること**を1つずつ確かめるタスクを置く
- **[判定則が既存の判断と食い違う]** 軸の数で判定して、いまの endpoint のどれかが2つ目の軸を持っていると判明する可能性 → 見つかったら**直さずに記録し**、ユーザーへ諮る。この change は物差しを置くだけで、責務の切り直しは行わない（Non-Goals）

## Migration Plan

docs だけを動かすため、実装・データの移行は無い。巻き戻しは docs を戻すだけで済む。

## Open Questions

- **`docs/specs/plan/structure-migration.md` へ「パス表記の差」を書くか**（2026-09-10 に決めた。**書かない**）。
  あの資料が持つのは構造の規範（`docs/specs/structure/system-structure.md`）と現状の差であり、載っているのはいずれも
  「別 change で寄せる」ものである。API のパスの差は、既に `fix-server-api-layout`（親。Gitea #17）と
  `fix-session-api-layout`（子）が追っており、**同じ差を2箇所で管理することになる**。追う先は ticket と
  change に一本化し、docs には書かない。

  差そのものは消えていない。切り出した資料（`docs/specs/api/sessions/*.md`）が docs の正のパスで書かれており、
  実装との食い違いはそこを読めば分かる。
