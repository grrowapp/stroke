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
- [x] 3.2 `server/api/sessions/[id]/activate.post.ts` を置く。判定の順序は D3 の表のとおり: 404 → `readState` 失敗は 409 `phase` → `approved` 以外は 409 `phase`（未昇格／既に完成の2文言）→ `writeState` で `activated` → `broadcastProjectCreation(name, 'done')`。busy を見ない。`invocation` に触れない（**14.1 で「承認依頼なしは 409」を外した**）
- [x] 3.3 ~~承認依頼の有無を数える~~ → **14.1 で撤回。** U15 は完成の判定を持たず、ファイルシステムも本家 REST も読まない（ADR-0014・design D3）
- [x] 3.4 `test/server/api/sessions/activate.post.test.ts` — spec `api/session/activate` の Scenario をすべて: 受理して `activated` になる／成果物の有無を見ない（`.spec-workflow/` が無い `approved` でも受理）／未昇格は 409／既に完成は 409／存在しない id は 404／受理で `done` が配信される／`invocation` とディレクトリ名が変わらない

## 4. invokeAi から U15 を叩く（design D4）

- [x] 4.1 `server/utils/stroke/ai.ts` の `AiRun` に `recordCompletion?: () => Promise<boolean>` を足し、`runBuiltInvocation` の成功経路を「`didWork` false → `failed`（`recordCompletion` を呼ばない）／`didWork` true かつ `recordCompletion` 無し → `idle`／`didWork` true かつ在り → 呼んで true なら `idle`・false なら `failed`」にする。**`didWork` を先に見る**（完成の判定はこれ。14.2）。`invokeAi` の中に phase の判定を置かない
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

- [x] 9.1 書き上げの手順を `server/utils/stroke/activate-approved.ts` に純関数として置く（一覧の取得と U15 の呼び出しを注入で受け、2xx／409／その他の件数を返す。`reap.ts` と同じ作り）。対象は **`approved` かつ `invocation: 'idle'`** で選ぶ（14.3）
- [x] 9.2 `server/plugins/01.activate-approved.ts` を置く。U12 を取れなければ警告して何もしない。件数を1行でログに出す。他のプラグインとの順序の取り決めを持たない
- [x] 9.3 `test/server/utils/stroke/activate-approved.test.ts` — **`approved` かつ `invocation: 'idle'`** だけに U15 が叩かれる（`failed` / `error` / `running` と `activated` は叩かれない。14.3）／409 は生成中のまま数える／1件の失敗で他の件が止まらない
- [x] 9.4 `yarn dev` で起動し、実物の保存先の `approved` で実行の記録が `idle` のものが `activated` に書き上がり、`failed` / `error` / `running` のものが `approved` のまま残ることを確かめる。確認後は dev サーバーを止め、ポートの解放を確かめる
  - **一度 `[x]` にしたが 2026-09-04 に戻した。** 実機で確かめたのは 14.3 で対象条件を「`approved` かつ `idle`」に絞る**前**の版（当時は `approved` を全部叩いていた）で、上の本文はもう当時の確認を指していない。新しい条件の確認は 11.3 に含める
  - **2026-09-06 に新しい条件で確かめ直した。** `yarn dev`（ポート 3100）。**実物の `/opt/projects` は使っていない**——`NUXT_PROJECT_SHARE_ROOT` を検証用の一時ディレクトリへ向け、手で置いた `approved` 4件（`invocation` が `idle` / `failed` / `error` / `running`。`chk-error` にだけ `.spec-workflow/steering/` を持たせた）で見た。巡回が実物の claude を起こさないよう、この回だけ `NUXT_CLAUDE_COMMAND=/bin/true` に差し替えている（書き上げは claude を通らないので、対象の選び方の判定には関わらない）。起動時のログは `起動時の書き上げ: activated にした 1 件・生成中のまま 0 件・記録できなかった 0 件`。

    | 対象 | 起動前 | 起動後 | 見たもの |
    | --- | --- | --- | --- |
    | chk-idle | `approved` / `idle` | **`activated` / `idle`** | 書き上げの対象。`GET /api/projects` の行も `creation: 'done'` に変わった |
    | chk-failed | `approved` / `failed` | `approved` / `failed`（`retries` 0→1） | 対象外。phase は動かない。動いたのは巡回が起こし直した分の `retries` だけ |
    | chk-error | `approved` / `error` | `approved` / `error` | 対象外。触られない |
    | chk-running | `approved` / `running` | `approved` / **`failed`**（`retries` 1） | 対象外。`01.reap-running.ts` が `failed` へ倒した（ログ `起動時の後始末: 止めた 0 件・failed にした 1 件・error にした 0 件`）。phase は `approved` のまま |

    `GET /api/projects` は `chk-idle` だけ `creation: 'done'`、他の3件は `creation: 'in-progress'` / `connection: 'disconnected'`（D8 の表のとおり。`.spec-workflow/` を持たない `chk-idle` が `done` で並ぶのは Risks「成果物ゼロの legacy を畳む」の型）。確認後に dev を止め、`ss -tlnp` で 3100 の解放を確かめた

