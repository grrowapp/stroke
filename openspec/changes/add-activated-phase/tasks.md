## 1. 着手の記録

- [x] 1.1 `openspec/tickets/add-activated-phase.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<作業ブランチ名>/<セッション ID>` を追記する。既に同じ物があれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）
- [x] 1.3 `fix-steering-empty-completion` が archive 済みかを `openspec list` で確かめる。未 archive なら、この change の archive をあちらの後にする旨をユーザーに伝える（design Risks「archive の順序」）

## 2. phase の値と `state.json` の形（design D1・D2）

- [x] 2.1 `shared/stroke.ts` に `PHASES` 定数を置き、`Phase` をそこから導く。`isPromotedPhase(phase)`（`approved | activated`）を純関数として置く。`Phase` の doc コメントの「決定4」の記述は残す
- [x] 2.2 `server/utils/stroke/session-store.ts` の `SessionState` の昇格後の分岐を `PromotedState`（`phase: 'approved' | 'activated'`）にまとめ、zod は同じフィールド定義を `approved` / `activated` の2つの literal 分岐で共有する。ファイル冒頭の「`phase` の値は増やさない」の一文を書き直す
- [x] 2.3 `test/server/utils/stroke/session-decision.test.ts` か新規 `session-state.test.ts` — `activated` の `state.json` が `readState` で読めること、`runId` が保たれること、`approved` の既定値（`invocation: 'idle'`）が `activated` でも効くこと

## 3. 完成の記録 U15（design D3）

- [x] 3.1 `server/utils/stroke/submission-path.ts` に `activatePath(id)`（`/api/sessions/:id/activate`）を足す
- [x] 3.2 `server/api/sessions/[id]/activate.post.ts` を置く。判定の順序は D3 の表のとおり: 404 → `readState` 失敗は 409 `phase` → `approved` 以外は 409 `phase`（未昇格／既に完成の2文言）→ 承認依頼なしは 409 `phase` → `writeState` で `activated` → `broadcastProjectCreation(name, 'done')`。busy を見ない。`invocation` に触れない
- [x] 3.3 承認依頼の有無は `.spec-workflow/approvals/` の直下と1段下の通常ファイルを数えるだけで決める（中身を読まない・本家 REST を呼ばない）。実装前に本家 2.2.7 の実物の `approvals/` に category 以外のファイルが置かれるかを確かめ、必要なら `.json` に限る（design Open Question）。結果を handler の doc コメントに残す
- [x] 3.4 `test/server/api/sessions/activate.post.test.ts` — spec `api/session/activate` の Scenario をすべて: 受理して `activated` になる／承認依頼なしは 409 で `approved` のまま／却下済みだけでも受理／未昇格は 409／既に完成は 409／存在しない id は 404／受理で `done` が配信される／`invocation` とディレクトリ名が変わらない

## 4. invokeAi から U15 を叩く（design D4）

- [x] 4.1 `server/utils/stroke/ai.ts` の `AiRun` に `recordCompletion?: () => Promise<boolean>` を足し、`runBuiltInvocation` の成功経路を「`didWork` false → `failed`／`recordCompletion` 無し → `idle`／在り → 呼んで true なら `idle`・false なら `failed`」にする。`invokeAi` の中に phase の判定を置かない
- [x] 4.2 `server/utils/stroke/invoke.ts` の `kick` を `kind` ではなく `phase` を受ける形に変え、`kind`・`runId`・`recordCompletion` の導出を `invoke.ts` の1箇所に集める。`recordCompletion` は `phase === 'approved'` の steering にだけ渡し、実体は `$fetch(activatePath(id), { method: 'POST' })` の 2xx を true、それ以外（409・404・不達）を false にする
- [x] 4.3 `server/api/strokes/[id]/invoke-agent.get.ts` から `=== 'approved'` の2箇所（`kind`・`runId`）を消し、`state.phase` を渡すだけにする。doc コメントの「承認済み（`approved`）でも受け付ける」を承認以降に直す
- [x] 4.4 `test/server/utils/stroke/ai.test.ts` — 作業ありで `recordCompletion` が true → `idle`・回数 0／false → `failed`／`recordCompletion` 無し → `idle`／`didWork` false のとき `recordCompletion` は呼ばれない
- [x] 4.5 `test/server/utils/stroke/invoke.test.ts` — `approved` の起動だけが `recordCompletion` を持ち、`activated` の steering とストロークは持たないこと。`activated` の起動が `kind: 'steering'` で `runId` を引き継ぐこと
- [x] 4.6 `test/server/api/strokes/invoke-agent.get.test.ts` — `activated` の対象への起動が受理され、steering の定型で走ること

