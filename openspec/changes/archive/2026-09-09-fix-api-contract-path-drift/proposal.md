## Why

`docs/specs/api/overview.md` はセッション系の endpoint を `/api/sessions/…`、W1 / W2 を `/api/sessions/:id/ws/…` と定めている。ところが同じディレクトリの `docs/specs/api/contract.md`「各 endpoint の入出力」は、同じ endpoint を旧い `/api/strokes/…` の見出しで並べたままである。**同じ目録の中で、同じ番号（U1・U2・U3・U7・U9・U12・W1・W2）が2つの path を名乗っている。**

境界の資料は1つが正でなければならない。読み手（画面・エージェント・後続の change）は `contract.md` を入出力の拠り所として読むので、そこに旧 path が残っている限り、新しい endpoint がどちらの形に倣うべきかが決まらない。`docs/` は規範の正（`docs/agents/issue-tracker.md`「各層の性質」）であり、その内部で食い違っているのは規範として成立していない状態である。

親 change `fix-server-api-layout` は実装を `overview.md` へ寄せていく。その基準の側が自分と食い違ったままでは、寄せ先が読めない。だから最初に畳む。

## What Changes

- **`docs/specs/api/contract.md`「各 endpoint の入出力」の見出し 8 本を、`overview.md` の名前空間へ揃える。** 対象はセッション系（U1・U2・U3・U7・U9・U12）と WS 配信（W1・W2）。差し替え後の path は `overview.md` の表と1文字も違わない
- **A 系（A1・A4・A5・A7・A8）の見出しは変えない。** `overview.md` でも `/api/strokes/:id/…` のままであり、エージェントが叩く path として据え置かれている
- **本文は1文字も変えない。** 入出力・エラー・「セッションの参照方法」・「全体設計」・「約束」・「対称性」の各節はそのまま。この change が触るのは見出し行だけである
- **BREAKING ではない。** 資料の見出しの追従であり、実装・URL・画面のいずれも動かない。実際の URL の移設は親 change の別の子（Gitea #17 `fix-session-api-namespace`）が行う
- 触らないもの: `docs/specs/api/overview.md`・`docs/specs/api/server.md`（基準）、`docs/specs/api/` の外のページ、`openspec/specs/`、`server/`・`app/`・`test/`・`nuxt.config.ts`

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。振る舞いは変わらない——資料の見出しが指す先を、同じディレクトリの基準へ合わせるだけである。`openspec/specs/api/session/*` は既に `/api/sessions/…` で書かれており、delta は生じない。よって `.openspec.yaml` に `skip_specs: true` を置く。

## Impact

- **docs**: `docs/specs/api/contract.md` の 8 行（見出しのみ）
- **コード**: なし
- **テスト**: なし
- **openspec**: この change の artifact と ticket `fix-api-contract-path-drift.md`
- **依存**: なし。親 change の他の子 change を待たず、待たせもしない。#12・#13 は基準の2ページを直接の根拠にできる
- **外部**: なし
