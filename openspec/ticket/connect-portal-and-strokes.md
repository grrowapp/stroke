# connect-portal-and-strokes

ポータルとストロークの接合を入口・出口まとめて実装する。入口: 作成ボタンをただのボタンにして UModal でストローク3画面を最後まで（ADR-0009/0010、設計 `portal-stroke-entrance.md`）。出口: 置き場を SPEC_WORKFLOW_SHARED_ROOT に統一し、承認＝セッションディレクトリの rename 昇格、invokeAi 引数化・実行の記録と巡回リトライで steering を自動開始（ADR-0011、設計 `portal-stroke-exit.md`）。出口側の change `start-steering-after-approval` は 2026-08-25 にここへ再統合
