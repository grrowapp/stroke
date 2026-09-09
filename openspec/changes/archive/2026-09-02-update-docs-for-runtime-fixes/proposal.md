## Why

7本の change が実装と実機検証で事実を確定させたが、**それを規定している上位資料（`docs/`）が古いまま残っている**。

各 change の design はいずれも整合反映を「提案」として書き、ADR-0004 の手続き（起票 → ユーザー承認 → 資料編集 → コード追随）に従って**ユーザー承認のゲートで止めてある**。7本ぶんのゲートが同じ資料群を指しているので、1本に集約する。

集約する理由は2つある。

- **同じファイルを7本が別々に触ると、後から入れた方が前の変更を踏む。** `contract.md` には3本、`session-workflow.md` には2本が提案している
- **ユーザーは資料単位で判断したい。** change 単位に散らすと、同じファイルへの提案を何度も見ることになる

反映しないと何が起きるかは具体的である。たとえば `contract.md` は U10 が 409 busy を返すことを書いていないが、実装は返す。読んだ人は「承認は必ず通る」と設計して壊れる。`settings-reference.md` は `--allowedTools` に `Write` / `Edit` が載ったままだが、実際は外れている——**設定の正**（ADR-0004）がここなので、食い違ったままにはできない。

反映の一覧（6ファイル・16件）と、同時に見つかった既存の誤り4件は ticket `openspec/tickets/update-docs-for-runtime-fixes.md` に表で載せた。

## What Changes

- 変更: 7本の change が確定させた事実を `docs/` の6ファイルへ反映する（一覧は ticket）
- 変更: 反映し終えた項目を、提案元の change の tasks から消し込む。**7本の「整合反映」の章はこの change へ委ねる**
- 変更: ADR-0016 の状態行から、docs へ落ちた sub を外す。4本すべてが落ちたら ADR を `archive` にする

**同時に見つかった既存の誤り4件（ticket の D1〜D4）はこの change では直さない。** 由来が違う（この change 群が作った差分ではない）ので、混ぜると「何が原因で資料がずれたのか」が記録から読めなくなる。別に起票するかどうかはユーザーが決める。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。**資料の記述を実装に合わせるだけで、規定そのものを変えない。** 規定を変える判断は各 change の specs が既に持っている。

## Impact

- `docs/specs/api/contract.md`（5件）
- `docs/specs/architecture/session-workflow.md`（4件）
- `docs/specs/core/settings-reference.md`（3件）
- `docs/specs/api/mcp-tools.md`（2件）
- `docs/specs/reference/upstream-observations.md`（1件）
- `docs/adr/0016-delegate-provide-operations-via-mcp.md`（1件）
- 提案元7本の `tasks.md`（整合反映の章の消し込み）
- **コードは変えない。** 資料が実装に追いつくだけである
