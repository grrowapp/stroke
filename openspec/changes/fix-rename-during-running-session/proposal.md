## Why

**症状**: 承認を押した時点で flontier の claude がまだ走っていると、その claude 以後のツール呼び出しが全部 `session_not_found` になり、`invocation` はどこにも残らない。

busy ガード（`server/utils/stroke/running.ts`）は起票時、sessionId をキーにした `Set` だった。改名を行う受け口は自分で `beginRun` を取らず、改名後に起こす steering はプロジェクト名をキーに取る。つまり**同じ物理ディレクトリに対し、2つの claude が別々のキーで同時に走れた**。`rename(2)` は inode を保つので、旧 claude の cwd は改名先へ追随して生き続けるが、文脈は `{sessionId: uuid}` のままなので代行先が引けない。

**改名を行う受け口は U14（`POST /api/sessions/:id/promote`）である。** 起票した 2026-08-31 の時点では承認（U10）が判断の記録から改名・起動までを一度に行っていたが、その後 develop で承認が3段（U10 判断の記録 / U14 昇格 / U13 起動）に分割され、改名は U14 へ移った。

### 起票後に分かったこと（2026-09-08）

1. **サーバ側は既に直っている。** `c086907e`（2026-09-01）でキーを作業場所ディレクトリの実体（`stat` の `dev`/`ino`）へ変え、改名する段が `beginRun` で枠を占有する形にした。占有は3段分割で U14 へ移っている。テストも入っている（`test/server/utils/stroke/running.test.ts`、`test/server/api/strokes/promote.post.test.ts`）
2. **docs は既に規定している。** `docs/specs/api/sessions/promote.md`「実行中は受理しない」と `docs/specs/api/contract.md`「約束」（409 `busy` = 待てば通る）。**`openspec/specs/` だけが追従していない**——`api/session/promote` に busy の規定が無く、`api/session/invoke-agent` に判定の単位（物理ディレクトリ）が無い
3. **画面が 409 busy を握りつぶしている。** `app/composables/useProposalReview.ts` の `promote()` は 409 のうち `name-conflict` しか分岐せず、`busy` は汎用の「プロジェクトを作れませんでした」に落ちる。契約が定める次の手「待てば通る」がユーザーに届かない。断る側を直しても伝える側を直していないので、**「実 UI に避ける仕掛けが無い」という起票時の症状はユーザーから見て変わっていない**。これは ADR 0021（応答の握りつぶしは違反）に当たる
4. **`beginRun` の文言が改名の場面に合わない。** 「完了するまで新しい**起動**は受け付けない」は起動を断る文言で、昇格を断ったときにそのまま出すと誤解を生む
5. **占有の解放位置の根拠が呼び出し順と合わない。** `promote.post.ts` と `docs/specs/api/sessions/promote.md`「占有は改名と `phase` の書き込みが終わった直後に解く」は「解放を後にすると自分の占有で U13 が 409 になる」を理由にする。しかし U13 を叩くのは 204 を見た画面で、204 は A8 への引き渡しの後に返る。解放を後ろへ置いても 409 にはならない。解放を早めた結果、枠が空きで `invocation` が `idle` の窓が生じている（今はその窓で叩く者が居ないので実害は無い）
6. **artifact が消えている。** `ea943b7e` で design.md・tasks.md・旧 specs delta（`api/session/approve` 宛て）が削除され、`running.test.ts` が「design.md D2」を参照したまま宙に浮いている

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、範囲外の扱いは不正だった（ユーザー指摘 2026-09-01）ので change を立てた。

## What Changes

- 規定: `api/session/promote` に、対象で実行中の呼び出しがある間は改名しないこと（409 busy・何も変えない）を、docs の規定を写す形で入れる
- 規定: `api/session/invoke-agent` に、多重起動を防ぐ「同一対象」の単位が要求に使われた id ではなく作業場所の物理ディレクトリであることを入れる。実行中を見る他の口（U11・P1・U14）も同じ単位で判定する
- 変更: 承認画面が昇格の 409 busy を「AI が走っている。終わるのを待ってやり直す」として示す。汎用の失敗に落とさない（ADR 0021）
- 変更: `beginRun` が投げる 409 の文言を、起動と改名のどちらを断った場合にも合う形にする（または断る側が文言を持つ）
- 見直し: 占有の解放位置。上の 5 を踏まえ、解放を A8 への引き渡しの後ろへ置くか、今の位置に別の根拠を与えるかを design で決め、docs の promote 資料の根拠の文を直す
- 作り直し: design.md（`running.test.ts` が参照する D2 の宛先）と tasks.md

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `api/session/promote`: 昇格が走行中の実行と競合しないことを規定に加える
- `api/session/invoke-agent`: 多重起動を防ぐ単位が作業場所の物理ディレクトリであることを規定に加える
- `stroke/frontier`: 承認画面が昇格の 409 busy を「待てば通る」として示すことを規定に加える（「承認の成功で画面2を離れてプロジェクト一覧へ戻る」の隣）

## Impact

- `app/composables/useProposalReview.ts` — `promote()` の 409 `busy` 分岐（変更）
- `server/utils/stroke/running.ts` — `beginRun` の 409 文言（変更）
- `server/api/strokes/[id]/promote.post.ts` — 占有の解放位置（design の決定次第。現状維持なら docblock の根拠だけを直す）
- `docs/specs/api/sessions/promote.md` — 「占有は…直後に解く」の根拠の文（design で提案し、承認後に直す）
- `docs/adr/0021-no-one-swallows-a-response.md` — この change で起票した ADR
- `server/utils/stroke/running.ts` の docblock — 「承認（U10）はここを通す」が古い（U14）。tasks で直す
- 画面の契約（endpoint・引数）と MCP ツールの契約は変えない
