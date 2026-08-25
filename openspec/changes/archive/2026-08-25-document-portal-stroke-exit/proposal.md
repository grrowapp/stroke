# document-portal-stroke-exit

## Why

出口の接合（承認 → steering 作成工程の自動開始）は ADR-0011 で方向が決まったが、実装に渡せる設計が1枚にまとまっていない。**この資料が設計であり、別の design 文書は作らない。** 資料はユーザーのレビュー（spec-workflow の approval）を通して確定させる。入口側の `document-portal-stroke-entrance` と対を成す。

## What Changes

- `docs/specs/plan/portal-stroke-exit.md` を設計ドキュメントとして書き、承認を得る
- 記載する内容: 決定済みの挙動（承認で proposal.md を生成したら、ユーザー操作を挟まず別 claude を `--mcp-config`（本家 spec-workflow MCP）付きで起動し steering 作成へ進める）／モーダルの終わり方（入口側設計との接合部）／ADR-0011 の未決3点（新工程の進捗・失敗をどこで見るか、MCP config の中身と置き場、steering 作成の完了判定）の決着／実装の想定（手を入れる場所の表）
- レビューは spec-workflow の approval で行う。提出写しは `.spec-workflow/specs/portal-stroke-exit/requirements.md`、本体はリポジトリ側

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし（ドキュメント作成のみ。振る舞いの変更は実装側の change `connect-portal-and-strokes` が specs 差分として持つ）。

## Impact

- `docs/specs/plan/portal-stroke-exit.md` — 成果物（設計）
- `CLAUDE.md` — plan 索引への行追加（資料の起草時に行う）
- `docs/adr/0011` — レビューで決まった改訂の反映先
- `openspec/changes/connect-portal-and-strokes/` — この設計を実装に落とす器（出口側 change `start-steering-after-approval` は 2026-08-25 に再統合）。資料の承認が実装着手の前提
- `docs/specs/plan/portal-stroke-entrance.md` — 入口側の設計。モーダルの終わり方をこの資料と合わせて決める（相互参照）
