# Interview — steering-dashboard-portal

<!-- 事前に読んだもの: base2/CLAUDE.md, docs/agents/{domain,issue-tracker,triage-labels}.md,
     openspec/config.yaml, openspec/schemas/spec-driven-custom/。
     .spec-workflow/steering/ は存在せず、CONTEXT.md も docs/adr/ も空。コードもまだ無い。
     したがってこのインタビューは差分ではなくプロジェクト全体を対象とする。 -->

## Q1. 今回のステアリングパスで、何をどこまで書きますか？（この答えが change 名と以降全部のスコープを決めます）

- **Intent**: リポジトリに何も無いため、対象がプロジェクト全体なのか一部なのかを先に確定させないと、proposal 以降が「全体を書いているつもりの部分記述」になる。
- **Answer**: 3本全部／プロダクト全体
- **Settled**: product.md / tech.md / structure.md の3本を、プロジェクト全体の土台として新規に書く。change 名は `steering-dashboard-portal`。
- **Landed**: proposal.md 全体／tasks.md

## Q2. 「完全上位互換」の到達範囲は？

- **Intent**: 「完全上位互換」を額面通り取ると既存の全画面を作ることになる。ここを決めないと proposal の What Gets Built と Out of Scope が書けない。
- **Answer**: 一部は対応しない
- **Settled**: 全画面の置き換えではない。落とす範囲は Q6 で確定。
- **Landed**: proposal.md → Out of Scope

## Q3. 利用形態は？

- **Intent**: ローカル単独か共有かで認証・配信・データ保護が全部変わる。tech.md の Security posture と Deployment の根。
- **Answer**: ブラウザから利用
- **Settled**: （この時点では未確定。設置場所を Q7 で問い直した）
- **Landed**: なし

## Q4. 通知の到達要件は？

- **Intent**: タブを閉じても届く必要があるかどうかが、配送機構（Push API か否か）を決める。
- **Answer**: 公式準拠
- **Settled**: （この時点では未確定。Q8 で問い直した）
- **Landed**: なし

## Q5. 集約ポータルが受ける入力ソースは？

- **Intent**: 汎用通知ポータルなのか単一ソース専用かで、イベントモデルの抽象度が変わる。
- **Answer**: spec-workflow-mcp 専用
- **Settled**: 集約対象は spec-workflow-mcp のイベントのみ。他ソース（CI、stroke-guard のファイルイベント等）を受ける汎用ポータルにはしない。
- **Landed**: proposal.md → Out of Scope / Capabilities

## Q6. 既存ダッシュボードのうち、このプロダクトでは「対応しない」ものはどれですか（複数選択可）？

- **Intent**: Q2 の「一部」を具体的な画面名で確定させる。ここが Out of Scope の本体になる。
- **Answer**: Jobs（ジョブスケジューラ）, Logs（ログ閲覧）, Statistics（統計）
- **Settled**: 非対応 = Jobs（`JobFormModal` / `JobExecutionHistory` / `JobTemplates` 相当）、Logs（`LogsPage` 相当）、Statistics（`DashboardStatistics` 相当）。
  対応する = Specs 一覧、SpecViewer、Steering、Approvals、Tasks、Settings、ドキュメント編集系（エディタ・差分表示）。
- **Landed**: proposal.md → What Gets Built / Capabilities / Out of Scope

## Q7. サーバーはどこで動きますか？

- **Intent**: Deployment、secure context、認証の有無が全部ここから下がる。
- **Answer**: 認証不要、外部に公開もする。Push APIは間違えてるから公式見ろ
- **Settled**: 外部公開する。アプリ自身は認証を持たない。／ Push API についての私の説明は誤りだったため、W3C 仕様を当たり直した（Q8 参照）。
- **Landed**: proposal.md → Technology（Deployment、Security posture）

## Q8. 「公式準拠」は W3C Push API 準拠（タブを閉じても届く）という意味で合っていますか？

