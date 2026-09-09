# document-directory-structure — Tasks

## Implementation Tasks

### 1. 最終 structure の作成

- [ ] 1.1 統合後の実態からディレクトリ構造（ディレクトリのみのツリー）を抽出する
- [ ] 1.2 `structure.md` と `structure-design.md` をマージし、ディレクトリ構造＋ストローク側の規則＋ポータル側の層の3部構成で最終の `docs/specs/core/structure.md` を作る（微調整は整形・重複除去まで）
- [ ] 1.3 `structure-design.md` を `git rm` で廃止する

### 2. 参照の張り替え（archive と restructure-docs-specs は触らない）

- [ ] 2.1 `openspec/specs/architecture-docs/spec.md` の名指し7箇所を `docs/specs/core/structure.md` へ変更する（1ファイル規定は維持）
- [ ] 2.2 `CLAUDE.md` の Docs 索引をマージ後の1本に追随させる
- [ ] 2.3 `docs/specs/` 内の相互参照4本（spec-screen-flow / artifact-extension-plan / file-composables / file-component）を張り替える
- [ ] 2.4 `structure-design.md` で再走査し、現役の参照が残っていないことを確認する

### 3. steering の連動更新

- [ ] 3.1 `GET /api/projects/:projectId/steering/structure` で現行の全文を取得する（ファイル直読みしない）
- [ ] 3.2 Directory Organization のツリーを最終 structure と一致させ、ファイル配置の表から `structure-design.md` の行を消して `PUT` で更新する（ディレクトリ構造とファイル配置は分けたまま・表形式を維持）
- [ ] 3.3 approvals で承認依頼を出し、dashboard の承認を確認する

### 4. 仕上げ

- [ ] 4.1 成果物一式を commit する
