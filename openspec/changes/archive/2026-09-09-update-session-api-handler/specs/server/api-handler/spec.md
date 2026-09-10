## Purpose

`server/api/` の handler ファイルが「REST コール受付のインターフェース」に留まっているかを、参照元を辿らずに機械的に判定できるようにする。api が持ってよいもの（入力の読み取りと検証・設定の解決・局面の述語・結果の HTTP 化）と、`server/handler/` が持つもの（保存先への書き込み・改名・占有・配信・本家 REST の呼び出し・複数段の後始末）を分ける物差しであり、実処理の共有の仕方（`docs/specs/api/projects/delete.md`「実装の共有」）の側の正は規範が持つ。

`server/api/` のファイルは Nitro の用語で handler と呼ばれる。この capability では、そちらを **api の handler ファイル**、`server/handler/` に置く実処理を **handler** と書き分ける。

## ADDED Requirements

### Requirement: api の handler ファイルは準備と後始末だけを持つ

`server/api/` の handler ファイルは、HTTP 固有の準備と後始末だけを持たなければならない（SHALL）。持ってよいのは次の 5 つである（SHALL）。

1. 入力の読み取りと検証（`getRouterParam` / `requireSessionId` / `readBody` + `parseBody` / `getQuery`）
2. 設定の解決（`readStrokeConfig`。設定を引くのは端だけである——`docs/specs/core/settings-reference.md`）
3. 対象の状態を 1 度読むこと（`readState`）と、それに対する局面の述語
4. 受理の可否を決める前提の確認（`isRunning` による busy の判定・`missingPrerequisites`）
5. 結果を HTTP へ写すこと（status・`createError`・`conflict`・`Response`）

保存先への書き込み、ディレクトリの改名、上層への配信、本家 REST の呼び出し、実行の占有、複数段にわたる後始末を、api の handler ファイルの中に直接書いてはならない（MUST NOT）。それらは `server/handler/` の handler が持ち、api はそれを呼ぶ（SHALL）。

api の handler ファイルの中に、実処理を行う名前付き関数を定義してはならない（MUST NOT）。

#### Scenario: 走査で判定する

- **WHEN** `server/api/` 配下のファイルを読み、`writeState` / `rename` / `broadcast*` / 本家 REST（`upstreamFetch` などの本家への呼び出し）の呼び出しが直接現れるかを見る
- **THEN** 1 つでも現れるファイルは本要件に反しており、その処理を `server/handler/` へ切り出す対象として名指しされる。1 つも現れなければ、その範囲は本要件の到達点にある

#### Scenario: endpoint が保存先を書き換える

- **WHEN** endpoint が受理した内容を `state.json` へ書く
- **THEN** 書き込みは `server/handler/` の handler が行い、api の handler ファイルは入力を読んでその handler を呼び、返す status を決めるだけになる

#### Scenario: 既に薄い endpoint

- **WHEN** endpoint が「id を解決する → 既存の 1 関数を呼ぶ → 結果を返す」だけで成り立っている
- **THEN** その endpoint は既に本要件を満たしており、handler を新しく作る対象にはならない

#### Scenario: 本要件を満たさない endpoint が残っている

- **WHEN** `server/api/` の一部の範囲がまだ切り出されていない
- **THEN** それは本要件を無効にしない。残っているものはすべて切り出す対象であり、差があること自体をこの spec の欠陥として扱ってはならない（MUST NOT）

### Requirement: 局面の述語は api が持ち handler は持たない

どの局面（`phase`）のものを受理するかの判定は、その endpoint が自分の literal で持たなければならない（SHALL）。`server/handler/` の handler は局面の述語を持ってはならない（MUST NOT）。

handler に呼び出し元を知らせて分岐させてはならない（MUST NOT）。判定を handler へ渡す必要があるとき（読みと書きを 1 つの区間に閉じる場合など）は、許す局面の集合を引数として渡し、handler はそれを当てはめるだけとする（SHALL）。handler は結果を返し、それを 409 などの応答へ写すのは api である（SHALL）。

**書ける形かの確認は局面の述語に当たらない。** 保存された状態が phase を判別子に持つ形（`SessionState`）であるとき、handler が書き込みの前にその判別子を確かめることは本要件に反しない。物差しは「**受理する局面をどちらが決めているか**」であり、決めているのが呼び出し元の渡した集合であれば、handler の中に判別子の確認が現れてよい。

正は `docs/specs/api/projects/delete.md`「実装の共有」と `docs/specs/api/sessions/delete.md` であり、食い違ったら規範が勝つ（SHALL）。

#### Scenario: 2 つの endpoint が同じ実行を共有する

- **WHEN** セッションの削除とプロジェクトの削除が同じ「消す実行」を呼ぶ
- **THEN** 消してよい局面はそれぞれの endpoint が literal で持ち、共通の実行は phase を見ない。呼び出し元を伝える引数も持たない

#### Scenario: 判定を含む区間を handler が閉じる

- **WHEN** 「読む → 判定 → 書く」を 1 つの区間として直列化する必要がある
- **THEN** api は許す局面の集合を引数で渡し、handler はその集合に当てはまるかだけを見て結果を返す。当てはまらなかったときにどの status とどの文言で返すかは api が決める

#### Scenario: handler が書き込みの前に状態の形を確かめる

- **WHEN** handler が、渡された集合に当てはまった状態へ書き込む前に、その状態が書ける形（phase を判別子とする形）であることを確かめる
- **THEN** その確認は本要件に反しない。受理する局面を決めているのは呼び出し元が渡した集合であり、handler は自分の literal で受理する局面を増やしも減らしもしない

### Requirement: 同じ実処理を 2 箇所に書かない

同じ実処理を 2 つ以上の場所に書いてはならない（MUST NOT）。endpoint と CLI（`yarn session`）と検証の道具が同じことをするときは、同じ handler を呼ばなければならない（SHALL）。

実処理に `Core` / `Service` のような層を表す接尾辞を付けて handler と別の名前で置いてはならない（MUST NOT）。共通化した実処理の呼び名は handler に統一する（SHALL）。

api 側の後始末（エラーを HTTP へ写す関数など）も、2 つ以上の endpoint が同じものを使うなら 1 箇所に置かなければならない（SHALL）。

#### Scenario: CLI と endpoint が同じことをする

- **WHEN** `yarn session delete` と `DELETE /api/sessions/:id` が同じ対象を消す
- **THEN** 消す実行は 1 つの handler にあり、両方がそれを呼ぶ。CLI 用の写しを別に持たない

#### Scenario: 同じ後始末が 2 つの endpoint にある

- **WHEN** 2 つの endpoint が同じ形でエラーを HTTP へ写している
- **THEN** その写しは 1 箇所に出され、両方がそこを呼ぶ

#### Scenario: 実処理に別の名前を付ける

- **WHEN** endpoint と CLI が共有する実処理を `<name>Core` として `server/utils/` に置く
- **THEN** その置き方は本要件に反しており、`server/handler/` へ移して `Core` の名を落とす対象になる
