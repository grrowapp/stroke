## Why

「本家に書き込まない」という制約が、実装と食い違ったまま main spec と steering に残っている。

`implement-portal-mvp` が承認・却下の `POST` を、`implement-spec-document-editing` が文書の `PUT` を2本足したが、どちらの change も `upstream-connection` の Requirement「本家に書き込まない」を書き換えなかった。この Requirement は「承認・却下・タスクの状態変更を stroke-board から行ってはならない（MUST NOT）」と書いており、承認・却下を実装した時点で既に矛盾していた。

同じ趣旨の記述が steering にも2か所ある。うち `tech.md` の Security Practices は「認証・認可は持たない。持たないまま外部公開するため、**書き込み操作を一切持たない構成にする**」と書いており、これは設計の都合ではなくセキュリティ上の前提だった。その前提が外れたまま、書き込み口3本が認証なしで公開されている。

制約が守られていないなら、制約の側を実態に合わせるか、実装の側を制約に戻すかのどちらかしかない。書き込みは意図して足したものなので、制約の側を直す。

## What Changes

- `upstream-connection` の Requirement「本家に書き込まない」を「本家の状態は本家の API を通してのみ変える」に書き換える。禁じる対象を「あらゆる書き込み」から「`.spec-workflow/` への直接の書き込み」に絞る
- steering の `product.md` Project Principles を、`.spec-workflow/` への直接書き込みの禁止に限定する
- steering の `tech.md` Security Practices から「書き込み操作を一切持たない構成にする」を外し、書き込み口が認証なしで公開されている事実を、既知のリスクとして記述する
- `product.md` の Open Questions に「書き込み口の認可をどう担保するか」を積む

**BREAKING** ではない。振る舞いは変えず、記述を実装に合わせるだけ。

### 非目標

- 認証・認可の実装。MVP の途上であり、公開手段は運用側の責任という判断（`product.md` の Risks）を今は変えない
- 書き込み口へのオリジン検証・CSRF 対策の追加
- タスクの状態変更の実装。これは Out of Scope のまま

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `upstream-connection`: Requirement「本家に書き込まない」を書き換える。stroke-board が `.spec-workflow/` へ直接書くことは引き続き禁じるが、本家の API を呼んで本家に書かせることは許す

## Impact

**変わらないもの**

- 実装。`server/api/` の書き込み口3本、接点層、制御層はいずれも変更しない
- テスト。`read-only.test.ts` が「書き込み口は本家 API 経由の3本だけ」を既に固定している

**変わるもの**

- `openspec/specs/upstream-connection/spec.md` — Requirement 1本
- `.spec-workflow/steering/product.md` — Project Principles 1行、Open Questions 1行追加
- `.spec-workflow/steering/tech.md` — Security Practices 1行

steering の2本は本家が持つ文書なので、本家の `PUT /api/projects/:projectId/steering/:name` で書き換え、ダッシュボードの承認を通す。ファイルには直接触れない。

**残る不整合**

書き込み口3本は認証・オリジン検証・CSRF のいずれも持たない。この change はその事実を記述に反映するだけで、埋めない。埋め方は Open Questions として残る。