- **Intent**: Q4 の「公式準拠」の指す先を確定させる。
- **Answer**: 間違えてる
- **Settled**: 私の Push API の説明が誤りだった。W3C Push API 仕様で確認した事実:
  - *"The contents of a push message are encrypted [RFC8291]"* — push service は本文を読めない。露出するのは *"the timing, frequency, and size of messages"* のメタデータのみ。私は「内容が外部に出る」と説明していたが誤り。
  - *`[SecureContext]`* 指定あり。*"it has to have an active service worker"*（MDN Push API）。
  - `applicationServerKey` は *"the key that the application server will use to authenticate itself when sending push messages"*（RFC 8292 / VAPID）。
- **Landed**: 記録のみ（Q19 で Push API 自体が不採用になった）

## Q9. プッシュ通知の配送方式を確定してください

- **Intent**: 集約ポータルの中核機構。ここが決まらないと tech.md が書けない。
- **Answer**: spec-workflow-mcp準拠。余計なことしない
- **Settled**: 余計な配送機構（VAPID、外部 push service）は足さない。~~ただし spec-workflow-mcp 側にブラウザ通知の実装が存在しないため「準拠先」が無く~~ → **Q38 で覆った。「実装が存在しない」は私の調査漏れで誤り。** 本家には `src/dashboard_frontend/src/modules/notifications/NotificationProvider.tsx` にトースト通知が実在する。準拠先はあった。
- **Landed**: proposal.md → Technology（Application Architecture）

## Q10. 「認証不要・外部公開」の意図はどれですか？

- **Intent**: 認証の不在が恒久的な設計前提なのか、当面の割り切りなのかで structure.md の切り方が変わる。
- **Answer**: 今はだ。将来的に入れないとはいってない
- **Settled**: 現時点は認証なし。将来の導入を否定しない。ただし今のスコープにユーザー概念・購読モデルは入れない。
- **Landed**: proposal.md → Out of Scope / Risks

## Q11. データソースはどちらですか？

- **Intent**: tech.md と structure.md の根。ファイルを直に触るか、既存サーバーを介するかで責務境界が丸ごと変わる。
- **Answer**: APIを叩く > mcpツール叩く > 直接読む（書き込みはしない）
- **Settled**: 取得手段の優先順位は ①本家 dashboard の REST API → ②MCP ツール → ③`.spec-workflow/` の直接読み取り。
  stroke-board 自身は `.spec-workflow/` に書き込まない。状態を変える操作は本家に委ねる。
- **Landed**: proposal.md → Technology / Structure（モジュール境界）

## Q12. 複数プロジェクトの束ね方は？

- **Intent**: 「集約ポータル」がプロジェクト横断を指すのかどうか。Who とデータモデルの両方に効く。
- **Answer**: 束ねる必要がない。
- **Settled**: ~~単一プロジェクトを対象とする~~ → **Q34 で覆った。この記録は誤り。** 私の質問が `activeProjects.json` を使うかどうかという実装手段の問い方になっており、「横断かどうか」を問えていなかった。正しい結論は Q34 を見ること。
- **Landed**: 取り消し

## Q13. 通知からのダイレクトリンクはどこまで特定しますか？

- **Intent**: 依頼の中核機能その2。着地点の粒度が UI と URL 設計を決める。
- **Answer**: 1の想定だが、説明内容がおかしい。ただ開くだけ
- **Settled**: 通知から対象ドキュメントを開く、それだけ。該当セクションへのスクロールやハイライトは行わない。
- **Landed**: proposal.md → Capabilities／ui.md

## Q14. 多言語対応は？（既存は 11 言語）

- **Intent**: 「完全上位互換」を言語まで満たすかどうか。永続的な維持コストが変わる。
- **Answer**: 日本語＋英語
- **Settled**: i18n 基盤は持つが、対応言語は日本語と英語の2つ。
- **Landed**: proposal.md → What Gets Built / Technology

## Q15. ブラウザ通知の出し方を決めてください（既存に実装が無いため、ここだけは新規判断が要ります）

- **Intent**: Q9 が「準拠先なし」で止まったので、機構そのものを決めてもらう。
- **Answer**: 本家のwsにつなぐが直接ではない。間に本家wsと接続、stroke-boardにイベント発火の制御を入れる
- **Settled**: ブラウザが本家 WebSocket に直接つながる構成にはしない。stroke-board のサーバー側が本家 WebSocket のクライアントとなり、そこにイベント発火の制御層を置く。ブラウザは stroke-board のサーバーとだけ話す。
- **Landed**: proposal.md → Technology（Application Architecture）／Structure（モジュール境界）

