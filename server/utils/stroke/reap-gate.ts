/**
 * 起動時の後始末（`server/plugins/01.reap-running.ts`）の完了を、巡回
 * （`server/plugins/01.retry-failed.ts`）へ伝える門（tasks 3.1・3.2、design.md
 * Decision 3「後始末が済むまで、その対象への起動を行ってはならない」）。
 *
 * ファイル名の並び順（`01.` 同士）だけでは Nitro のプラグイン実行順は保証されない
 * ため、明示的な待ち合わせをモジュール変数で持つ。両プラグインは同じ Nitro プロセスの
 * 同じモジュールインスタンスを import するので、これで足りる（接続表・busy ガードと
 * 同じ「単一プロセスのメモリで足りる」前提）。
 *
 * **後始末が失敗して終わっても、この門は必ず開く。** `beginReap` に渡す Promise が
 * reject しても `awaitReap` は reject しない——巡回側の `await` が例外を投げて以後
 * 何もしなくなるのを防ぐ（tasks 3.2「後始末の失敗で巡回が永久に止まらない」）。
 */

let gate: Promise<void> | undefined

/** 後始末プラグインが、後始末を始めると同時に呼ぶ。 */
export function beginReap(task: Promise<unknown>): void {
  gate = task.then(
    () => undefined,
    () => undefined,
  )
}

/**
 * 巡回プラグインが、最初の周回の前に呼ぶ。
 *
 * `beginReap` がまだ呼ばれていなければ即座に解決する——後始末プラグインが無効化・
 * 削除されていても巡回が永久に止まらないための保険（本 change の範囲では常に
 * `beginReap` が先に呼ばれる）。
 */
export async function awaitReap(): Promise<void> {
  if (gate === undefined) return
  await gate
}

/** テスト用。モジュール変数を初期状態へ戻す。 */
export function resetReapGateForTest(): void {
  gate = undefined
}
