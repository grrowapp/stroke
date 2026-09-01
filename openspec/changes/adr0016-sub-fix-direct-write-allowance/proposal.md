## Why

**症状**: `--allowedTools` の `Write` / `Edit` が、MCP ツールを通さずに文書を直接書く経路を成立させている。要否を確かめずに残っている。

`nuxt.config.ts` のコメントは「`Write` は proposal を `docs/proposal.md` に書くのに要る」と説明するが、**proposal を書くのは受理した A7 である**（`server/utils/stroke/session-store.ts` が唯一の書き手）。コメントの根拠は成立していない。

**起票時に書いた「実測でも、直近3実行のいずれも `Write` / `Edit` を1度も使っていない」は取り下げる**（specs 作成時 2026-09-01）。根拠にしたデバッグログは削除済みで再現できない。むしろ逆の実物が残っている——`/opt/projects/5d34fd6b-…/proposal.md`（3250 B）と `/opt/projects/31b55ff6-…/proposal-setai.md`（4213 B、いずれも 2026-08-30）はエージェントが `Write` で書いた下書きで、サーバーが書いた `docs/proposal.md` と末尾改行だけ違う同内容である。**`Write` は使われていた。** ただしこの2本は `get-guide`（`4a6f10d`、2026-08-31。「ファイルを直接読み書きしない」を明記）が入る**前**の実行なので、現構成での要否の証拠にはならない。

**`Write` が入った本当の理由も別にある。** コミット `1ce89cfc`（2026-08-26「fix: allowedTools に Write を戻して artifact の新規作成を通す」）で、要求元はワークフロー定義が `generates` に持つ `stroke.md` / `proposal.md` の新規作成である。`docs/proposal.md` ではない。その要求は schema.yaml にいまも残っている。

つまり「コメントが事実と違う」ことと「だから要らない」は**別の話**で、後者はまだ確かめられていない。

`docs/specs/api/mcp-tools.md` は「操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない」と定めている。steering 工程では、この2つがその規定を迂回する経路になる。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。ADR-0016 の委譲に「後続」として1本足す。

## What Changes

- 変更: `Write` / `Edit` の要否を実測で確かめる（`claude.debugLogDir` を一時的に設定して1周させ、`tool_use` を道具名で数える）。要らないなら許可から外し、要るなら**何に要るか**を根拠付きでコメントに書き直す
- 変更: 手順（schema.yaml の `generates`）が求める書き出しを残したまま道具だけを外さない。順序を規定として置く。schema.yaml 自体は `adr0016-sub-switch-workflow-to-mcp-tools` の担当なので触らない
- 変更: 外す場合、外したあとに1周通ることを実機で確かめる

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent/invocation`: 許可する道具が、MCP ツールを通さない書き込みの経路を作らないことを規定に加える

## Impact

- `nuxt.config.ts` — `allowedTools` の値とコメント
- `docs/specs/core/settings-reference.md` — 起動フラグの記述（ADR-0004 の手続きに従う）
- MCP ツールの契約は変えない
