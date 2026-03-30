# 要件定義書 — Notes editor 複数パネル間同期

## 背景

Notes editor はVSCodeの WebviewPanel を使用しており、CustomTextEditor ではない。
そのため `supportsMultipleEditorsPerDocument` の制約が適用されず、Activity Barで
Cmd+clickすると同じ.noteフォルダを複数タブで開くことができる。

現状、`openNotesFolder` が `async` メソッドのため、高速な連続呼び出しで
レースコンディションが発生し、複数パネルが生成される。しかし
`this.panel`（単一参照）は最後のパネルのみを追跡し、先に開いたパネルは
管理対象から外れる（孤児化）。結果:

- 孤児パネルでの編集は保存されない（fileManagerが切り替わっている）
- 孤児パネルに外部変更が反映されない
- 孤児パネルのリソース（SidePanelManager等）がリークする

**注:** Markdown editor / Outliner standalone は `supportsMultipleEditorsPerDocument: false`
により VSCode プラットフォームレベルで複数タブが防止されている。
外部プロセスからの変更検知は v0.195.548 で対応済み。

---

## 要件

### 複数パネルの正式サポート

| No | 要件 |
|---|---|
| NMP-1 | 同じ.noteフォルダを複数パネルで開くことを正式にサポートする |
| NMP-2 | 各パネルは独立した状態（currentFilePath, undo/redo, scope, 検索）を持つ |
| NMP-3 | あるパネルで.outファイルを編集→保存した場合、同じファイルを表示中の他パネルに変更が反映される |
| NMP-4 | あるパネルでファイル作成/削除/名前変更した場合、同じフォルダの他パネルのファイル一覧が更新される |
| NMP-5 | 外部プロセスからの.out変更も全パネルに反映される（v0.195.548機能の拡張） |
| NMP-6 | 各パネルを閉じた際、そのパネルのリソースのみが確実にdisposeされる（他パネルに影響しない） |
| NMP-7 | 全パネルを閉じた際、全リソースが確実にdisposeされる |

### 同期の動作仕様

| No | 要件 |
|---|---|
| NMP-8 | パネル間同期時はfileChangeIdを含めない（ファイル切替と区別する） |
| NMP-9 | 同期時にユーザーが編集中の場合、編集中ガード（v0.195.548 レベルC）が適用される |
| NMP-10 | ファイル一覧更新時も、各パネルの現在表示中ファイルは維持される |

### デグレ防止

| No | 要件 |
|---|---|
| NMP-11 | 単一パネルで使う場合の既存動作が一切変わらないこと |
| NMP-12 | S3同期、Daily Notes、ページ操作など全既存機能が正常動作すること |
| NMP-13 | Notes左パネルの開閉・幅変更が各パネルで独立動作すること |

---

## 非要件（対象外）

| No | 対象外事項 | 理由 |
|---|---|---|
| X-1 | Markdown editor の複数タブ同期 | `supportsMultipleEditorsPerDocument: false` でVSCodeが防止済み |
| X-2 | Outliner standalone の複数タブ同期 | 同上 |
| X-3 | Notes←→Outliner standalone間の同時編集同期 | 別エディタタイプ間はFileSystemWatcher（v0.195.548）で対応済み |
| X-4 | パネル間のリアルタイムカーソル共有 | 不要 |
