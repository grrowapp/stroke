## Why

**症状**: proposal が提出されても画面2 に出ず、承認もできない。

実測（画面から通した結果）: `phase` は `proposed` に進み画面2 へ遷移するのに、本文は「まだ proposal はありません」のまま。承認ボタン自体が描画されず、承認に到達できない。

原因は**受理した本文がどこにも残らない**こと。A7（`POST /api/strokes/:id/proposal`）は本文を受け取ると W2 へ配信して phase を進めるだけで、ファイルを書かない。一方、画面2 の接続時配信（`readProposal`）と承認（U10）はどちらも `docs/proposal.md` を読む。

そのファイルを書くのは AI である、というのが現在の規定（`project/generation`）だが、**AI に渡す指示のどこにもその規定が載っていない**（`assets/.claude/skills/` 全体を grep して `docs/proposal.md` は 0 件）。実際 AI はセッション直下に任意の名前で書く（実測: `proposal-todo-cli.md`）。

結果、壊れ方が2段になる。

1. 提出の瞬間に繋いでいた画面にしか proposal は届かない。リロード・画面遷移の後は二度と出ない
2. `docs/proposal.md` が無いので承認は 409 で止まる

受け取った本文を残す責任が誰にも無いことが根本である。

## What Changes

- 変更: A7 が受理した proposal を**残す**。受理が成立したら、その後に繋ぎ直しても・承認の時点でも、同じ proposal が得られる。再提出では最新の1件だけが残る
- 変更: 残せなかった場合は受理を失敗として返す。**受理したのに残っていない状態を作らない**
- 削除: `project/generation` から「proposal を書くのは AI である」「システムのコードは proposal のファイルを作ってはならない（MUST NOT）し、上書きしてはならない（MUST NOT）」を削る。誰が書いたかは外から観測できず、要件として成立しない

この change のスコープは API（A7）とその規定に限る。AI 側の指示（`assets/.claude/skills/`）は変えない。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `api/stroke/proposal`: 受理の成立条件に「残ること」を加える。受理した proposal は、以後に接続し直しても・承認の時点でも同じものが得られる。残せなければ受理しない
- `project/generation`: 「proposal はセッションの時点から docs 配下にある」から、書き手を名指しする条項を削る。**在り処（`docs/proposal.md`）・昇格がそれを動かさないこと・承認の処理がそれに触れないことは変えない**。観測できる振る舞いは一切変わらず、観測できない規定だけが減る

## Impact

- `server/api/strokes/[id]/proposal.post.ts` — 受理した本文を残す
- `server/utils/stroke/session-store.ts` — `readProposal` と対になる書き手の追加
- 依存追加なし。API の入出力・画面・AI 側の指示は変わらない（proposal が出るようになるだけ）