## 5. 成功の決着を A8 から外す（design D7）

- [x] 5.1 `server/utils/stroke/session-store.ts` の `creationOutcomeOf` から `idle → 'done'` を外し、`approved` の `error → 'failed'` だけ残す。`writeInvocation` のコメント（「行の判定は `.spec-workflow/` の有無から導く」「`invocation` を合図の材料に使っても…」）を書き直す
- [x] 5.2 `server/api/strokes/[id]/submission.post.ts` の doc コメントから、成功の決着に関わる含みを外す
- [x] 5.3 `test/server/utils/stroke/creation-broadcast.test.ts` — `approved` で `idle` を書いても配信されない／`approved` で `error` は `failed` が配信される／`activated` では `error` でも配信されない

## 6. 生読みの整理と削除の2本（design D5・D6）

- [x] 6.1 `server/utils/stroke/session-core.ts` の `readPhase` の literal 連鎖を `PHASES` に含まれるかの判定に変える。読めない・外れた値は `unknown` のまま
- [x] 6.2 `server/utils/control/creating.ts` を `readState` で読む形に変え、`isPromotedPhase` で拾い、`{ name, path, phase }` を返す。読めないものは飛ばす
- [x] 6.3 `server/api/sessions/[id]/index.delete.ts`（U11）を `sessionExists` → `readState` の順にし、受理範囲を `stroking` / `proposed` の literal で持つ。`readState` の失敗は 409 `phase`「state.json を読めない」
- [x] 6.4 `server/api/projects/[projectId]/index.delete.ts`（P1）を同じ形にし、`stroking` / `proposed` は「まだプロジェクトになっていない」、`activated` は「中身のあるプロジェクトはここでは消せない」で断る。`hasSpecWorkflow` を消す
- [x] 6.5 `server/handler/phase.ts` と `test/server/handler/phase.test.ts` を消す。import が残っていないことを `grep` で確かめる
- [x] 6.6 `test/server/api/sessions/index.delete.test.ts`・`test/server/api/projects/index.delete.test.ts` — `activated` は U11 で 409／P1 で 409（本物）／`approved` で `.spec-workflow/` を持つものが P1 で消える／壊れた `state.json` はどちらも 409 で消えない／無いものは 404
- [x] 6.7 `test/server/utils/stroke/session-core.test.ts` — 一覧が `activated` を `activated` として返し、未知の値を `unknown` に倒すこと
- [x] 6.8 `test/server/utils/control/directory-creating.test.ts` — `listPromotedProjects` が `approved` と `activated` を phase 付きで返し、`stroking` / `proposed` と読めないものを飛ばすこと

## 7. 回答の門（design D10）

- [x] 7.1 `server/api/strokes/[id]/answer.post.ts` の `=== 'approved'` を `isPromotedPhase` に変える
- [x] 7.2 `test/server/api/strokes/` に回答のテストを足す（無ければ新規 `answer.post.test.ts`）— `activated` への回答が「承認済み」の 409 で断られ、「答えるべき問いが無い」に落ちないこと

## 8. 行の判定（design D8）

- [x] 8.1 `server/utils/control/directory.ts` で行の `creation` を昇格の記録の phase から引く。`approved` は走査で拾えても `in-progress`・`connection: 'disconnected'` 固定で、registry に載っていても `active` にしない。`activated` と外から置かれたものは `done` で接続の判定に掛ける。`pendingApprovals` と `lastModified` は生成中の行では `null` のまま
- [x] 8.2 `test/server/utils/control/directory.test.ts` — D8 の表の5行をすべて: 走査あり・記録なし／走査あり・`activated`／走査あり・`approved`（registry に載っていても `in-progress`・`disconnected`）／走査なし・`approved`／走査なし・`activated`。行の型と値の集合が変わっていないこと

## 9. 起動時の書き上げ（design D9）

