# 未解消の事項

**まだ change に起こしていないもの**だけを置く。change を作ったらここから消す（実体は `openspec/changes/<change-id>/` に移る）。作業単位の管理は `docs/agents/issue-tracker.md` のとおり OpenSpec の change が担う。

---

## store `stroke-sessions` の root が別のワークツリーを指している

登録されている root は `/home/vagrant/work/stroke-board/opsx/workflow`。実行時に読まれる定義はそちらで、このリポジトリの `workflow/` は git 追跡されているだけの複製になっている。「定義を複製しない」という決定に反した状態。

張り替えるなら次の2手。マシン全体のレジストリを書き換えるので、実行前に確認すること。

```
openspec store unregister stroke-sessions
openspec store register workflow --id stroke-sessions --yes
```

## セッションのクリーンアップ手段が無い

作られたセッションは2箇所に残り、消す endpoint も script も無い。

- `/var/lib/stroke-board/sessions/<uuid>/`
- `workflow/openspec/changes/<uuid>/`

検証のたびに溜まる。change に起こす予定。

## 絶対パス・ハードコードが runtimeConfig の外にある

`server/utils/paths.ts`:

```ts
export const SESSIONS_ROOT = '/var/lib/stroke-board/sessions'
export const PROJECTS_ROOT = '/opt/projects'
```

環境ごとに差し替えられない。change に起こす予定。

`nuxt.config.ts` の `addDir` は `import.meta.dirname` からの導出に変更済みで、この件からは外れている。

---

**着手の順序**: 「絶対パスの runtimeConfig 化」→「セッションのクリーンアップ」。後者が使う `paths` の形が前者で確定するため。両者は `paths.ts` と `nuxt.config.ts` で衝突するので、並列に進めない。
