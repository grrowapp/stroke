---
status: Doing
origin: user
date: 2026-09-09
change: update-api-contract
tags:
  - proposal
  - specs
  - design
  - tasks
  - pre2/4f092b9f-635f-480b-922e-0f648f0319e0
---

# update-api-contract

**`docs/specs/api/contract.md` の更新**（ユーザー指示 2026-09-09）。動かすのはこの1ファイルと、そこから記述を受ける先だけで、新しい規範の資料は作らない。

1. **足す** — endpoint の責務範囲の判定則を節として書く
2. **抜く** — 全 endpoint に共通しない記述（各 endpoint の入出力、画面のルート表）を切り出し、api 全般の指標だけの資料に戻す

## 起票時の状態

- 「これはこの endpoint の責務ではない」という個別の判断は在る（U15 は完成したかを判定しない＝ADR-0014、A8 は値の意味づけを持たない、U13 はプロセスの終了を待たない）が、**何をもって責務の外と判定したのかの規定が無い**
- 規定が無いため、責務範囲が点として読まれうる。「軸そのもの以外は責務外」と読むと、受理の前の検証も後の記録・配信も責務外になり、endpoint が軸を成立させられなくなる
- `docs/specs/api/contract.md` は 183 行のうち全 endpoint に共通するのが3節だけで、残りは各 endpoint の入出力（U1・U2・U3・U7・U9・U12、A1・A4・A5・A7・A8、W1・W2）と画面のルート表である。1本1ファイルの規定（`api/overview.md`）は在り、`sessions/` の5本は既にその形になっている
- contract.md は U 系を `/api/strokes/` で書いており、`api/overview.md`・`api/sessions/*.md` の `/api/sessions/` と食い違っている

## 畳む方向

1. contract.md へ「責務範囲」の節を足す。責務は原則1つの軸／責務範囲は軸を起点に前後へ幅を持つ／点で捉えた責務外判定は誤用／責務外の判定は軸の数で行う
2. 各 endpoint の入出力を `api/sessions/`（6件新設）・`api/strokes/`（ディレクトリごと新設、5件）・`api/ws/delivery.md`（W1・W2 を吸収）へ切り出す。ファイル名は openspec の capability path に揃える
3. 画面とルートの対応表を `architecture/question-flow.md` へ移す（移し先は design.md で確定）
4. 切り出し先の資料はパスを docs の正（`/api/sessions/`）に揃える。実装には触らない
5. contract.md に残すのは全体設計・責務範囲・約束（status の意味）・対称性と、セッション uuid を URL に載せる約束

## ユーザーの指示

> contract.md 内が全体共通以外の余計な項が増えているので、今回のよう api 全般指標だけに集約し、それ以外の記述は一旦切出すまでをやれ。責務範囲は contract.md で ok

## 並走への影響

`fix-server-api-layout`（親）と `fix-session-api-layout`（子）は docs を正として実装を直す側で、基準の `api/overview.md`・`api/server.md` には触れない方針である。この change は contract.md の記述の置き場を変えるため、参照先の資料が増える。切り出しの完了を両者へ知らせる。

対応する change: `update-api-contract`
