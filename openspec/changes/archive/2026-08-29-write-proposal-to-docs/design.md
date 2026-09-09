## Context

症状と原因は proposal.md - Why を参照。ここには実装の位置を決めるうえで確かめた事実だけを残す。

**この壊れ方は、途中で止まった移設の跡である。**

`openspec/changes/archive/2026-08-26-connect-portal-and-strokes/tasks.md:43-48` に、書き手をサーバーから AI へ移す作業が残っている。

```
## 5. proposal の書き手を claude へ移す
- [ ] 5.1 guidance/SKILL.md に、proposal 全文を `docs/proposal.md` へ書いてから
        そのパスを /proposal に渡すことを明記する
  - **permission で編集できず保留。** `.claude/settings.json` の
    deny: "Edit(./.claude/**)" が assets/.claude/... にも一致する
- [x] 5.2 proposal.post.ts から writeProposal() の呼び出しを外す
- [x] 5.3 readProposal() の読み先を docs/proposal.md に変え、writeProposal() を削る
```

サーバー側を外し（5.2 / 5.3）、移した先へ伝える 5.1 が permission で塞がれたまま、この change は 52/57 のまま archive された。結果、**どちらも書かない**状態が残った。`openspec archive` はタスクの消化率を見ないので止まらず、`project/generation` の Scenario を検証するテストも無い（`test/` `e2e/` を grep して 0 件）ため、誰も気づかなかった。

**現状の関係**

| 誰 | 何をする |
|---|---|
| A7 `proposal.post.ts` | 本文を受理 → W2 へ publish → phase を `proposed` に |
| `readProposal()` | `docs/proposal.md` を読む。無ければ undefined |
| W2 の接続時配信 | `readProposal()` を読んで送る |
| U10 承認 | `readProposal()` が undefined なら 409 |

publish はメモリ上の接続にしか届かない。**受理と永続が繋がっていない**のがこの1点である。

## Goals / Non-Goals

**Goals:**

- 受理が成立したら proposal が残り、後から繋いでも承認時にも得られること
- 残せなかったときに、受理だけ成立した状態を作らないこと

**Non-Goals:**

- AI 側の指示（`assets/.claude/skills/`）は変えない。5.1 をやり直さない。置き場所を決めるのがサーバーだけになるため、AI へ伝える必要そのものが無くなる
- proposal の履歴を残さない。得られるのは最後に受理した1件だけとする
- 画面・API の入出力・昇格の手順は変えない
- archive の運用（未完のまま畳めること）はこの change では扱わない。別に立てる

## Decisions

### 決定1: 書くのは A7 の受理経路。承認では書かない

`project/generation` の Scenario「システムは proposal を書かない」は `WHEN 承認の処理が走る` に限定されており、書く位置を受理側に置く限り成立し続ける。承認は今までどおり読むだけである。

*代替案*: 承認の時点で書く。受理から承認までの間に画面が繋ぎ直すと proposal が出ないままになるので、症状が半分しか消えない。採らない。

### 決定2: 原子的に書き、書けたことを確かめてから受理を成立させる

`session-core.ts` の `writeAtomic`（同じディレクトリへ書いてから rename）を使う。読み手が書きかけを見ない。

順序は「書く → phase を進める → publish」とする。書けなければそこで失敗を返し、phase も publish も行わない。逆順にすると、配信だけ届いて残っていない状態が作れてしまう（今と同じ壊れ方）。

*代替案*: 書き込みを非同期にして受理を先に返す。失敗が受理の後に来るので、spec の「残せなければ受理しない」を満たせない。採らない。

### 決定3: 書き手は `session-store.ts` に置き、`readProposal` と対にする

読み先を決めているのは `readProposal`（`PROJECT_DOCS_DIR` / `PROJECT_PROPOSAL_FILE`）である。書き手を同じ場所に置けば、置き場所の定義が1箇所に留まる。`writeProposal` は 5.3 で削られたものを、読み手と対になる形で戻すことになる。

*代替案*: endpoint の中で直接パスを組む。置き場所の定義が2箇所に割れる。今回の不具合が「規定が散っていて片方だけ動いた」ことなので、同じ形を作らない。

### 決定4: 出し直しは上書き

`docs/proposal.md` は常に最後に受理した1件だけを持つ。差し戻しの往復の記録は `strokes.json` が持っており、proposal の過去版を残す読み手が居ない。

## Risks / Trade-offs

- **`docs/` が無いセッションで書けない** → 書き手側でディレクトリを作る。既存のセッションには `docs/` が無い（実測: 今動いているセッションは `openspec/` しか持たない）ので、作らないと最初の提出が必ず失敗する
- **既に止まっているセッションは救われない** → 修正後に proposal を出し直させれば残る。過去に受理済みで残っていないものを遡って復元はしない
- **AI が書いた元ファイルがセッションに残る** → `proposal-todo-cli.md` のような中間ファイルはそのまま残る。昇格後のプロジェクトに紛れ込むが、この change では扱わない
- **`project/generation` の Scenario を検証するテストが無い** → 今回の取りこぼしはそこを突いている。tasks で E2E に足す
- **出し直しでの部分失敗** → 初回提出は phase が `stroking` のままなので、残した後に `writeState` が失敗しても配信・承認のゲートは閉じたままで守られる。だが差し戻し後の**出し直し**は既に `phase: proposed` なので、残せた後に `writeState` が失敗すると、呼び出し側には失敗が返るのに新しい本文は見えて承認もできる。セッション単位のロックが無い以上ここを閉じるには前の本文へ戻す仕掛けが要り、費用が釣り合わない。**残った本文が新しい方である**ことは変わらないので実害は小さいと判断して残す
- **同時提出** → 同じセッションへ A7 が同時に2回来ると、`writeAtomic` は壊れないが、各要求が自分の読んだ `state` を元に書くため、残った本文と配信された内容・`projectName` が完了順で食い違いうる。セッション単位のロックが無いことに由来する既存の性質で、この change が持ち込んだものではない（`writeState` / `appendStroke` にも同じことが言える）

## Migration Plan

不要。データ形式・API の入出力・画面のいずれも変えない。今まで残っていなかったものが残るようになるだけで、既存のセッションは次の提出から正しくなる。ロールバックは revert で足りる。
