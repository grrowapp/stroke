## ADDED Requirements

### Requirement: WS の route は接続の準備と後始末だけを持つ

WS を受ける route（`server/routes/**/ws/*.ts`）は、接続に固有の準備と後始末だけを持たなければならない（SHALL）。持ってよいのは次の 4 つである（SHALL）。

1. 接続の URL からの対象の解決（`sessionIdFromUrl`）と、対象が在るかの確認（`sessionExists`）・在らなければ閉じること（`peer.close`）
2. 接続の登録と解除（`register` / `unregister`）
3. 接続した瞬間に流してよい局面（`phase`）の literal
4. handler が返した現在分を接続へ送ること（`JSON.stringify` + `peer.send`）

接続時に流す現在分の読み出し（`readState`・保存された本文の読み出し）と、流すメッセージの組み立てを、route の中に直接書いてはならない（MUST NOT）。それらは `server/handler/` の handler が持ち、route は許す局面の集合を渡してそれを呼ぶ（SHALL）。route は現在分を自分で複製して持ってはならない（MUST NOT）——正は保存先にある。

**受理の瞬間の配信と、接続の瞬間の配信は、同じ形を 2 度書かない。** 同じチャネルへ流すメッセージの組み立ては 1 箇所に置き、受理する側（endpoint の handler）と接続時に流す側の両方がそこを通らなければならない（SHALL）。

#### Scenario: 走査で判定する

- **WHEN** `server/routes/` 配下の WS の route を読み、`readState` や保存された本文の読み出しが直接現れるかを見る
- **THEN** 1 つでも現れる route は本要件に反しており、その読み出しを `server/handler/` へ切り出す対象として名指しされる。1 つも現れなければ、その範囲は本要件の到達点にある

#### Scenario: 接続した瞬間に現在分を流す

- **WHEN** 画面が W1 / W2 へ繋ぎ、その時点の現在分を受け取る（`docs/specs/api/ws/delivery.md`「接続した瞬間に現在分を流す」）
- **THEN** 現在分の読み出しは handler が行い、route は `register` の後にそれを 1 件送るだけになる。流すものが無ければ何も送らない

#### Scenario: 流してよい局面は route が持つ

- **WHEN** 局面によっては接続時に何も流さない（proposal がまだ出ていない局面など）
- **THEN** 流してよい局面は route が自分の literal で持ち、集合として handler へ渡す。handler は当てはまるかだけを見て、当てはまらなければ流すものが無いことを返す。handler は自分の literal で局面を増やしも減らしもしない

#### Scenario: 受理時の配信と接続時の配信が同じメッセージを作る

- **WHEN** endpoint が受理の瞬間に流すメッセージと、route が接続の瞬間に流すメッセージが同じ型である
- **THEN** その組み立ては 1 つの handler にあり、両方がそこを通る。endpoint 側と route 側に同じ形の組み立てを 2 つ持たない
