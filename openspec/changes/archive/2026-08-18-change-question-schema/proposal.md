## Why

問い1つの表示が実測で 1926 字に達し、決定を下す前に読む量が多すぎる。原因は長さそのものではなく構造で、`background` / `detail` / `rationale` がそれぞれ無制限の散文ブロックとして複数の役割を抱え込める形になっている。既存の上限（`label` 200字 / `detail` 4000字 / `background` 20000字 / 選択肢20件）は実測値（`label` 中央22字・最大48字、選択肢3〜4件）から一度も触れておらず、歯止めとして機能していない。

## What Changes

問いの構造を、AskUserQuestion（話題タグ＋問い＋短い選択肢）の形に寄せる。

- **BREAKING** 現 `question`（問い本文）を `header` に改名し、上限 **12字** の話題タグにする。
- **BREAKING** 現 `background` を `detail`（画面表示は「詳細説明」）に改名し、上限を 20000字 → **300字** にする。
- **BREAKING** `question` を新設する。上限 **20字** で、画面では詳細説明の下に置く。
- **BREAKING** 選択肢の `detail` を `description` に改名し、上限を 4000字 → **50字** にする。
- **BREAKING** 選択肢から `rationale`（推奨の根拠）を削除する。推奨の印（`recommended`）は残す。
- 選択肢の件数上限を 20件 → **5件** にする。
- `label` は AskUserQuestion に合わせ、応答形式の規定に「1〜5語」と明記する。文字数による機械検証は追加しない（AskUserQuestion がハード上限を持たず文言だけで縛っているのに合わせる）。
- 自由入力欄は据え置き。

画面の並びは 話題タグ → 詳細説明 → 問い → 選択肢 → 自由入力 とする。

新しい上限は AI の応答だけでなく、保存済み `strokes.json` / `state.json` の読み直しにも一律に適用する。

- **既存セッションへの影響**: 実測で既存4セッションはすべて新上限を超えており（旧 `background` 最大919字、旧 `detail` 最大321字）、これらは開けなくなる。進行中の1件を含む。移行は行わない。承知のうえでの決定。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `ai-invocation`: AI に求める応答の構造からキー構成と長さの規定が変わり、「推奨の根拠」が外れる。
- `stroke-session`: 画面に提示する項目と並びが変わり、選択肢の件数と各項目の長さが制限される。
- `proposal-review`: 差し戻し後の問い返しもストロークと同じ構造を使うため、同じ変更が及ぶ。

## Impact

- `shared/types.ts`: `Question` / `QuestionOption` のキー構成。
- `server/utils/question.ts`: zod スキーマのキー名・上限値と、「根拠の無い推奨は推奨として扱わない」不変条件の見直し。
- `server/utils/prompt.ts`: `RESPONSE_FORMAT` の JSON 例と項目の規定文言（`label` の「1〜5語」を含む）。
- `app/components/stroke/QuestionCard.vue`: 話題タグの追加、詳細説明と問いの並べ替え、根拠ブロックの削除。
- `app/components/review/FollowupModal.vue`: 同じ問いの構造を描くため追随。
- `app/components/StrokeBreadcrumb.vue`: 粒を開いたときの表示（推奨バッジは残る）。
- 既存の `/var/lib/stroke-board/sessions/` 配下のセッションは開けなくなる。