- [x] 9.1 書き上げの手順を `server/utils/stroke/activate-approved.ts` に純関数として置く（一覧の取得と U15 の呼び出しを注入で受け、2xx／409／その他の件数を返す。`reap.ts` と同じ作り）
- [x] 9.2 `server/plugins/01.activate-approved.ts` を置く。U12 を取れなければ警告して何もしない。件数を1行でログに出す。他のプラグインとの順序の取り決めを持たない
- [x] 9.3 `test/server/utils/stroke/activate-approved.test.ts` — `approved` だけに U15 が叩かれる／409 は生成中のまま数える／1件の失敗で他の件が止まらない
- [x] 9.4 `yarn dev` で起動し、実物の保存先の `approved` で承認依頼を持つものが `activated` に書き上がり、持たないものが `approved` のまま残ることを確かめる。確認後は dev サーバーを止め、ポートの解放を確かめる

## 10. 上位資料への整合反映（proposal「上位資料への整合反映」）

- [x] 10.1 `docs/specs/api/overview.md` の目録に U15 を足し、`docs/specs/api/sessions/activate.md` を `promote.md` と同じ体裁で置く（入出力・振る舞い・エラーの表）
- [x] 10.2 `docs/specs/api/contract.md` — U2 / U12 の phase の値に `activated` を足す。A8 の説明に「成功の決着は流さない」を足す。204 の対象一覧に U15 を足す
- [x] 10.3 `docs/specs/api/sessions/invoke-agent.md` — 定型の選び分けを承認以降（`approved` / `activated`）に直す
- [x] 10.4 `docs/specs/api/ws/delivery.md` — `project-creation` の `done` の出どころを「完成の記録（U15）」に、`failed` の出どころを「実行の記録が `error` に達したとき」に直す
- [x] 10.5 `docs/specs/api/projects/delete.md` — 「`.spec-workflow/` を持つものは拒否する」を「`activated` は拒否する」へ。「生成中・失敗した行は本家に登録されておらず」を事実（接続時に載る。導出値は本家の id と同じ式）に直す
- [x] 10.6 `CONTEXT.md`「生成中」 — 「終わりは `.spec-workflow/` が出来たとき」を「終わりは完成の記録（steering が承認依頼を出したこと）」に直す。定義本体は変えない
- [x] 10.7 `docs/specs/plan/portal-stroke-exit.md` — 図の「`.spec-workflow/` ができる → 実行が終わったら done を配信」を U15 経由に直す。「完了とリトライ」節に完成の記録の段を足す
- [x] 10.8 巻き戻しの手順（`state.json` の `activated` を `approved` へ戻してからコードを戻す）を `docs/specs/api/sessions/activate.md` に書く（design Risks「巻き戻し」）
- [x] 10.9 `docs/specs/core/server-structure.md` に `server/api/sessions/[id]/activate.post.ts`・`server/plugins/01.activate-approved.ts`・`server/utils/stroke/activate-approved.ts` を足し、`server/handler/phase.ts` を消す

## 11. 検証

- [x] 11.1 `yarn typecheck`・`yarn lint`・`yarn test` が通る
- [x] 11.2 `grep -rn "'approved'" server shared app` の結果を見て、`activated` を落とす `=== 'approved'` が残っていないことを確かめる（U14 の「既に昇格している」判定は `isPromotedPhase` に揃える）
- [ ] 11.3 通し確認: proposal を承認 → 一覧で生成中 → 本家 MCP が接続して `.spec-workflow/` ができても生成中のまま・入場できない → steering が承認依頼を出して終わると `done` が届き、行が通常になる → 「レビューする」で承認依頼が見える。終わったら dev サーバーとプロセスを止める
- [ ] 11.4 通し確認（失敗側）: 承認依頼を出さずに終わる steering で `failed` になり巡回が拾うこと。上限に達して `error` で失敗のモーダルが出て、「破棄する」で `.spec-workflow/` を持つプロジェクトが消えること

## 12. レビュー

- [x] 12.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行する。指摘を直し、レビューが完全にパスするまで繰り返す

## 13. 完了

- [x] 13.1 change の成果物を commit する
- [ ] 13.2 ユーザーから完了承認を得て、`openspec/tickets/add-activated-phase.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
