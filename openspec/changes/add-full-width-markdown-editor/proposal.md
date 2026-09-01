## Why

仕様書・ステアリングの文書は表や長い行を含む Markdown で、編集時には横幅がそのまま作業のしやすさに効く。現状の編集画面は、ビューポートからサイドバー 256px（畳んでも 64px の帯が残る）と余白を引いた幅までしか使えず、それ以上に広げる手段が無い。編集の間だけ画面をめいっぱい使える口を用意する。

## What Changes

- 文書の編集画面（共通の編集 UI）に**全幅トグル**を追加する。ON にするとサイドバーを隠してビューポート全幅で編集でき、OFF で元のレイアウトに戻る。
- 編集 UI は仕様書・承認・ステアリングの3画面で共通のため、3画面すべてに同時に効かせる。画面ごとの分岐は作らない。
- ヘッダー（上層へ戻る導線・プロジェクト表示）は隠さない。隠すのは左のナビゲーションだけ。
- ストローク側の proposal 確認画面は別実装（編集ではなく指摘を付ける注釈 UI）であり、本 change の対象外。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `document-editing`: 「編集中に全幅表示へ切り替えられる」要件を追加する。編集できる6本の文書すべてで、どの画面（仕様書・承認・ステアリング）から開いても同じように切り替えられること。

## Impact

- `modules/markdown/runtime/edit/MarkdownEditor.vue` — トグルの UI（`expanded` prop と `update:expanded` emit）。状態は持たない
- `app/layouts/workspace.vue` — サイドバーの表示制御（トグル ON の間だけ隠す）
- `app/pages/projects/[projectId]/specs/[specName]/[document].vue` / `steering/[name].vue` / `approvals/[approvalId].vue` — 3画面が同じ形で共有状態を `MarkdownEditor` へ配線する
- CSS は足さない。`main` は `min-w-0 flex-1`、`.sb-textarea`（`modules/markdown/runtime/assets/markdown.css`）は `width: 100%` なので、サイドバーが消えれば追従する
- `project/ui` の要件（下層のナビゲーションは画面左の縦並び／上層へ戻る導線はヘッダー左）は**変えない**。ナビゲーションの形は変わらず、トグル ON の間だけ一時的に隠れる。ヘッダーと今いるプロジェクトの表示は全幅中も残る。
