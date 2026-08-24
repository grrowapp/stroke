# restructure-docs-specs — Tasks

## Implementation Tasks

### 1. 配置

- [x] 1.1 `docs/specs/{core,api,architecture,reference,plan}/` を作成し、15本を design の区分どおり `git mv` で移動する

### 2. 参照の張り替え（archive は触らない）

- [x] 2.1 `docs/` 内の相互参照と `docs/adr/` 3本のリンク文字列を新パスへ張り替える（adr のファイルは動かさない）
- [x] 2.2 `CLAUDE.md` の docs 一覧を新配置に追随させる（未掲載だった5本の扱いもここで揃える）
- [x] 2.3 `README.md` / `nuxt.config.ts` / `openspec/config.yaml` / `openspec/specs/architecture-docs/` / `server/utils/stroke/` のコメント3件を張り替える
- [x] 2.4 現役 change 8ファイル（document-settings-reference / align-settings-conventions / unify-agent-conventions / align-coding-conventions / adopt-upstream-design-tokens）を張り替える
- [x] 2.5 全15ファイル名で repo を再走査し、旧パスの参照が `openspec/changes/archive/` 以外に残っていないことを確認する

### 3. steering の structure 書き換え

- [x] 3.1 `GET /api/projects/:projectId/steering/structure` で現行の全文を取得する（ファイル直読みしない）
- [x] 3.2 structure の docs 配下の記述（ツリーの docs/ 部分と Documentation Standards）だけを `docs/specs/` の5要素構成に追随させ、`PUT /api/projects/:projectId/steering/structure` で更新する
- [x] 3.3 dashboard 側で内容が更新されたことを確認する

### 4. 仕上げ

- [x] 4.1 成果物一式を commit する