## Q16. 「集約ポータル」は通知を残しますか？

- **Intent**: 独自の永続化層を持つかどうか。持つならストレージ選定という枝が生える。
- **Answer**: 本家のデータ状態に依存する
- **Settled**: 通知の履歴・既読未読を独自に永続化しない。表示される状態は本家のデータ状態から導出する。stroke-board は自前のデータストアを持たない。
- **Landed**: proposal.md → Technology / Out of Scope

## Q17. どのイベントを通知にしますか（複数選択可）？

- **Intent**: 通知対象の集合。product.md の Capabilities に直結。
- **Answer**: イベント対象は全部。実装から外したものに関しては除く
- **Settled**: 本家が `multi-server.ts` でブロードキャストする8種のうち、非対応機能に紐づくものを除いた6種が対象:
  `approval-update` / `batch-approval-update` / `batch-approval-undo` / `task-status-update` / `spec-update` / `steering-update`。
  除外 = `implementation-log-update`（Logs 非対応のため）、`projects-update`（単一プロジェクトのため）。
- **Landed**: proposal.md → Capabilities

## Q18. base2/CLAUDE.md の「Packages are deep modules」前提をどう扱いますか？

- **Intent**: structure.md の切り方の根。CLAUDE.md が参照する `packages/README.md` は実在しない。
- **Answer**: deep modulesは無視でいい
- **Settled**: `packages/` による deep module 構成は採らない。CLAUDE.md の当該記述は本プロジェクトには適用しない。
- **Landed**: proposal.md → Structure ／ 🔶 CLAUDE.md の Packages 節が孤児になる（後述の Unanswered）

## Q19. stroke-board サーバーの制御層から、ブラウザにはどう出しますか？

- **Intent**: Q9・Q15 で残った最後の一点。ブラウザ側の表示機構。
- **Answer**: OS通知とは？ブラウザでモーダル出るだけ。
- **Settled**: 「ブラウザ上のプッシュ通知」は OS レベルの通知ではなく、ブラウザ画面内に出る通知を指す。したがって Notification API も Service Worker も Push API も VAPID も使わない。制御層から自前の WebSocket でブラウザに送り、画面内に出す。
  私が Q4・Q8・Q9 で W3C Push API の話に持っていったのは的外れだった。
  ~~画面内にモーダルとして出す~~ → **形は Q38 でトーストに差し替わった。** OS 通知を使わない点と、自前 WebSocket で送る点は有効。
- **Landed**: proposal.md → Technology ／ ui.md

## Q20. 本家（spec-workflow-mcp ダッシュボードサーバー）の起動はどう扱いますか？

- **Intent**: 本家プロセスのライフサイクルに責任を持つかどうか。Deployment と Dependencies に効く。
- **Answer**: 別途起動されている前提
- **Settled**: 本家は利用者が別途起動しておく。stroke-board はその URL を設定で受け取るだけで、起動・監視の責任を持たない。
- **Landed**: proposal.md → Dependencies / Technology（Deployment）

## Q21. Nuxt4 のレンダリングと配布形態は？

- **Intent**: tech.md の Application Architecture。
- **Answer**: SSR あり
- **Settled**: Nuxt4 の SSR を有効にする。Nitro サーバーが本家 WebSocket クライアントと制御層を抱える。
- **Landed**: proposal.md → Technology

## Q22. product.md の Outcome に入れる「測れる成果」は何ですか？

- **Intent**: proposal テンプレートが metric + target を要求する。
- **Answer**: とくにない
- **Settled**: 測定指標を置かない。Outcome には指標を設定しない旨をそのまま書く。数値目標を発明しない。
- **Landed**: proposal.md → Outcome

## Q23. 通知の見え方の確認です。この理解で合っていますか？

- **Intent**: Q19 で認識が反転したので、UI の形を確認する。
- **Answer**: モーダル＋集約ポータル画面（推奨）
- **Settled**: イベント発生時にブラウザ内に通知を出す。それとは別に、通知を並べる集約ポータル画面を持つ。OS 通知は使わない。
  ~~モーダルを出す／どちらからも対象ドキュメントを開ける~~ → **Q38 で覆った。** 形はトーストで、トーストからは開けない。開く導線はポータル画面に一本化した。
