# fold-stroke-css

app/assets/css/stroke.css（セッション画面だけに効くスタイル）を、design token の統合とあわせて畳む。
アプリ全体のスタイルは main.css の1本に保ち、1つのアプリの中で見た目が割れないようにする。

触るファイル:
- 削除 app/assets/css/stroke.css
- 更新 app/assets/css/main.css（残す規定を token として取り込む）
- 更新 nuxt.config.ts（css 配列から stroke.css を外す）
- 更新 stroke.css に依存していたコンポーネントのクラス
- 更新 docs/specs/plan/structure-migration.md（該当行を消す）

前提: openspec/changes/adopt-upstream-design-tokens（token の採用が先）。
