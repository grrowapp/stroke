## Why

承認された proposal が置き場所を持たないままでは、後続の spec-workflow がプロジェクトルートとして受け取れない。承認を引き金に、トップディレクトリの作成と proposal の配置、既存名との衝突確認を確定させる。

## What Changes

- 承認を引き金にした `/opt/projects/<name>/` の生成と衝突確認を追加する。

## Capabilities

### New Capabilities

- `project-generation`: この change で新設する。

## Impact

`server/utils/project.ts` `conflict.ts`、`server/api/sessions/[id]/approve.post.ts`。