- **Landed**: proposal.md → Capabilities ／ ui.md

## Q24. テスト方針は？

- **Intent**: tech.md の Testing approach。
- **Answer**: Vitest + Playwright
- **Settled**: ロジックは Vitest、通知から対象ドキュメントへの導線は Playwright で E2E を取る。
- **Landed**: proposal.md → Technology

## Q25. バージョン管理とブランチ戦略は？

- **Intent**: tech.md。他のどの決定にも依存しない独立枝。
- **Answer**: git / feature ブランチ
- **Settled**: git を使い、作業単位で feature ブランチを切って main にマージする。現状 base2 は git リポジトリではないため `git init` から始まる。
- **Landed**: proposal.md → Technology

## Q26. コード品質ツールは？

- **Intent**: tech.md の Code quality tooling。
- **Answer**: 規定しない
- **Settled**: lint / format ツールをステアリングで規定しない。
- **Landed**: proposal.md → Technology

## Q27. このプロダクトにとって「規模の成長」は実問題ですか？

- **Intent**: schema の Technology ツリーが最初に分岐させる問い。No なら成長と性能目標の見出しごと落とす。
- **Answer**: No：規模は変わらない
- **Settled**: 成長は考慮しない。tech.md に成長シナリオと性能目標の見出しを置かない。
- **Landed**: proposal.md → Technology（当該見出しを置かない）

## Q28. 外部公開の手段は何ですか？

- **Intent**: tech.md の Deployment and distribution。
- **Answer**: 規定しない
- **Settled**: Nitro サーバーとして起動するところまでを決め、外に出す手段（トンネル・リバースプロキシ・ポート開放）は運用側の問題としてステアリングから外す。
- **Landed**: proposal.md → Technology（Deployment）

## Q29. 認証なしで外部公開することを、product.md の制約にどう書きますか？

- **Intent**: MUST / SHOULD / MAY の三段のうち MUST に入るかどうか。
- **Answer**: 制約は書かない
- **Settled**: 認証・公開に関する制約を Principles & Constraints に書かない。Q11 の「自分では書き込まない」は制約ではなくアーキテクチャ決定として Technology 側に書く。
- **Landed**: proposal.md → Principles & Constraints（当該項目を置かない）

## Q30. structure.md のドキュメント期待値は？

- **Intent**: structure.md の Documentation expectations。
- **Answer**: ？？？
- **Settled**: 質問が伝わらなかった。Q31 で言い換えた。
- **Landed**: なし

## Q31. コード以外に書き残すもの（用語集・設計判断の記録）を、structure.md でどう規定しますか？

- **Intent**: Q30 の言い換え。
- **Answer**: CLAUDE.md の宣言をそのまま採用（推奨）
- **Settled**: ルートの `CONTEXT.md` に用語を、`docs/adr/` に設計判断を残す。base2/CLAUDE.md と docs/agents/domain.md が既にその前提で書かれているので、structure.md はそれを追認する。
- **Landed**: proposal.md → Structure（Documentation expectations）

## Q32. 命名規則・ファイルサイズ上限・import パターンなどのコード規約はどうしますか？

- **Intent**: structure.md の Import patterns / Naming conventions / Size limits。
- **Answer**: auto-importはやめろ
- **Settled**: Nuxt の auto-import を使わない。明示 import を規約とする。公式で確認した事実:
  - `imports: { autoImport: false }` で composable / util の auto-import を止められる。止めても *"it's still possible to use explicit imports from `#imports`"*。
  - コンポーネントの auto-import は `components.dirs` を空にすることで止まるが、公式に *"this will not affect components added by modules"* とあるため、**Nuxt UI がモジュールとして登録するコンポーネントは止まらない**。
- **Landed**: proposal.md → Structure（Import patterns）

## Q33. このダッシュボードを見るのは誰ですか？

- **Intent**: product.md の Who。外部公開する以上、本人だけとは限らない。
- **Answer**: いろいろな人
- **Settled**: 単一ペルソナに絞らない。開発者本人を含む複数の関係者が見る。役割ごとの機能差やユーザー概念は持たない（Q10・Q12 と整合）。
- **Landed**: proposal.md → Who

