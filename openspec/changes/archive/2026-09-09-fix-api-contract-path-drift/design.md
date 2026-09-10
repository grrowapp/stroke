## Context

動機は proposal.md（Why）。ここは**どの行をどう書き換えるか**と、**書き換えても壊れないと言える根拠**を確定させる。

現状と制約:

- 基準は `docs/specs/api/overview.md`（セッション系 11 本は `/api/sessions/…`、`ws/` の W1 / W2 は `/api/sessions/:id/ws/…`、`strokes/` の 5 本は `/api/strokes/:id/…`）と `docs/specs/api/server.md`（Endpoint はディレクトリ、Method は `index.<method>.ts`）。**どちらも書き換えない**
- `docs/specs/api/contract.md`「各 endpoint の入出力」は、番号のあとに path をコードスパンで置いた見出し 13 本で構成されている（U 系・A 系はメソッドを path の前に付け、W 系は path だけ）。うち 8 本（U1・U2・U3・U7・U9・U12・W1・W2）が旧い `/api/strokes/…` を名乗り、5 本（A1・A4・A5・A7・A8）は `overview.md` と同じ `/api/strokes/:id/…` である
- `contract.md` の中で `api/strokes` の文字列が出るのはこの 13 本の見出しだけで、本文には1つも無い。確認は `grep -rn "api/strokes" docs/specs/api`（下の「書き換えの範囲は見出し行だけである」）
- `contract.md`「セッションの参照方法」の表にある `/strokes/<uuid>`・`/strokes/<uuid>/proposal` は**画面のルート**であって endpoint ではない。`api/` が前に付かず、`overview.md` の目録にも載らない
- `openspec/specs/api/session/*` は既に `/api/sessions/…` で書かれている。この change の delta は無い（`.openspec.yaml` の `skip_specs: true`）
- 実際の URL の移設は親 change `fix-server-api-layout` の別の子（Gitea #17 `fix-session-api-namespace`）が行う。この change は**資料だけ**を動かす

## Goals / Non-Goals

**Goals:**

- `docs/specs/api/` の中で、同じ endpoint 番号が1つの path しか名乗らない状態にする
- 書き換え後の見出しの path が、`overview.md` の表の記述と1文字も違わないこと
- 「見出しだけを触った」ことを差分で読めるようにする。本文が動いていないことを、後から `git diff` で確かめられる

**Non-Goals:**

- 実装・URL・画面の変更。この change の差分に `.ts` / `.vue` は1つも現れない
- 基準（`overview.md`・`server.md`）の書き換え
- `docs/specs/api/` の外のページの追従。`architecture/` `structure/` `core/` `plan/` `mcp/` は範囲外で、必要なら親 change の他の子が扱う
- 番号の体系（U 系＝画面が叩く／A 系＝エージェントが叩く／W 系＝WS 配信）の見直し。番号はそのまま残す
- 旧 path の互換の記述を `contract.md` に残すこと。親 change の決め（proposal「BREAKING」）どおり互換は残さない

## Decisions

### 書き換えは 8 行。現状と追従後を1対1で確定させる

ユーザー承認済み（2026-09-09）。承認の対象はこの 8 行の見出しであり、これ以外の docs の書き換えはこの change では行わない。

見出しの形は `### <番号> <メソッドと path をコードスパンで囲んだもの>` で、変わるのはその path の部分だけである。

| 番号 | 現状 | 追従後 |
| --- | --- | --- |
| U1 | `POST /api/strokes` | `POST /api/sessions` |
| U2 | `GET /api/strokes/:id` | `GET /api/sessions/:id` |
| U3 | `GET /api/strokes/:id/strokes` | `GET /api/sessions/:id/strokes` |
| U7 | `POST /api/strokes/:id/answer` | `POST /api/sessions/:id/answer` |
| U9 | `POST /api/strokes/:id/send-back` | `POST /api/sessions/:id/send-back` |
| U12 | `GET /api/strokes` | `GET /api/sessions` |
| W1 | `/api/strokes/:id/ws/question` | `/api/sessions/:id/ws/question` |
| W2 | `/api/strokes/:id/ws/proposal` | `/api/sessions/:id/ws/proposal` |

追従後の path は、いずれも `overview.md` の「`sessions/` — 11本」「`ws/` — 3本」の表からそのまま採る。U3 の末尾が `/strokes` のまま残るのは、そこが名前空間ではなく**ストロークの集合というリソース名**だからで、`overview.md` も `GET /api/sessions/:id/strokes` と書いている。

- 代替: U3 を `/api/sessions/:id/history` のような別名にする → `overview.md` を書き換えることになる。基準は触らない。却下
- 代替: 8 行に加えて U10・U11・U13・U14・U15 の見出しも `contract.md` へ足して `overview.md` と本数を揃える → その 5 本はもともと `contract.md` の「各 endpoint の入出力」に無い（入出力は `sessions/*.md` の各ページが持つ）。本数を揃えるのは追従ではなく追加であり、承認の範囲外。却下

