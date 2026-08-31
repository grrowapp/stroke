---
status: ready-for-agent
tags:
  - bug
change: update-project-list-view
---

# update-project-list-view

プロジェクト一覧の**状態チップの質感**と**未接続の行の薄め方**が、承認済みの `ui.md` の確定値どおりに実装されていない。

## 事実

実測 2026-08-30。`show-pending-project-in-list` の当時の prototype（単体プレビュー・ペラ1 HTML）をセッションの scratchpad から回収して起動し、実物（`/projects`）と並べて突き合わせた。

**チップの質感が丸ごと落ちている。**

```
ui.md   面は3段グラデーション ＋ 上辺の照り返し ＋ 下辺の落ち込み ＋ 文字を #fff と混ぜる
実装    background: var(--surface-sunken) の単色。box-shadow 無し
```

アクティブはさらに差が大きい。

```
ui.md   文字を 55% で #fff と混ぜる ／ text-shadow: 0 0 6px（60%）
        ／ 外へのにじみ 0 0 7px（45%）と 0 0 15px（22%）の2枚
実装    color: var(--status-success) そのまま。text-shadow も外へのにじみも無し
```

**未接続の行の薄め方が違う。**

```
prototype  .row-off td:nth-child(1) > *, td:nth-child(3) > * { opacity: .45 }
           ← 状態列「以外」を薄める。「行ごと opacity は掛けない」と明記されている
実装       .sb-row-off { opacity: .45 }   ← 行ごと薄めている
```

このためチップまで一緒に沈む。**チップの質感より先にこちらを直す必要がある。**

## 一致していたもの

行の地・ローダー・回転・明滅・チップ幅は `ui.md` どおり実装されている。落ちているのは上の2点だけ。

## 対象外

- **失敗の行** — 失敗は行として残さず決着モーダルで受けると決まっている（`show-pending-project-in-list` の 8.9）。機能として出番が無い
- **PID の併記** — 利用者に出す意味がないため不採用

どちらも当時の prototype には残っていたが、change に持ち込む際に削除した。

## 前提

- prototype は `openspec/changes/update-project-list-view/prototype/index.html` に置いた。ペラ1・外部依存なし。静的サーバで開けば当時の見え方をそのまま確認でき、ツマミで詰め直せる
- git には一度も入っていなかった。`show-pending-project-in-list` の tasks 11.3 が「止める」とだけ書いて消さなかったため、セッションの scratchpad に残っていた
- 触るのは `app/assets/css/main.css` の3宣言（`.sb-chip` / `.sb-chip-on` / `.sb-row-off`）だけ。DOM もクラス名も変えない