## Q34. 画面の行き来をどうしますか？（左サイドバー / 上部タブ / 通知画面だけ）

- **Intent**: ui.md のナビゲーション。プロトタイプで私が本家の構成を流用しただけで根拠がなかった。
- **Answer**: そもそも、spec-workflow-mcp自体はプロジェクト単位。portal的な部分は本システム特有で、プロジェクト横断。だから、一緒になること自体がない
- **Settled**: **通知ポータルはプロジェクト横断**であり、それが stroke-board 固有の価値。本家はプロジェクト単位なのでスコープが違い、同じナビゲーションには並ばない。Q12 の「単一プロジェクト」は私の質問の立て方が悪く誤って記録したもので、ここで覆る。
  波及する事実:
  - 本家の WebSocket は `?projectId=` 単位の購読なので、監視するプロジェクトの数だけ接続を張る
  - 通知は「どのプロジェクトか」を必ず持つ
  - ダイレクトリンクにも projectId が要る。本家は projectId を localStorage に持ち URL に出さない（`ProjectProvider.tsx`）ため横断リンクを作れない。ここが上位互換の実体
- **Landed**: proposal.md → Why / Capabilities / Technology ／ ui.md → Surfaces

## Q35. stroke-board はプロジェクト単位の画面を自分で持ちますか？

- **Intent**: Q34 でスコープが分かれた以上、下層を持つのか本家に飛ばすのかで作る量が変わる。
- **Answer**: 個別プロジェクトももつ
- **Settled**: **2層構成**。上層がプロジェクト横断の通知ポータル、プロジェクトを選ぶと下層としてそのプロジェクトの画面群（仕様書 / ステアリング / タスク / 承認 / 設定）に入る。同じナビゲーションに並べず、階層で分ける。Q2・Q6 の「統計と実装ログ以外は対応する」は下層に対して有効なまま。
- **Landed**: proposal.md → What Gets Built / Structure ／ ui.md → Surfaces

## Q36. 上層ポータルは通知だけですか、プロジェクトの一覧・登録・作成も持ちますか？

- **Intent**: ui.md のナビゲーションを決める途中で、上層の中身が通知1画面では収まらなくなった。上層に何が座るかでナビゲーションの形が変わる。
- **Answer**: プロジェクト作成をメニューに入れる／プロジェクト一覧も／プロジェクトの登録も欲しいかも
- **Settled**: 上層のメニューは **通知 / プロジェクト一覧** の2つ。**登録と作成は独立したメニュー項目にせず、プロジェクト一覧画面の操作**として持つ（まとまりとして自然、というユーザー判断）。
  登録と作成は同じ扱いで、どちらも**中身（何をどう作り、どう登録するか）はこの時点では決めない**。他プロジェクトとの接続で機能が有効化される想定。
  本家ソースで確認した事実: `POST /api/projects/add`（body `{projectPath}`）と `DELETE /api/projects/:projectId` は実在するが、いずれも registry への登録・解除であり、**プロジェクトを新規に作る機能は本家に無い**。
- **Landed**: ui.md → Surfaces / Primary Flows

## Q37. プロジェクト一覧に出すプロジェクトは、どこから取りますか？

- **Intent**: Q36 で一覧を持つと決めた以上、母集合の出どころが要る。ここは Q11（データソース）と Q16（永続化しない）の両方に触る。
- **Answer**: 登録簿は持たない／設定でパスを指定する／アクティブかそうじゃないかは api か activeProjects
- **Settled**: **母集合** = stroke-board の設定で指定した親パスを走査し、`.spec-workflow` を持つディレクトリをプロジェクトとして扱う。
  **アクティブ判定** = `activeProjects.json`（本家のグローバル状態）または本家 API を重ねる。
  **登録簿は持たない** — Q16 をそのまま維持し、stroke-board 側にプロジェクトの一覧を永続化しない。
  並びは**アクティブが上、未接続が下**。未接続の行は非活性で選択できない。
  本家ソースと実機で確認した事実:
  - アクティブの実体は registry entry の `instances` に生きた PID があること（`isProcessAlive`）
  - `cleanupStaleProjects()` は生きた instance が無いプロジェクトを registry ごと削除する。MCP サーバーは `stop()` で自分の instance を外すため、**本家 API は未接続プロジェクトを返さない**。走査が要るのはこのため
  - 生存確認はダッシュボード起動時の1回だけ（定期実行は明示的に外されている）。MCP がクラッシュすると死んだ PID が次の起動まで「アクティブ」として残る
  - `SPEC_WORKFLOW_HOME` の中身は `activeProjects.json` などの**ファイルのみ**で、プロジェクトのディレクトリ一覧は無い

