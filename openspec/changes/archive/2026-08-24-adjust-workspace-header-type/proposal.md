## Why

下層シェルのヘッダー（`app/layouts/workspace.vue` の `<header class="sb-bar">`）は、prototype 案A と寸法が完全に一致している（下の Findings）。つまり「prototype とのずれを直す」動機は無い。

残る問題は、prototype の見えそのものにある。「← ポータルへ戻る」13px とプロジェクト名 14px の差が 1px しかなく、今どのプロジェクトにいるかがヘッダーの中で立たない。ヘッダーを大きく取り、主題を戻る導線より一段大きくして階層を作る。**prototype から意図的に外れる**変更である。

## Findings（実測）

prototype（`openspec/changes/archive/2026-08-20-steering-dashboard-portal/prototype/navigation.prototype.html`）を実ブラウザで開いて computed 値を読んだ結果:

| 対象 | prototype 実測 | 変更前の実装 |
|---|---|---|
| `html` | 16px | 16px |
| `body` | **14px** | 14px |
| `.bar` | 14px | 14px |
| bar の主題（プロジェクト名） | **14px** | 14px |
| `.navitem`（戻る導線） | 13px | 13px |
| `.chipOn`（状態チップ） | 11px | 11px |

prototype が読み込む本家 CSS バンドル（`prototype/assets/spec-workflow.css`）が `body` に 14px を効かせている。「prototype は寸法を書いていないからブラウザ既定の 16px で出ていた」という当初の読みは誤りだった。

## What Changes

- 下層ヘッダーの「← ポータルへ戻る」を **16px** にする（13px から）
- 下層ヘッダーのプロジェクト名を **20px** にする（14px から）
- 両者に 4px の差を残し、主題が戻る導線より大きい関係を作る
- 状態チップ（11px）と接続 dot は変えない
- 文字サイズは `app/assets/css/main.css` の様式側に置き、画面側の Tailwind クラスで散らさない
- 決めた値と「主題の方が大きい」関係を E2E（`e2e/design-token.spec.ts`）で固定する

値は 24px / 22px を実機で見たうえで一段下げて決めた（2026-08-22 ユーザー確認）。

非目標:

- 上層（`app/layouts/portal.vue`）のヘッダー。今回の依頼は下層のみ
- 下層の各画面の見出し（`.sb-panel-title` / `.sb-panel-subtitle`）
- 型スケールのトークン（`--text-xs` 〜 `--text-xl`）
- ヘッダーのアイコン寸法（戻る 16px / フォルダ 14px）。文字だけが大きくなるため釣り合いは変わるが、指示の範囲外

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。ヘッダーが「今いるプロジェクトを示す」という要件（`project-workspace`）は変わらず、変わるのはその見せ方だけ。仕様レベルの振る舞いが変わらないため `.openspec.yaml` に `skip_specs: true` を置く。

## Impact

- `app/assets/css/main.css` — `.sb-bar-back` / `.sb-bar-title` を追加
- `app/layouts/workspace.vue` — 上記クラスを当てる
- `e2e/design-token.spec.ts` — 値と大小関係を固定するテストを追加

## Decided

- 対象は**シェル上部のバー**（`workspace.vue` の `<header class="sb-bar">`）。パネル見出し（`.sb-panel-title`）ではない（2026-08-21 ユーザー確認）
- prototype から外れてでもヘッダー内に階層を作る。値は戻る導線 16px / 主題 20px（2026-08-24 実機で確認）
