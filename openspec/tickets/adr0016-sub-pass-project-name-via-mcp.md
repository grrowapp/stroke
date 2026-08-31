---
tags:
  - bug
status: ready-for-agent
order: 0.0
---

# adr0016-sub-pass-project-name-via-mcp

MCP ツール `submit-document` に `projectName` を渡す口が無い。MCP 経由で proposal を出すと、承認画面のプロジェクト名が空になり **承認ボタンが押せない**。

## 事実

実測 2026-08-30。`yarn check:stroke --approve` で承認まで進めようとしたところ、承認モーダルの「作る」が `disabled` のままで押せなかった。

原因は名前が届いていないことである。

| 経路 | projectName |
|---|---|
| A7 の契約（`docs/specs/api/contract.md:200`） | `{ proposal: string, projectName?: string }`（kebab-case のときだけ候補採用） |
| 画面が読む値（同 229行） | `ProposalMessage` = `{ proposal: string, projectName: string \| null }` |
| **MCP ツール `submit-document`** | `{ type, document, name? }` — **projectName が無い** |

`name` は steering 文書の種別（product / tech / structure）を指すもので、プロジェクト名ではない。

画面側は `projectName` を承認モーダルの初期値に使う。

```
const projectName = computed<string>({
  get: () => projectNameDraft.value ?? proposalMessage.value?.projectName ?? '',
  ...
})
const approveBlocked = computed(
  () => !projectName.value.trim() || projectName.value.trim() === conflictName.value,
)
```

値が無いと空文字になり、`approveBlocked` が真のまま固定される。**人が手で打てば進めるが、AI が提案した名前は届いていない。**

## なぜ抜けたか

旧経路のスキル `/proposal` は2引数を取っていた（`assets/.claude/skills/guidance/SKILL.md`）。

```
/proposal '<filepath>' '<projectName>'
```

MCP ツールへ移す際に `document` だけを引き継ぎ、`projectName` が落ちた。`provide-operations-via-mcp` の検証は proposal の着地までしか進めていなかったため、**承認まで通して初めて露見した**（同 change の 5.2 が待っていた領域）。

`decisions.md` は「`<name>` は AI が kebab-case で**提案し**、ユーザーが承認画面で確定する」と決めている。いま提案が届いていないので、この決定が満たされていない。

## 求めるもの

- `submit-document` の `type: 'flontier'` に、proposal が提案するプロジェクト名を渡す引数を足す
- A7 へそのまま渡す。**採否の判定（kebab-case のときだけ候補採用）は endpoint 側に置いたままにする**（ADR-0014: 検証の正は代行先）
- `.describe()` で kebab-case であることと、承認画面の初期値になることを伝える

## 前提

- `provide-operations-via-mcp` の 5.2（ツール6本の正常系）が未了で、その中で `submit-document` の steering 種別と併せて確認できる
- 道具（`yarn check:stroke --approve`）は、名前が空のとき `check-stroke-<時刻>` を自分で入れて先へ進む回避を入れてある（`adr0016-sub-add-stroke-check-approval-option`）。**回避であって修正ではない。** 本件が直れば、AI が提案した名前で承認されるようになる
- ツールの契約（入出力スキーマ）を変えるので、`specs/mcp/tools/submit` の Requirement を更新する