## 10. 上位資料への整合反映（proposal「上位資料への整合反映」）

- [x] 10.1 `docs/specs/api/overview.md` の目録に U15 を足し、`docs/specs/api/sessions/activate.md` を `promote.md` と同じ体裁で置く（入出力・振る舞い・エラーの表）
- [x] 10.2 `docs/specs/api/contract.md` — U2 / U12 の phase の値に `activated` を足す。A8 の説明に「成功の決着は流さない」を足す。204 の対象一覧に U15 を足す
- [x] 10.3 `docs/specs/api/sessions/invoke-agent.md` — 定型の選び分けを承認以降（`approved` / `activated`）に直す
- [x] 10.4 `docs/specs/api/ws/delivery.md` — `project-creation` の `done` の出どころを「完成の記録（U15）」に、`failed` の出どころを「実行の記録が `error` に達したとき」に直す
- [x] 10.5 `docs/specs/api/projects/delete.md` — 「`.spec-workflow/` を持つものは拒否する」を「`activated` は拒否する」へ。「生成中・失敗した行は本家に登録されておらず」を事実（接続時に載る。導出値は本家の id と同じ式）に直す
- [x] 10.6 `CONTEXT.md`「生成中」 — 「終わりは `.spec-workflow/` が出来たとき」を「終わりは完成の記録（steering が文書を出し終えたこと）」に直す。定義本体は変えない（**14.7 で文言を「文書を出し終えた」に改めた**）
- [x] 10.7 `docs/specs/plan/portal-stroke-exit.md` — 図の「`.spec-workflow/` ができる → 実行が終わったら done を配信」を U15 経由に直す。「完了とリトライ」節に完成の記録の段を足す
- [x] 10.8 巻き戻しの手順（`state.json` の `activated` を `approved` へ戻してからコードを戻す）を `docs/specs/api/sessions/activate.md` に書く（design Risks「巻き戻し」）
- [x] 10.9 `docs/specs/core/server-structure.md` に `server/utils/stroke/activate-approved.ts` を足し、`server/handler/phase.ts` を消す（**起票時は endpoint と plugin も足すと書いていたが、同ファイルは `server/utils/` の棚卸しで endpoint も plugin も載せていない**。`system-structure.md` は `server/plugins/` をディレクトリとしてのみ持つ。載せ先が無いので足していない）

## 11. 検証