🔴 **この記録の実測は場所を間違えていた（後から訂正）**。私は既定値の `~/.spec-workflow-mcp` を見て「`activeProjects.json` は `{}`」「`.spec-workflow` は各リポジトリ直下」「`SPEC_WORKFLOW_SHARED_ROOT` は一覧の出どころにならない」と書いたが、この repo の `.mcp.json` は別の場所を指していた。正しい実測:

  - `SPEC_WORKFLOW_HOME` = `/opt/projects/.spec-workflow-mcp`、`SPEC_WORKFLOW_SHARED_ROOT` = `/opt/projects/stroke-board`
  - `.spec-workflow/` は各リポジトリ直下ではなく **`/opt/projects/<name>/` に外出し**されている
  - したがって **`SPEC_WORKFLOW_SHARED_ROOT` の一つ上（`/opt/projects`）がプロジェクトの集合親**になる。ユーザーが当初「shared_root にディレクトリの一覧がある」「その一つ上が集合親」と説明していたのはこれで、私がそれを否定したのが誤りだった
  - `/opt/projects/.spec-workflow-mcp/activeProjects.json` には3プロジェクトが登録済みで、base2 は `projectId: YRzzH6mvc1uUzZN3` としてアクティブ（`workflowRootPath: /opt/projects/stroke-board`）

  結論（設定した親パスを走査し、アクティブ判定を重ねる）は変わらない。走査先が `/opt/projects` 型の集合親になるという裏付けが付いた。
- **Landed**: ui.md → Surfaces（プロジェクト一覧）/ States

## Q38. イベント発生時のブラウザ内通知は、何を載せてどう閉じますか？

- **Intent**: Q23 で「モーダルを出す」までは決まったが、中身と挙動が未決だった。ここが決まらないとフローが埋まらない。
- **Answer**: 通知モーダルは本家と同じイメージで十分／完全に本家と同じ
- **Settled**: **本家の通知実装をそのまま踏襲する。** 変種を作って選ぶ必要が無いため、この問いにプロトタイプは作っていない。
  本家の実装（`NotificationProvider.tsx`）で確認した形:
  - **モーダルではなくトースト**。`fixed top-4 right-4` で右上固定、複数は縦積み
  - 種別は `info` / `success` / `warning` / `error` の4つで色分け＋アイコン
  - 中身は1行テキストのみ。**クリックできない**（リンクも件名・本文の区別も無い）
  - 5秒で自動削除。× で手動削除も可
  - Howler.js で音を鳴らす。`soundEnabled` / `volume` は localStorage、ヘッダーに `VolumeControl`
  - 初回ロードでは出さない。承認は ID 集合の差分、タスクは `getSpecTasksProgress` の再取得と前回値の比較で検出している
  したがって **Q23 の「モーダル」「どちらからも開ける」は覆る**。対象ドキュメントを開く導線は通知ポータル画面に一本化する。
  併せて **Q9・Q15・Q19 が前提にしていた「本家にブラウザ通知の実装が存在しない」は誤り**だった（私の調査漏れ）。
- **Landed**: ui.md → Surfaces / Primary Flows / Interaction & Feedback / Visual Language / Accessibility / Prototype Outcome

## Q39. 登録・作成を持つことと、Q11「状態を変える操作は本家に委ねる」をどう整合させますか？

