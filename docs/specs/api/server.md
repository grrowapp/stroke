# Server API

## Purpose

`server/api/` における API Endpoint と HTTP Method の定義規則を定める。

API Endpoint はディレクトリで表現し、その Endpoint に対する HTTP Method の handler は `index.<method>.ts` として定義する。

## Structure

基本構造は以下とする。

```text id="m8l5qa"
server/
└── api/
    └── <endpoint>/
        └── index.<method>.ts
```

例えば、`/api/foo` に対する GET と POST は以下のように定義する。

```text id="q3d6py"
server/
└── api/
    └── foo/
        ├── index.get.ts
        └── index.post.ts
```

それぞれ以下の Endpoint / Method に対応する。

```text id="v9m3kd"
GET  /api/foo → server/api/foo/index.get.ts
POST /api/foo → server/api/foo/index.post.ts
```

## Rules

* API Endpoint は `server/api/` 配下のディレクトリで表現する。
* Endpoint の root handler は `index.<method>.ts` とする。
* `<method>` には HTTP Method を小文字で指定する。
* 同一 Endpoint に複数の HTTP Method が存在する場合、Method ごとに handler を定義する。
* API handler の実装は、それぞれ対応する `index.<method>.ts` に記述する。
* HTTP Method を handler のファイル名から識別できる構造を維持する。

## Nested Endpoints

Endpoint を階層化する場合は、ディレクトリ構造によって API namespace を表現する。

```text id="x2j6sm"
server/
└── api/
    └── foo/
        ├── index.get.ts
        ├── index.post.ts
        └── bar/
            └── index.get.ts
```

この構造は以下に対応する。

```text id="2p8f6w"
GET  /api/foo     → server/api/foo/index.get.ts
POST /api/foo     → server/api/foo/index.post.ts
GET  /api/foo/bar → server/api/foo/bar/index.get.ts
```

## Dynamic Endpoints

動的な Endpoint は Nuxt のファイルベースルーティングに従い、ディレクトリ名に `[param]` を使用する。

```text id="r4q1zs"
server/
└── api/
    └── project/
        └── [id]/
            ├── index.get.ts
            └── index.delete.ts
```

この構造は以下に対応する。

```text id="j7c5nm"
GET    /api/project/:id → server/api/project/[id]/index.get.ts
DELETE /api/project/:id → server/api/project/[id]/index.delete.ts
```

## Design Principle

`server/api/` では、以下の対応関係を基本とする。

```text id="6w4n2a"
Directory
    ↓
API Endpoint

index.<method>.ts
    ↓
HTTP Method Handler
```

API の URL Structure と HTTP Method の組み合わせをファイルシステム上で直接識別できる構造とする。

