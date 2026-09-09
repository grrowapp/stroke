## Purpose

`server/api/` に置かれる handler のファイル配置が、API Endpoint と HTTP Method の組み合わせをファイルシステム上で直接読み取れる形になっているかを、参照元を辿らずに機械的に判定できるようにする。判定の正は規範（`docs/specs/api/server.md`）であり、食い違ったら規範が勝つ。

## ADDED Requirements

### Requirement: Endpoint はディレクトリで表し root handler を `index.<method>.ts` に置く

`server/api/` 配下の API Endpoint は、ディレクトリで表現しなければならない（SHALL）。その Endpoint に対する HTTP Method の handler は、そのディレクトリ直下の `index.<method>.ts` として置かなければならない（SHALL）。`<method>` は HTTP Method を小文字で書く（SHALL）。

Endpoint 名をファイル名に持つ `<name>.<method>.ts` の形で handler を置いてはならない（MUST NOT）。この形は Nuxt のファイルベースルーティングでは同じ URL に解決されるが、Endpoint がディレクトリで表れないため、本要件に反する。

**置き方の正は `docs/specs/api/server.md`「Rules」であり、食い違った場合は規範が優先される（SHALL）。** この要件は規範を機械的に判定できる形に言い直したもので、規範の側が変わったらこの要件を書き換える。

**本要件を満たさない handler が現に残っていることは、本要件を無効にしない。** 残っているものはすべて移す対象であり、差があること自体をこの spec の欠陥として扱ってはならない（MUST NOT）。

#### Scenario: 到達点に達しているかを走査で判定する

- **WHEN** `server/api/` 配下の handler ファイルを列挙する
- **THEN** ファイル名が `index.<method>.ts` でないものが 1 つでもあれば、そのファイルが到達点に達していない対象として名指しされる。1 つも無ければ `server/api/` は本要件の到達点にある

#### Scenario: Endpoint 名をファイル名に持つ handler がある

- **WHEN** `server/api/foo.get.ts` のように Endpoint 名をファイル名に持つ handler が置かれている
- **THEN** その配置は本要件に反しており、`server/api/foo/index.get.ts` へ移す対象になる

#### Scenario: 新しい Endpoint を足す

- **WHEN** `server/api/` に新しい Endpoint を足す
- **THEN** その Endpoint 名のディレクトリが作られ、handler はその直下の `index.<method>.ts` に置かれる

### Requirement: 同一 Endpoint の複数 Method は Method ごとの handler にする

1 つの Endpoint が複数の HTTP Method を持つ場合、Method ごとに別の handler ファイルを定義しなければならない（SHALL）。1 つのファイルの中で Method を分岐して複数の Method を扱ってはならない（MUST NOT）。

HTTP Method は handler のファイル名から識別できなければならない（SHALL）。

#### Scenario: 1 つの Endpoint に GET と POST がある

- **WHEN** 1 つの Endpoint が GET と POST の両方を受ける
- **THEN** そのディレクトリには `index.get.ts` と `index.post.ts` が別々に置かれ、どちらのファイルもファイル名だけで扱う Method が読み取れる

#### Scenario: 既存の Endpoint に Method を足す

- **WHEN** 既に `index.get.ts` を持つ Endpoint に PUT を足す
- **THEN** 同じディレクトリに `index.put.ts` が足され、`index.get.ts` の中で Method の分岐は増えない

### Requirement: 動的な Endpoint は `[param]/index.<method>.ts` に置く

URL の一部を引数として受ける動的な Endpoint は、ディレクトリ名を `[param]` の形にし、その直下の `index.<method>.ts` に handler を置かなければならない（SHALL）。`[param].<method>.ts` の形で置いてはならない（MUST NOT）。

引数を持つ階層が入れ子になる場合も同じで、階層ごとに `[param]` のディレクトリを作る（SHALL）。

#### Scenario: 引数を 1 つ受ける Endpoint

- **WHEN** `/api/foo/:id` を受ける handler を置く
- **THEN** そのファイルは `server/api/foo/[id]/index.get.ts` であり、`server/api/foo/[id].get.ts` ではない

#### Scenario: 引数を持つ階層の下に固定名の Endpoint がある

- **WHEN** `/api/foo/:id/bar` を受ける handler を置く
- **THEN** そのファイルは `server/api/foo/[id]/bar/index.get.ts` であり、`server/api/foo/[id]/bar.get.ts` ではない

#### Scenario: 引数を持つ階層が入れ子になる

- **WHEN** `/api/foo/:id/bar/:name` を受ける handler を置く
- **THEN** そのファイルは `server/api/foo/[id]/bar/[name]/index.get.ts` であり、階層ごとに `[param]` のディレクトリが作られる

### Requirement: 置き方を変えても Endpoint の見え方は変わらない

handler をこの置き方へ移すとき、その Endpoint が応答する URL を変えてはならない（MUST NOT）。入出力・挙動も変えてはならない（MUST NOT）。旧 path の handler を互換のために残してはならない（MUST NOT）。

置き方は `server/api/` の中だけの話であり、呼び手（画面・エージェント・本家）から見える契約ではない。

単体テストの置き場は本要件の対象外である。写し元の構造に従う規定は `docs/specs/structure/system-structure.md` が持つ。

#### Scenario: handler を移す

- **WHEN** `<name>.<method>.ts` の形の handler を `<name>/index.<method>.ts` へ移す
- **THEN** その Endpoint は移動の前後で同じ URL・同じ Method・同じ入出力で応答し、呼び手のコードは 1 行も変わらない

#### Scenario: 移した後に旧 path を残そうとする

- **WHEN** 移動の後も旧 path の handler を互換のために置いたままにする
- **THEN** その配置は本要件に反しており、同じ URL に 2 つの handler が並ぶ状態は解消の対象になる
