# migrate-claude-p-to-api-endpoint

## Why

現行実装は `claude -p` の成果を、標準出力のテキストから JSON らしき断片を切り出す解析（fenced ブロック・波括弧範囲の総当たり）と、セッションディレクトリの `proposal.md` の mtime 比較というファイル監視で受け取っている。この受け渡しは応答の体裁の揺れに弱く、読み取れない応答は全てリトライへ流れる。また prompt はユーザー入力を埋め込んで呼び出しのたびに合成しており、システムと claude プロセスが密結合になっている。ワークフローの制御とデータの受け渡しを API 経由へ全面移行し、エージェントとの受け渡しを構造化された契約にする。

## What Changes

- システムがエージェント向けの API endpoint を公開する。エージェントは入力（概要・済んだストロークの記録・差し戻しの指摘一式）を GET で取得し、成果（問い・proposal）を POST で提出する
- エージェントの提出を受理した瞬間、サーバがその1件分を WS チャネルでブラウザへ配信する（問い・proposal の読み endpoint は置かない）
- prompt を固定テンプレート化する。ユーザー入力の埋め込み合成を廃止し、差し込みはセッション URL の1点のみ
- 問いと問い返しの区別を廃止する。提出は1口・配信は1チャネルに統合し、問い返しの往復も strokes に一様に記録する。proposal の初提出は strokes にマーカー行として記録し、パンくずはこの記録だけから組み立てる
- **BREAKING** 画面向け API を再編する（集約応答 `SessionView` / `StrokeResult` / `ApproveResult` の廃止、パス構成の変更）
- **BREAKING** 標準出力からの構造読み取り（JSON 断片の切り出し・`PROJECT_NAME:` 行の解析）を廃止する
- **BREAKING** `proposal.md` の mtime 比較による proposal 検出を廃止する
- リトライを尽くした失敗は 502 ではなくセッションの状態（`invocation: failed`）で伝え、ユーザーの再試行は同じ入力 POST の再送とする
- スキーマ不適合の提出は 400 でエージェント自身に返り、同じ呼び出しの中で出し直す。システム側のリトライ対象はタイムアウト（提出が無いまま設定値の時間が過ぎる）のみ
- `claude -p` の起動方式（子プロセス起動・`--session-id` / `--resume`・起動フラグの外出し）は変えない

**確定済み決定との関係**: `.scratch/stroke-board-frontier/decisions.md` の「`claude -p` の呼び出しメモ」にある「`--output-format json` の `type:"result"` の `result` フィールドが応答本文」は、応答本文をデータの受け取り口とする前提であり、本 change はこの受け渡し方式を endpoint 経由に置き換える。また prompt へのユーザー入力の埋め込みも廃止する（ADR 0001 の「入力は `--` の後ろの位置引数1本」は固定テンプレートの受け渡しとして維持）。起動条件・リトライ規定・セッションディレクトリの構成（`state.json` / `proposal.md` の保存自体）は覆さない。

## Capabilities

### New Capabilities

- `agent-api`: システムがエージェント（`claude -p`）へ公開する API endpoint 群。入力の取得口と成果（問い・proposal。プロジェクト名の提案を含む）の提出口、提出のスキーマ検証、承認後の拒否、セッション id との対応付けを定める

### Modified Capabilities

- `ai-invocation`: 応答の受け取り口の規定が変わる。起動後タイムアウト時間内に提出が無い呼び出しを失敗として扱う規定を加え、「問いは規定の構造で返す」は agent-api へ移して取り除き、「CLI のセッションログに触れない」は要求ではなく制約のため spec から外して design へ移す。リトライ規定・スキルとして走らせる規定・起動設定の外出しは変えない
- `stroke-session`: 履歴の規定が変わる。問い返しの往復も粒として道に加わり、proposal の初提出はマーカーとして道に入る。保存する記録もペア行とマーカー行に改める

## Impact

- `server/api/` — エージェント向け endpoint の新設、画面向け endpoint の再編
- `server/routes/`（または相当）— WS チャネル（question / proposal）の新設と受理時・接続時の配信
- `server/utils/prompt.ts` — 固定テンプレート化（取得先・提出先 URL の明記、合成関数の廃止）
- `server/utils/ai.ts` — `readOutcome` の廃止、タイムアウト判定と `invocation` 状態の管理
- `server/utils/ai-response.ts` — 廃止（`parseQuestionResult` / `parseProjectName`）
- `server/utils/session-store.ts` — `readProposalStamp` の廃止、strokes へのペア行・マーカー行の記録
- `server/utils/claude.ts` — 起動は維持。標準出力は成否判定のみ
- `shared/types.ts` — 集約型の廃止、`Stroke` のマーカー行対応
- `shared/api-contract.md` — 全面更新
- `app/` — WS 受信ベースの描画への切り替え、U2 によるリロード判定、パンくずの組み立て変更
- `docs/adr/0001-claude-p-invocation.md` — 起動フラグの決定は継続有効。受け渡し方式の決定として新 ADR の候補