### A 系（A1・A4・A5・A7・A8）の見出しは据え置く

`overview.md` の「`strokes/` — 5本」が `/api/strokes/:id/…` のままなので、A 系は既に基準どおりである。ここを動かすと逆に食い違いを作る。

- A 系を叩くのはエージェント（`claude -p`）と MCP tools であり、親 change の proposal が「A 系の path は変わらない」と明記している
- 結果として、書き換えの後も `docs/specs/api/` に `api/strokes` は残る。**残ってよい**——完了条件（Gitea #10）が「残るのは `overview.md` の `strokes/` の表と A 系、`contract.md` の A 系だけ」と、残る側を名指ししている

### 書き換えの範囲は見出し行だけである

本文（入出力・エラー・約束・対称性）を触らない。根拠は、`contract.md` の本文が endpoint を**番号でしか呼んでいない**ことである。

- 「全体設計」の「例外は U1 だけ」「AI の起動は U13 が唯一の入口」「提出は1つの endpoint（A5）」はすべて番号での参照で、path を含まない
- 「対称性」の表の左列（`/overview` `/answer` `/send-back` `/question` `/proposal` `/submission`）は**リソース名**であって完全な path ではない。`/api/strokes/` も `/api/sessions/` も付いていないので、名前空間が変わっても正しいまま
- 「約束」の表は status の意味だけを持ち、endpoint の名前を意図的に並べていない（節にその旨が書いてある）
- したがって、見出しの path を差し替えても本文の指す先はずれない。**確かめ方**は `grep -rn "api/strokes" docs/specs/api` の残りを数えることで、書き換え後は `overview.md` に 6 行（`strokes/` の表の1行と A 系 5 行）、`contract.md` に 5 行（A 系）だけが残る
- 代替: 本文にも path を書き足して番号への依存を減らす → 資料の見出しと本文で path が二重管理になり、次の移設でまた両方を直すことになる（`contract-first` の「Duplicate Sources of Truth」）。却下

### 書き換えの手つきは1行ずつの置換にする。一括の文字列置換をしない

`sed` などで `api/strokes` → `api/sessions` を一括にかけると、据え置くべき A 系 5 行まで巻き込む。8 行それぞれを、番号を含む見出し行全体という一意な文字列で指定して差し替える。

- U1 の `POST /api/strokes` は U12 の `GET /api/strokes` と path が同じで、メソッドだけが違う。番号とメソッドを含めた見出し行ごと指定すれば一意になる
- 代替: 行番号で置換する → 先に置換した行が行数を変えないので動きはするが、あとで差分を読む人に「なぜその行なのか」が残らない。却下

## Risks / Trade-offs

- [一括置換で A 系まで巻き込む] → 「書き換えの手つきは1行ずつの置換にする」。加えて、書き換え後に `grep -rn "api/strokes" docs/specs/api` の残りが `overview.md` 6 行・`contract.md` 5 行であることを数えて確かめる（tasks の検証）
- [`contract.md` の見出しだけが先に `/api/sessions/` になり、実装はまだ `/api/strokes/` のまま。読んだ人が実装と資料の食い違いに戸惑う] → docs は規範の正で、実装がそこへ寄る側である（`docs/agents/issue-tracker.md`「各層の性質」）。食い違いは #17 `fix-session-api-namespace` が畳む。この change で「実装は未追従」という注記を `contract.md` に足すことはしない——注記は #17 の完了後に消す作業を生むうえ、規範の資料に工程の事情を持ち込むことになる
- [`docs/specs/api/` の外に旧 path を書いたページが残る] → この change の範囲外（proposal「触らないもの」）。親 change の他の子が issue ごとに扱う。ここで手を伸ばすと担当範囲が重なる
- [見出しのアンカーが変わり、他ページからの相対リンクが切れる] → `contract.md` の見出しへアンカー付きで張っているページが無いことを、書き換えの前に `grep -rn "contract.md#" docs` で確かめる。あればその時点で親へ報告する（範囲外のページを直すことになるため）

## Migration Plan

1. `docs/specs/api/contract.md` の見出し 8 本を、上の表の「追従後」へ1行ずつ差し替える
2. `grep -rn "api/strokes" docs/specs/api` で残りを数え、`overview.md` 6 行・`contract.md` 5 行（A 系）であることを確かめる
3. `git diff` で、変わった行が 8 行だけ（すべて `### ` で始まる）であることを確かめる
4. `openspec validate --all --store stroke` を通す

巻き戻し: 1 ファイル 8 行だけの変更で、単独でリバートできる。リバートすると `overview.md` との食い違いが元に戻るだけで、実装は最初から動いていない。

## Open Questions

なし。書き換えの 8 行はユーザー承認済み（2026-09-09）で、範囲外の提案も持ち越していない。