- **Intent**: Q36 で登録・作成を持つと決めた時点で、Q11 と正面からぶつかった。proposal の責務境界がここで決まる。
- **Answer**: 作成と登録は本家が持ってない範囲
- **Settled**: **Q11 は本家が担っている範囲についての委譲であり、本家に機能が無い範囲は stroke-board が担う。** 線引きは「本家が持っているかどうか」。
  - 本家が持つ範囲（仕様・承認・タスクなどワークフローの状態変更）は引き続き本家に委ねる。stroke-board は `.spec-workflow/` に書き込まない
  - 本家が持たない範囲（プロジェクトの作成）は stroke-board 側の機能になる。本家ソースで確認済み: 新規作成に相当する機能は本家に無い
  - 登録については、本家に `POST /api/projects/add` が実在する一方で stroke-board の一覧は親パスの走査で作る（Q37）。stroke-board の「登録」がその API を指すのか別物なのかは中身次第で、Unanswered に残る
- **Landed**: proposal.md → Technology（責務境界）／ui.md → Interaction & Feedback

## Q40. プロジェクト作成の実処理はどこが担いますか？

- **Intent**: Q36 で中身は保留にしたが、実処理の主体だけは proposal の責務境界に直接効くので先に要る。
- **Answer**: 別プロジェクトが担う
- **Settled**: **stroke-board は入口（画面とトリガー）だけを持ち、実際に作るのは接続先の別プロジェクト。** 接続が無ければ作成は行えず、その状態は画面に出る（ボタンが非活性）。
  stroke-board 自身がプロジェクトの実体を作らないため、Q11・Q39 の線引き（本家が持つ範囲は委ね、`.spec-workflow/` には書き込まない）とも衝突しない。
  何をどう作るかの中身と、接続先が具体的に何であるかは未定（Unanswered）。
- **Landed**: proposal.md → Technology（責務境界）／ui.md → Primary Flows / States

## Q41. 通知として出すのはどれですか？（ADR-0001 との関係を含む）

- **Intent**: `docs/adr/0001-do-not-derive-from-upstream-data.md`（採用済み）が「本家から受け取った情報を加工・再構成する仕様を勝手に入れるな。やるかやらないかはユーザーが決める」と定めている。一方で通知を出すには前回値との比較が要る。ここを決めないとステアリング文書に書けない。
- **Answer**: 本家と同じ4種のままでよい
- **Settled**: 本家 `NotificationProvider.tsx` が出している**4種をそのまま出す**。
  | 通知文 | 種別 | 条件 |
  |---|---|---|
  | `Task completed in <spec> (n/total)` | success | 完了数が増えた |
  | `Task started: <task> in <spec>` | info | in-progress に変わった |
  | `🎉 All tasks completed in <spec>!` | success | 全件完了になった |
  | `New approval request: <title>` | info | 承認の ID が増えた |

  4種とも**前回値との比較で成立する**。本家サーバーは前回値を持たず、`tasks.md` を毎回パースして「今の `taskList`」を作って送るだけで（`src/core/task-parser.ts` が `- [ ]` `- [-]` `- [x]` `- [~]` を pending / in-progress / completed / blocked に変換）、「何が起きたか」は受け取った側が前回と比べて初めて分かる。本家フロントも同じことをしている（`prevApprovalsRef` / `prevTaskDataRef`）。

  **ADR-0001 との関係**: この比較は stroke-board が独自に足す加工ではなく本家の踏襲であり、かつここでユーザーが明示的に決めたので「勝手に入れた仕様」には当たらない。
- **Landed**: ui.md → Surfaces（通知トースト）／proposal.md → Capabilities / Technology

## Unanswered

- **Nuxt UI v4 が要求する Tailwind CSS のメジャーバージョン** — 公式インストールページ（ui.nuxt.com）にバージョン要件の明記が無く確定できなかった。`@nuxt/ui` と `tailwindcss` を併せて入れる手順のみ記載。実装時に package.json の解決結果で確定する。ステアリングの記述はブロックしない。
- **stroke-board の「登録」が何を指すか** — Q39 で線引きは決まったが、登録だけは本家に `POST /api/projects/add` が実在する。stroke-board の登録がその API を叩くことなのか、走査対象の親パスを足すことなのか、まったく別のものなのかは中身（Q36 で保留）が決まるまで確定しない。
- ~~**base2/CLAUDE.md の Packages 節の扱い**~~ → **解決済み。** Q18 の決定に合わせて、`base2/CLAUDE.md` から Packages 節（`packages/README.md` と `npm run lint:boundaries` への参照）を削除した。どちらも実在しなかった。
