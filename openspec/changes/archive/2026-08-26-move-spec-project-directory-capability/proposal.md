# move-spec-project-directory-capability

## Why

`connect-portal-and-strokes` と `replace-handrolled-with-libraries` の archive で、プロジェクトに関わる capability が `project/` 名前空間へ移った。`project/generation`（承認 → 昇格の手続き）と `project/ui`（下層4画面）である。`project-directory`（プロジェクト一覧）だけが旧名のまま残り、同じ領域の capability が2つの命名で並んでいる。

## What Changes

- `project-directory` を `project/directory` へ移す（**BREAKING**: capability のパスが変わる）
- requirement の内容は変えない。8件をそのまま移す

## Capabilities

### New Capabilities

- `project/directory`: `project-directory` を `project/` 名前空間へ立て直したもの。プロジェクト一覧の母集合・アクティブ判定・4列・並び順・選択可否・入場・永続化しないこと・作成と登録の入口

### Modified Capabilities

- `project-directory`: 全要件を `project/directory` へ移して廃止する（**BREAKING**）

## Impact

- `openspec/specs/project-directory/` → `openspec/specs/project/directory/`
- `docs/specs/core/file-component.md` に `specs/project-workspace` を指す記述が1件あり、こちらは `replace-handrolled-with-libraries` の archive で既に切れている。同じ箇所を直すついでに揃える
- コードへの影響なし。capability のパスは spec の置き場であり、実装は参照しない