- [x] 11.1 `yarn typecheck`・`yarn test` が通る（`yarn lint` は `package.json` に無い。起票時の想定違い）
- [x] 11.2 `grep -rn "'approved'" server shared app` の結果を見て、`activated` を落とす `=== 'approved'` が残っていないことを確かめる（U14 の「既に昇格している」判定は `isPromotedPhase` に揃える）
- [x] 11.3 通し確認: proposal を承認 → 一覧で生成中 → 本家 MCP が接続して `.spec-workflow/` ができても生成中のまま・入場できない → steering が文書を提出して終わると（`didWork` が true → U15 が受理）`done` が届き、行が通常になる → 「レビューする」で本家の画面に入れる。**このとき 9.4（起動時の書き上げ）も新しい条件で確かめ直す**——`approved` かつ `invocation: 'idle'` だけが書き上がり、`failed` / `error` / `running` が残ること（9.4 の実機確認は 14.3 で条件を変える前に行ったもの）。終わったら dev サーバーとプロセスを止める
  - **2026-09-06 に確かめた。** `yarn dev`（ポート 3100）。`NUXT_PROJECT_SHARE_ROOT` は検証用の一時ディレクトリ、steering の定型は `NUXT_CLAUDE_STEERING_PROMPT` で「`get-steering-guide` を読み、`submit-document` で product を1本だけ出して終われ」に差し替えた。U1 → A7 → U10（承認）→ U14（昇格）で3件（`chk-steering-ok` / `chk-review-ok` / `chk-review2`）を作り、いずれも同じ経路をたどった。9.4 の書き上げは上の 9.4 に別途記録した。
  - 代表（`chk-steering-ok`）の `state.json` と WS（`/ws` に生で繋いで受けたもの）:

    | 時刻(UTC) | 出来事 | `state.json` | WS |
    | --- | --- | --- | --- |
    | 08:11:35 | U14（昇格） | `approved` / `failed` / retries 0 | `{"type":"project-creation","name":"chk-steering-ok","state":"in-progress"}` |
    | 08:12:25 | 巡回が起こした | `approved` / `running` / retries 1 | — |
    | 08:12:30 | 本家 MCP が接続し `.spec-workflow/`（approvals・specs・steering・templates…）ができた | `approved` / `running` | — |
    | 08:13:15 | steering が product を提出して終了 → `didWork` true → U15 受理 | **`activated`** / `idle` / retries 0 | `{"type":"project-creation","name":"chk-steering-ok","state":"done"}` |

  - **`.spec-workflow/` ができた直後の行**（`GET /api/projects`）は `creation: 'in-progress'` / `connection: 'disconnected'` / `pendingApprovals: null` / `lastModified: null` のままで、画面のガード（`connection !== 'active'`）に掛かって入場できない。完成後は `creation: 'done'` に変わり、`lastModified` が入る。**ただし `connection` は `disconnected` のまま**——steering の claude が終わると本家 MCP のインスタンスも終わるので、行は「アクティブ」ではなく「未接続」で並ぶ（この change の範囲外の既知の見え方。決着のモーダルからの「する」は `projectId` で遷移するので影響しない）
  - 提出は本家に受理されている（生出力の `tool_use` は3件とも `mcp__stroke-board__submit-document` を1回だけ呼び、`.spec-workflow/steering/product.md` が書かれた）
  - **画面（Playwright・headless Chromium）でも確かめた。** 一覧を開いたまま昇格させ、生成中の行 → 知らせる面「プロジェクト chk-review2 の作成が完了しました！」→ 決着のモーダル（タイトル「ステアリングの結果をレビューしますか？」／本文 **「承認画面へ移ります。対象があれば開いた状態で表示します。」**＝14.8 で直した文言）→「する」は押せる → 押すと `/projects/XuRjDJeER-LYi7ST/approvals`（**承認の一覧**）へ着地。承認依頼ゼロが通常の経路であることを画面でも確認した（design Risks「残る症状」・`review()` の落とし先）
  - dev だけの雑音を2つ見た。どちらもこの change の対象外: (a) 一覧を開いた直後は上層 WS の接続まで10秒ほど掛かり、その間に流れた `in-progress` を画面が受け取れないことがある（後続の snapshot 由来の取り直しでも行が現れず、`done` を受けた時点で現れた）。(b) dev のログに `Failed to fetch dynamically imported module`（confetti の動的 import）と hydration mismatch が出る回があった
