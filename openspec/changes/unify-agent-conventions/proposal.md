# unify-agent-conventions

## Why

エージェントに向けた規約が両側にあり、**中身が食い違ったまま同名のファイルで置かれている**。`CLAUDE.md` / `docs/agents/domain.md` / `docs/agents/issue-tracker.md` / `docs/agents/triage-labels.md` / `openspec/config.yaml` の5つが、統合時にそのまま衝突する。

食い違いの中身は次のとおり。

| | マージ先（`stroke-board`） | ここ |
|---|---|---|
| issue tracker | `.scratch/<feature-slug>/` の markdown | OpenSpec の change |
| domain docs | multi-context（`CONTEXT-MAP.md`）の説明を含む版 | single-context に削った版 |
| `CONTEXT.md` | **存在しない**（`CLAUDE.md` は在ると書いている） | ドメイン用語集がある |
| subagents | 記述なし | `docs/agents/subagents.md` がある |
| openspec の schema | `specs-with-grill` | `custom` |
| schema の実体 | `flontier-specs` / `flontier-steering` / `grill` の3つ | `custom` 1つ |

**マージ先の記述は既に実態から外れている。** `CLAUDE.md` は issue を `.scratch/` に置くと書いているが、`.scratch/` は存在せず、実際の作業は `openspec/changes/implement-portal-mvp/` で回っている。`docs/agents/domain.md` は `CONTEXT.md` を読めと書いているが、その `CONTEXT.md` が無い。統合時に「新しいほう」「詳しいほう」を機械的に採ると、動いていない規約のほうが残りかねない。

`.gitignore` にも実害がある。マージ先は `.claude/` を全階層で無視していて、こちらの `!assets/.claude/` に相当する打ち消しを持たない。素朴に重ねると、**アプリの配布物であるセッション API スキル6本が追跡から外れる**。

`assets/.claude/skills/` は両側にあるが中身は重ならない（こちらはセッション API 6本、相手は steering 3本 + テンプレート群）。ここは加算でマージできる。

## What Changes

- **統合後に1組だけ残る規約を決め、こちら側をその形にする。** issue tracker、domain docs、triage labels、subagents の4つ
- **`CONTEXT.md` をポータル側の用語を受け入れられる形にする。** 用語集は統合後も1つ。今の `CONTEXT.md` は概要 → ストローク → proposal → 承認 → プロジェクトまでを定義していて、その先（プロジェクトを見張る側の語彙）が無い。何を足す必要があるかを洗い出す
- **`.gitignore` を、相手のものと重ねてもスキルが落ちない形にする**
- **openspec の schema をどちらに寄せるかを決める。** archive 済みの change 20本と `openspec/specs/` の 12 capability はこちらの `custom` で書かれている。相手の active な change 1本は `specs-with-grill`
- **`README.md` を、統合後に1つになる前提で整理する。** 今は「stroke-board の MVP」と自称していて、統合後は成り立たない

決めるべきことが多く、その多くはマージ先の持ち主の判断が要る。design でまとめて確定する。

## Capabilities

この change はエージェント向けの文書と追跡設定だけを触る。アプリの振る舞いを変えないので、spec の差分を持たない（`.openspec.yaml` に `skip_specs: true`）。

## Impact

- `CLAUDE.md`
- `docs/agents/domain.md` / `issue-tracker.md` / `triage-labels.md` / `subagents.md`
- `CONTEXT.md`
- `openspec/config.yaml` / `openspec/schemas/`
- `.gitignore`
- `README.md`

**前提**: なし。他の change とファイルがほとんど重ならない。

**実施の時期**: **統合後に回す。** 両側の規約を1組にする作業は、マージ後に両方を目の前に並べてやるほうが早い。こちらだけ先に直しても、あちらの状態次第でまた動く（実際、あちらの `CLAUDE.md` は実在しない `.scratch/` を指したまま実態から外れている）。

ただし `.gitignore` だけは例外である。マージ先は `.claude/` を全階層で無視していて、こちらの `!assets/.claude/` に相当する打ち消しを持たない。素朴に重ねると**アプリの配布物であるセッション API スキル6本が追跡から外れる**ため、これはマージの作業手順として扱う。詳細は `docs/specs/plan/mainline-merge.md`。

**この change に含めないもの**: マージ先の側の修正（`CLAUDE.md` が指す `.scratch/` が無いこと、`CONTEXT.md` が無いこと）。あちらのリポジトリで直す。ここでは「こちらをどの形にすれば統合時に持ち込めるか」までを決める。
