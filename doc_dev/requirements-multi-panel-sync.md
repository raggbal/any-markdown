# 要件定義書 — 全エディタ複数パネル間同期

## 背景

同じファイルをVSCodeの複数タブグループで開いて編集する場合、
各パネル間で変更が同期される必要がある。

現状、3つのエディタタイプがある:

| エディタ | API | 複数パネル | 現状の同期 |
|---------|-----|----------|----------|
| Markdown (.md) | CustomTextEditor | `supportsMultipleEditorsPerDocument: false` | 外部変更検知あり、パネル間同期なし |
| Outliner standalone (.out) | CustomTextEditor | `supportsMultipleEditorsPerDocument: false` | 外部変更検知あり(v0.195.548)、パネル間同期なし |
| Notes (.note) | WebviewPanel | 複数パネル可能 | 外部変更検知あり(v0.195.548)、パネル間同期なし |

### 複数パネルが発生するケース

1. Explorerでファイルを開く → タブをドラッグして別タブグループに移動 → 再度Explorerで同ファイルを開く
2. Notes: Activity BarでCmd+clickでフォルダを開く
3. 外部プロセス（テキストエディタ、Claude、git）からの変更

---

## 要件

### Markdown / Outliner standalone (CustomTextEditor)

| No | 要件 |
|---|---|
| MP-1 | `supportsMultipleEditorsPerDocument` を `true` に変更し、同じファイルの複数パネルを正式サポート |
| MP-2 | あるパネルで編集した内容が、同じファイルを表示中の他パネルに反映される |
| MP-3 | 外部プロセスからの変更も全パネルに反映される（v0.195.548機能を維持） |
| MP-4 | 各パネルのリソース（イベントリスナー、FileSystemWatcher等）がパネル閉じ時に確実にdisposeされる |
| MP-5 | 単一パネルで使う場合の既存動作が一切変わらないこと |

### Notes editor (WebviewPanel)

| No | 要件 |
|---|---|
| NMP-1 | 同じ.noteフォルダを複数パネルで開くことを正式にサポートする |
| NMP-2 | 各パネルは独立した状態（currentFilePath, undo/redo, scope, 検索）を持つ |
| NMP-3 | あるパネルで.outファイルを編集→保存した場合、同じファイルを表示中の他パネルに変更が反映される |
| NMP-4 | あるパネルでファイル作成/削除/名前変更した場合、同じフォルダの他パネルのファイル一覧が更新される |
| NMP-5 | 外部プロセスからの.out変更も全パネルに反映される |
| NMP-6 | 各パネルを閉じた際、そのパネルのリソースのみが確実にdisposeされる（他パネルに影響しない） |
| NMP-7 | 全パネルを閉じた際、全リソースが確実にdisposeされる |

### 同期の動作仕様（共通）

| No | 要件 |
|---|---|
| SY-1 | パネル間同期時にユーザーが編集中の場合、編集中ガード（v0.195.548 レベルC）が適用される |
| SY-2 | Notes: パネル間同期時はfileChangeIdを含めない（ファイル切替と区別する） |
| SY-3 | Notes: ファイル一覧更新時も、各パネルの現在表示中ファイルは維持される |

### デグレ防止

| No | 要件 |
|---|---|
| DG-1 | 単一パネルで使う場合の既存動作が一切変わらないこと |
| DG-2 | S3同期、Daily Notes、ページ操作など全既存機能が正常動作すること |
| DG-3 | undo/redo が各パネルで独立動作すること |