- [x] 11.4 通し確認（失敗側）: 文書を1本も提出せずに終わる steering で `failed` になり巡回が拾うこと（U15 は叩かれない）。上限に達して `error` で失敗のモーダルが出て、「破棄する」で `.spec-workflow/` を持つプロジェクトが消えること
  - **2026-09-06 に確かめた。** 11.3 とは別の `yarn dev`（ポート 3100・別の一時 share root）で、`NUXT_CLAUDE_STEERING_PROMPT` を「何もせず、ツールを1つも呼ばずに『完了』とだけ答えて終われ」に差し替えた。対象は `chk-fail1`（U1 → A7 → U10 → U14 で作成）。

    | 時刻(UTC) | 出来事 | `state.json` | WS |
    | --- | --- | --- | --- |
    | 08:29:21 | U14（昇格） | `approved` / `failed` / retries 0 | `in-progress` |
    | 08:29:41 | 巡回が起こした（1回目） | `approved` / `running` / retries 1 | — |
    | 08:29:56 | 提出ゼロで終了 | `approved` / `failed` / retries 1 | — |
    | 08:30:42〜08:31:58 | 巡回が2回目・3回目を起こし、いずれも提出ゼロ | `approved` / `failed` / retries 3 | — |
    | 08:32:27〜29 | 4回目のキックで `retries 3 > maxRetries 2` → 起動せず終端 | `approved` / **`error`** / retries 3 | `{"type":"project-creation","name":"chk-fail1","state":"failed"}` |

  - **U15 は叩かれていない。** phase は最後まで `approved` のままで、`done` の配信も無い。サーバーのログは `AI 呼び出しが失敗: chk-fail1 [ 'プロセスは成功したが提出が届かない' ]` が3回と `リトライ上限に達した: chk-fail1（3/2）` の1回だけで、**`完成を記録できない`（`completionRecorder` が 2xx 以外を受けたときのログ）は0件**——U15 を叩いていれば受理か警告のどちらかが必ず残るので、叩いていない証拠になる（`didWork` false で `recordCompletion` の手前で返している。`ai.ts` の成功経路）。生出力にも `tool_use` は1件も無い
  - **失敗の決着は画面に届いた**（Playwright・headless Chromium）。知らせる面「プロジェクト chk-fail1 を作りきれませんでした。」→ 失敗のモーダル（タイトル「プロジェクト chk-fail1 をどうしますか？」／本文「やり直すと、もう一度ステアリングを起こします。」／「やり直す」「破棄する」）
  - **「破棄する」で消えた。** 押した時点で対象は `.spec-workflow/` を持つ `approved`（存在を確認）。P1 が受理して一覧の行は消え、ディレクトリごと（`.spec-workflow/` を含む）残っていないことをファイルシステムで確かめた（design D5・Open Questions の「P1 が `.spec-workflow/` ごと消す」は未決のまま。ここでは振る舞いを確認しただけである）

## 12. レビュー

- [x] 12.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行する。指摘を直し、レビューが完全にパスするまで繰り返す

## 13. 完了

