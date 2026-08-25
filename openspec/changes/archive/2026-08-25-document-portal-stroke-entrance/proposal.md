# document-portal-stroke-entrance

## Why

入口の接合（作成ボタン→全面モーダルでストローク）は ADR-0009/0010 で方向が決まったが、実装に渡せる設計が1枚にまとまっていない。**この資料が設計であり、別の design 文書は作らない。** 資料はユーザーのレビュー（spec-workflow の approval）を通して確定させる。

## What Changes

- `docs/specs/plan/portal-stroke-entrance.md` を設計ドキュメントとして書き、承認を得る
- 記載する内容: 決定済みの挙動（常に押せる・全面モーダル・閉じる操作なし・リロードで途中の場面に戻る）／画面イメージ／エラーの出方／仕様（project-directory）の置き直し／実装の想定（手を入れる場所の表）／モーダルの実現方法
- レビューは spec-workflow の approval で行う。提出写しは `.spec-workflow/specs/portal-stroke-entrance/requirements.md`、本体はリポジトリ側

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし（ドキュメント作成のみ。振る舞いの変更は実装側の change `connect-portal-and-strokes` が specs 差分として持つ）。

## Impact

- `docs/specs/plan/portal-stroke-entrance.md` — 成果物（設計）
- `CLAUDE.md` — plan 索引への行追加（済）
- `docs/adr/0009` / `0010` — レビューで決まった改訂の反映先
- `openspec/changes/connect-portal-and-strokes/` — この設計を実装に落とす器。資料の承認が実装着手の前提
