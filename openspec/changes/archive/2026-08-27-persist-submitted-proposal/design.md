## Context

動機は proposal.md（Why）、要件は specs/ の delta が持つ。ここでは現状のコードと、approach を決めた制約だけを押さえる。

- A7（`server/api/strokes/[id]/proposal.post.ts`）は本文を検証し、strokes へマーカーを足し、phase を `proposed` にして W2 へ配信する。**ファイルは書かない**
- `readProposal()`（`server/utils/stroke/session-store.ts`）はセッションディレクトリの `docs/proposal.md` を読む。読み手は3つ——W2 の接続時配信、U10 の承認ガード、承認後の steering
- 書き手が居ない。`flontier-strokeflow` の proposal artifact が生成するのは `openspec/changes/draft-proposal/proposal.md` で、`/proposal` スキルは渡されたパスの中身を POST するだけである。`docs/proposal.md` を書けという指示は、スキーマにもスキルにも無い
- `writeAtomic()`（`server/utils/stroke/session-core.ts`）は同じディレクトリへ temp を書いて rename する。**親ディレクトリは作らない**
- 昇格（`promoteSessionToProject()`）はセッションディレクトリの `rename` だけである
- steering の起動は `claude.args` をそのまま使う。許すツールは `Skill` / 限定した `Bash` / `Read` / `Edit` で、**ファイルを探す手段（`Glob` / `LS` / `Grep`）は無い**

## Goals / Non-Goals

**Goals:**

- 「A7 が受理した ＝ `docs/proposal.md` が在る」を、実装の構造として成り立たせる
- 承認・W2・steering の3つの読み手が、同じ1つのファイルを見る状態にする

**Non-Goals:**

- 承認処理に proposal の書き出しを足すこと（D4）
- proposal の版を持つこと。在るのは常に最新の1つだけ
- AI が書くワークフロー artifact（`openspec/changes/draft-proposal/proposal.md`）の置き場を変えること
- `write-steering-v2` スキル本体の改訂（D5）

## Decisions

### D1 書き手はサーバー（A7）に置く

AI に書かせる案を2つ比較した。

- **ワークフロースキーマの `generates` を `docs/proposal.md` にする** — `generates` は change ルート配下の artifact パスであり、セッションルート直下の `docs/` はその外側にある。openspec の artifact 定義で表せる場所ではない
- **`/proposal` スキルの手順に「先に `docs/proposal.md` へ書け」を足す** — ファイルが在るかどうかが「AI が指示に従ったか」に依存し続ける。今起きている不具合そのものであり、同じ壊れ方を再発させる余地が残る

サーバーが受理の時点で書けば、A7 が 200 を返したことがファイルの存在と同義になる。`connect-portal-and-strokes` が削った `writeProposal()` を戻し、A7 から呼ぶ。

### D2 保存してから phase を進め、配信する

順序は「本文の検証 → 保存 → strokes のマーカー → phase 更新 → W2 配信 → 提出の記録」。保存に失敗したらそれ以降を行わず、失敗をエージェントへ返す。

逆順にすると、phase だけ `proposed` に進んでファイルが無い状態を作れてしまう。それは今の壊れ方と同じで、承認の 409 まで気付けない。

### D3 保存先の `docs/` は保存の経路で作る

`writeAtomic()` は親ディレクトリを作らない。proposal を書く直前に `mkdir(recursive: true)` する。

`writeAtomic()` 自体を「親を作る」仕様に変える案は採らない。`state.json` や `strokes.json` の書き込みも同じ関数を通るため、パスの綴り違いが黙って新しいディレクトリを作って通ってしまう。

### D4 承認は触らない

昇格は改名だけなので、`<session>/docs/proposal.md` はそのまま `<name>/docs/proposal.md` になる。ADR-0011 が「承認で `/opt/projects/<name>/docs/proposal.md` を生成したら」と書いている状態に、改名だけで到達する。

承認時に改めて書き出す案は、書き手が2箇所になり、「既に在るファイルを上書きするか」という判断を増やす。`approve.post.ts` は現状のままとし、409 ガード（proposal が無ければ昇格しない）は、A7 を一度も通っていないセッションを弾く保険として残す。

### D5 steering へは定型で在り処を渡す

`write-steering-v2` の Phase 1 は「`proposal.md` を読め」としか書いておらず、パスが曖昧である。steering の起動には探索系のツールが無いため、在り処を示さなければ `Read` の当てずっぽうに委ねることになる。

スキル本体を直す案は採らない。スキルは git 管理外で、`--add-dir` 経由でロードされる（ADR-0001）。この change の成果物として残らず、worktree ごとに在ったり無かったりする。

設定値 `claude.steeringPrompt` に在り処を書く。設定の正である `docs/specs/core/settings-reference.md` の改定を伴うため、ユーザー承認が要る（ADR-0004）。

### D6 未 archive の `connect-portal-and-strokes` の delta も揃える

同 change は実装・commit 済みで archive 待ちである。その delta が「A7 は受理した proposal をファイルへ書き出してはならない（MUST NOT）」「システムのコードは proposal を作っても上書きしてもならない（MUST NOT）」を持ったまま archive されると、この change が入れた requirement を上書きして元へ戻す。

同 change の `specs/api/stroke/proposal/spec.md` と `specs/project/generation/spec.md` を、この change の内容に合わせて直す。**他の change の成果物に触れるため、着手前にユーザーの合意を取る**（tasks の該当項目で止める）。

## Risks / Trade-offs

- **AI が書くワークフロー artifact と、サーバーが書く `docs/proposal.md` の2つが並ぶ** → 役割が違う。前者はワークフローの成果物、後者は画面・承認・steering が読む正。`docs/specs/api/api-contract.md` に書き分けを残す
- **`connect-portal-and-strokes` の archive が先に走ると requirement が戻る** → D6 を先に済ませ、archive の順序に依存させない
- **`write-steering-v2` はこの worktree に無く、main checkout にだけ在る** → 定型で在り処を渡す方式はスキル本体の版に依存しない。スキルが差し替わっても、定型に書いた在り処は届く
- **保存の失敗が提出そのものの失敗になる** → 今までは黙って進み、承認の時点で詰まっていた。提出の時点で失敗が見え、起こし直しの対象になる方が早い

## Migration Plan

`docs/proposal.md` を持たない既存のセッションは、次の提出（差し戻し → 再提出）で埋まる。移行の作業は要らない。

ロールバックは A7 の保存を外すだけでよい。書かれたファイルが残っても、読み手は在るものを読むだけで困らない。