- [x] 13.1 change の成果物を commit する（**14 節の分は 14.12 で別に commit する**）
- [x] 13.2 ユーザーから完了承認を得て、`openspec/tickets/add-activated-phase.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）（2026-09-06 承認。archive は design Open Questions「P1 と `upstream-connection` の関係」の決着後）

## 14. U15 から判定を外す（2026-09-04）

実運用の steering が、文書を提出しても U15 に 409 で断られて `failed` → 巡回 → `error` に倒れた（実機確認）。原因は2つ——**U15 が状態を判定していた**（ADR-0014 に反する）ことと、その根拠にした**承認依頼を steering 工程が出せない**こと（本家 `request-approval` は allowedTools に無い）。完成の判定を U15 から呼び手へ移す。設計の変更はこの3点だけで、`didWork` の定義・巡回の条件・endpoint の構成は変えない。

- [x] 14.1 `server/api/sessions/[id]/activate.post.ts` から `hasApprovalRequest` / `hasApprovalFile` と `node:fs`・`paths` の import を消す。doc コメントの「完成の根拠は承認依頼のファイルの存在だけ」「実物の配置」の節を「判定を持たない（ADR-0014）」に書き直し、退けた案とその理由を残す
- [x] 14.2 `server/utils/stroke/ai.ts` の成功経路を「`didWork` false → `failed`（`recordCompletion` を呼ばない）／true かつ記録なし → `idle`／true かつ記録あり → 呼んで true なら `idle`・false なら `failed`」に直す。`invoke.ts` の `recordCompletion` の導出（`phase === 'approved'` の steering にだけ渡す）は変えない
- [x] 14.3 `server/utils/stroke/activate-approved.ts`・`server/plugins/01.activate-approved.ts` の対象を「`approved` かつ `invocation: 'idle'`」に直す。`failed` / `error` / `running` は生成中のまま残す。ファイルシステムを見る判定は置かない
- [x] 14.4 テストを揃える: `test/server/api/sessions/activate.post.test.ts`（承認依頼のヘルパーと関連ケースを消し、「成果物の有無を見ない」「busy を見ない」を足す）・`test/server/utils/stroke/ai.test.ts`（`didWork` false なら `recordCompletion` を呼ばず `failed`）・`test/server/utils/stroke/activate-approved.test.ts`（`idle` だけが対象）・`test/server/utils/stroke/invoke.test.ts`・`test/e2e/stroke-exit.spec.ts`
- [x] 14.5 delta spec を直す: `api/session/activate`（Requirement「完成の根拠は承認依頼の存在とする」→「完成の判定を持たない」）・`agent/invocation`（作業あり → 記録を試みる／作業なし → `failed`、記録しない）・`project/generation`（起動時の書き上げは `approved` かつ `idle`）・`api/project/delete`（`activated` の根拠を「文書を出し終えた」へ）
- [x] 14.5.1 **archive 後の main specs に旧設計が残らないことを確かめる。** delta が MODIFIED していない Requirement に新設計と食い違う文が無いか、親の生きた specs を読んで突き合わせる。**6本**見つかったので delta を足した（santa-method レビュー指摘 2026-09-04・3〜5周目）:
  - `agent/invocation`「作業が行われたかの判定を工程ごとに持つ」（`fix-steering-empty-completion` の ADDED）— 「生成中では完成の記録が判定に代わる」「この判定を先に問うてはならない」とその Scenario が新設計と真逆だった。MODIFIED として写し（**14.14 で REMOVED＋ADDED に置き換えた**。validate が MODIFIED からの Scenario の欠落を拒むため）、「どの局面でも先に問う」に直す
  - `mcp/tools/submit`「受理された steering の提出を、その起動の作業として記録する」— Scenario の括弧書きに同じ旧設計の一文が残っていた。MODIFIED を新設。**判定の定義そのものは変えていない**
  - `project/directory`「一覧は4つの列を持つ」— 「生成中のプロジェクトは `.spec-workflow` を持たない」を根拠にしていた。同じファイルの隣の Requirement をこの change が「生成中でも `.spec-workflow` はできる」に書き換えているので、そのままだと main の中で前提が並び立つ。根拠を phase（「生成中のあいだは本家から取れる値を見せない」）へ移す。**振る舞いは変えていない**（`directory.ts` の `unfinished()` は既に `lastModified` / `pendingApprovals` を `null` にしており、`directory-creating.test.ts` が当てている）
  - `api/project/delete`「消せるのは承認以降の局面にあるものだけとする」— Scenario「承認以降のプロジェクトを消す」が、`activated` が増えたことで字面上は完成済みも消せると読めるようになった。受理する局面が `approved` の1つに定まることを本文に書き、Scenario の主語を `approved` に絞る。**振る舞いは変えていない**（`index.delete.ts` の `DELETABLE` は既に `approved` だけ）
  - `project/directory`「未接続のプロジェクトは選択できない」— 生成中を選択不可にする理由が「まだ下層に入れる中身を持たない」だった。隣の Requirement 2本で同じ根拠を phase へ移したのに、ここだけ旧前提が残る。根拠を phase（完成が記録されるまでは作りかけを見せない）へ揃える。**振る舞いは変えていない**
  - `project/generation`「決着したら、知らせてから次を選ばせる」— 成功の「する」が「対象を開いた状態で移る」を無条件の SHALL にしていた。完成の定義が承認依頼と切り離された結果、承認依頼ゼロで成功が決着しうるのでこの SHALL は満たせない。「開ける対象が在れば開く／無ければ承認の一覧まで連れて行く」に直す。**遷移の分岐は変えていない**（`projects/index.vue` の `review()` は既に `approvalId` が無ければ一覧へ落とす）。**ただしモーダルの文言は直した**——`CreationChoiceModal.vue` が「承認依頼を開いた状態で表示します。」と断言しており、承認依頼ゼロの経路（通常の経路になった）で嘘になるため（14.8）。承認依頼が確実に在る形にするのは別 change（design Risks「残る症状」）
- [x] 14.5.2 **MODIFIED が生きた Requirement の中身を落としていないことを、Scenario と本文の両方で突き合わせる**（OpenSpec の MODIFIED は Requirement を丸ごと置換するので、写し漏れは archive 時に main から消える）。落ちているものは3種に分けて扱った:
  - **写し漏れ（復元した）**: `project/generation`「決着したら、知らせてから次を選ばせる」の Scenario「決着より後に別のブラウザで開く」。delta を書き足したときの転記漏れで、意図した削除ではない
  - **意図した置換（記録済み）**: `agent/invocation`「生成中の steering では完成の記録が判定に代わる」→ 新設計の Scenario へ／`api/project/delete`「承認以降のプロジェクトを消す」→「生成中のプロジェクトを消す」へ
  - **落とさないと判断したもの**: `project/directory`「プロジェクトの一覧を永続化しない」の Scenario「生成中のプロジェクトが完成する → 生成中であったことを保持する記録はどこにも残らない」。新設計では `state.json` の `phase: activated` が完成の記録として残るので字面は擦れるが、この Requirement が禁じているのは**別の台帳を作ること**であり、`state.json` から導く形は保たれている。MODIFIED の対象にしない
  - **見出しは変えないもの**: `project/generation`「生成中か完了かは**ファイルシステムの事実だけ**で判定する」と `api/project/delete`「**中身のある**本物のプロジェクトは消さない」は、本文が phase 基準に変わっても見出しを据え置く。**MODIFIED は見出しの文字列一致で置換するので、改名すると置換が効かず ADDED になる。** 改名するなら archive 後に別 change で `REMOVED` + `ADDED` を使う
  - **意図した削除（ここに記録する）**: `project/generation`「生成中か完了かは…判定する」から、**「システムは、完了を測るための判定・告知の口・突き合わせの仕組みを、この目的のために新設してはならない（MUST NOT）」を外した。** この change はまさにその口（U15）と突き合わせ（起動時の書き上げ）を新設するので、残すと change 自身と矛盾する。**起票時の delta（develop 版）から既に外れていたが、理由がどこにも書かれていなかった**ので、ここに残す。完了を測る口を無制限に増やしてよいという意味ではない——出どころは U15 の1つに閉じる（`api/session/activate`「成功の決着の合図を出すのはこの endpoint だけ」）
- [x] 14.6 `design.md`（Context・D3・D4・D8・D9・Risks・Open Questions）と `proposal.md`（What Changes・誰がいつどう書くか・`didWork` では足りない理由・U15 と ADR-0014 の関係・初回の見分け方・決定の記録）を直す。**退けた案の経緯を1箇所に残す**
- [x] 14.7 上位資料を直す（apply で書き換え済みの範囲だけ）: `docs/specs/api/sessions/activate.md`・`docs/specs/api/sessions/invoke-agent.md`・`docs/specs/api/contract.md`・`docs/specs/core/schema.md`・`docs/specs/plan/portal-stroke-exit.md`・`docs/specs/architecture/session-workflow.md`・`docs/specs/architecture/question-flow.md`・`CONTEXT.md`
- [x] 14.8 コメントを直す（`ai.ts`・`invoke.ts`・`activate-approved.ts`・`submission-signal.ts`・`01.activate-approved.ts`・`directory.ts`・`projects/[projectId]/index.delete.ts`・`shared/stroke.ts`・`app/pages/projects/index.vue`）。**コメント以外に2箇所だけ字面を直した**——(a) `app/components/project/CreationChoiceModal.vue` の成功モーダルの本文（「承認依頼を開いた状態で表示します。」→「承認画面へ移ります。対象があれば開いた状態で表示します。」）。承認依頼ゼロで完成が決着する経路が通常になったので、断言すると嘘になる。遷移そのものは変えていない。(b) `docs/specs/api/contract.md` の巡回プラグイン名 `02.retry-failed.ts` → `01.retry-failed.ts`（実体は `01.`。3点とは無関係な巻き添えの事実修正）。`grep -rn "approvals\|承認依頼" server shared app test scripts` に加え、**`openspec/`（changes の delta と生きた specs）も同じ grep に掛ける**——delta 2本の漏れはこの範囲を外していたために起きた
- [x] 14.9 ticket に「### 判定材料の見直し（2026-09-04）」を足す（「調べた事実」の表は当時の記録として残す）
- [x] 14.10 `yarn typecheck`・`yarn test` を通し、`/santa-method` でレビューして指摘を直す
- [x] 14.11 **導入前の一度きりの手当て（データ損失の防波堤・実施はユーザー）。**（2026-09-06 確認: `/opt/projects` 直下で `state.json` を持つのは `3d2f1ac8-…`（`stroking` / `failed`）の1件だけで、`approved` のプロジェクトは無い。`agent-messanger` などは `state.json` を持たず、外から置かれたものとして完了扱いになる。手当ての対象なし） `projectShareRoot` の `phase: approved` かつ `invocation` が `idle` でないものを列挙し、**`.spec-workflow/steering/` が空でないもの**を手で `phase: activated` に直す。放置すると次の連鎖で成果物ごと消える（design Risks「中身のある legacy が破棄で消えうる」）:
  `approved + failed/error（文書は在る）` → 書き上げは `idle` だけを見るので畳まない → 行は「生成中」→ 巡回が steering を起こす → 文書が既に在るので提出が起きず `didWork` false → `failed` → 上限で `error` → 失敗のモーダル → 「破棄する」→ P1 は `approved` を受理 → `.spec-workflow/steering/` ごと消える。
  **コードには入れない**——拾うにはファイルシステムを数えることになり、U15 から追い出した判定が起動時の書き上げに生える（design D9）。11.3 の通し確認の前に踏むこと
- [x] 14.12 14 節の実装・テスト・docs をブランチ `add-activated-phase` に commit する（親の `openspec/` はコミットしない）
- [x] 14.13 **`upstream-connection`「本家に書き込まない」を撤廃する（ユーザー判断 2026-09-06）。** P1 が `.spec-workflow/` ごと消すことと衝突していた（design Open Questions）。`specs/upstream-connection/spec.md` に REMOVED と、同 spec「パスから本家の projectId を引き当てる」から参照の一文を外す MODIFIED を置く。proposal の Modified Capabilities と決定の記録に追記。実装の変更は無い
- [x] 14.14 `openspec validate` の指摘2件を直す（2026-09-06）。(a) `api/project/delete` の Scenario 名を生きた spec の「承認以降のプロジェクトを消す」に戻す。(b) `agent/invocation`「作業が行われたかの判定を工程ごとに持つ」は旧 Scenario「生成中の steering では完成の記録が判定に代わる」を MODIFIED では落とせないため、REMOVED＋ADDED「作業が行われたかの判定を工程ごとに持ち、完成の記録より先に問う」に置き換える。validate 通過を確認
