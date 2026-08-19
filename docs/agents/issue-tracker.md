# Issue tracker: OpenSpec

作業単位は OpenSpec の **change** で管理する。実体は `openspec/changes/<change-id>/` 配下のファイル。

CLI は `openspec`（v1.9.0）。スキーマは `openspec/schemas/custom/schema.yaml`（`openspec/config.yaml` の `schema: custom`）。

## 構成

```
openspec/
├── config.yaml              スキーマ指定とプロジェクト context
├── schemas/custom/          artifact の定義とテンプレート
├── specs/                   確定済みの capability spec
└── changes/
    ├── <change-id>/         進行中の change
    │   ├── proposal.md
    │   ├── specs/<capability-path>/spec.md
    │   ├── design.md
    │   └── tasks.md
    └── archive/             完了した change
```

## artifact の順序

`proposal → specs → design → tasks` の順に作る。依存関係はスキーマの `requires` が持つ。

- **proposal** — なぜこの変更が要るか。`Why` / `What Changes` / `Capabilities` / `Impact`
- **specs** — 何を満たすか。capability ごとに1ファイル
- **design** — どう作るか。横断的な変更や新しい依存がある場合のみ
- **tasks** — 実装チェックリスト。`- [ ] X.Y` 形式でないと進捗が追跡されない

## スキルが「issue tracker に publish しろ」と言ったとき

新しい change を起こす。`/opsx:new` または `/opsx:propose`。

## スキルが「該当チケットを取ってこい」と言ったとき

`openspec/changes/<change-id>/` 配下の該当 artifact を読む。ユーザーは通常 change-id を直接渡す。

## 進捗と検証

- 進捗は `tasks.md` のチェックボックスで追う。
- `openspec validate --all` で change と spec を検証する。capability を1つも宣言しない change は、その change の `.openspec.yaml` に `skip_specs: true` が無いと弾かれる。

## この repo での前提

artifact を書く前に読むもの。`openspec/config.yaml` の `context` にも同じ指示が入っている。

- `.scratch/stroke-board-frontier/decisions.md` — 確定済みの決定事項
- `CONTEXT.md` — ドメイン用語集
- `docs/adr/` — 後から変えにくい決定

## `.scratch/` の扱い

`.scratch/stroke-board-frontier/` は grilling セッションの成果物置き場であり、issue tracker ではない。change の入力として読むだけで、ここに新しいチケットを作らない。
