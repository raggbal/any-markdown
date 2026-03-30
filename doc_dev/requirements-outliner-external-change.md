# 要件定義書 — Outliner外部変更検知・同期

## 背景

Markdown editor (.md) は、同一ファイルを外部プロセス（テキストエディタ、Claude、git等）が変更した場合に、以下の2層で変更を検知し、webviewにリアルタイム反映する:

1. `onDidChangeTextDocument` — VSCode内の他エディタからの変更検知
2. `FileSystemWatcher` — VSCode外部プロセスからの変更検知

さらにwebview側では、ユーザーが編集中の場合は外部変更をキューし、アイドル時にカーソル保持で適用する。

Outliner editor (.out) は、この機構が不十分または欠如している:

| 層 | Markdown editor | Outliner standalone | Notes経由Outliner |
|---|---|---|---|
| `onDidChangeTextDocument` | あり | あり（モデル全置換） | **なし** |
| `FileSystemWatcher` | あり | **なし** | ファイル作成/削除のみ |
| webview編集中ガード | あり（キュー+アイドル適用） | **なし** | **なし** |

---

## 要件

### レベルA: Notes経由の外部変更検知

| No | 要件 |
|---|---|
| A-1 | Notes editorで現在開いている.outファイルが外部から変更された場合、webviewに変更を反映する |
| A-2 | NotesFileManager自身による書き込み（syncData→saveCurrentFile→_writeFile）は外部変更として検知しない（自己書き込みガード） |
| A-3 | 外部変更検知時のupdateDataメッセージには `fileChangeId` を**含めない**（ファイル切替と区別するため） |
| A-4 | ファイル切替時（openFile呼び出し時）は外部変更監視対象を新ファイルに切り替える |
| A-5 | パネル破棄時に監視リソースを確実にdispose |

### レベルB: Outliner standaloneの FileSystemWatcher追加

| No | 要件 |
|---|---|
| B-1 | Outliner standalone (.out直接開き) で、VSCode外部プロセスからのファイル変更を検知する |
| B-2 | FileSystemWatcher検知時、VSCodeドキュメントを更新し、webviewに反映する |
| B-3 | outlinerProvider自身による書き込み（syncData→applyEdit）は外部変更として検知しない（`isApplyingOwnEdit` フラグ連携） |
| B-4 | FileSystemWatcherで更新した場合は `onDidChangeTextDocument` のハンドラが重複発火しないようにする |
| B-5 | パネル破棄時にFileSystemWatcherを確実にdispose |

### レベルC: outliner.js webview側の編集中ガード

| No | 要件 |
|---|---|
| C-1 | ユーザーが編集中（テキスト入力、ノード操作中）の場合、外部変更をキューする |
| C-2 | ユーザーがアイドル状態（一定時間操作なし）になったら、キューした外部変更を適用する |
| C-3 | 外部変更適用時は、フォーカスノード・カーソル位置・スコープを可能な限り保持する |
| C-4 | 外部変更適用時は undo/redo スタックをクリアする（外部変更後のundoは意味が変わるため） |
| C-5 | Notes モードのファイル切替（fileChangeId付きupdateData）は従来通り全リセットする（検索・スコープ・ナビ履歴のリセット）。編集中ガードは適用しない |
| C-6 | 複数の外部変更が編集中に到着した場合、最新のもののみを保持する（中間状態は破棄） |
| C-7 | アイドル検知のタイムアウトは1.5秒（Markdown editorと同じ） |

---

## 非要件（対象外）

| No | 対象外事項 | 理由 |
|---|---|---|
| X-1 | 外部変更時のconflict resolution（マージ）| Markdown editorも実装していない。last-write-winsで十分 |
| X-2 | Outliner webviewのブロック単位diff | OutlinerはJSON tree構造であり、Markdownのブロック単位diffとは根本的に異なる。モデル全置換+フォーカス復元が適切 |
| X-3 | 複数ウィンドウ間のリアルタイム同期 | VSCodeの`supportsMultipleEditorsPerDocument: false`で複数タブは防止済み |
| X-4 | Notes←→Outliner standalone間の同時編集のリアルタイム同期 | 同一ファイルを両方で開くユースケースは稀。外部変更検知で十分 |

---

## テスト観点

| No | テスト内容 |
|---|---|
| T-1 | Outliner standalone: 外部プロセスが.outファイルを変更 → webviewに反映 |
| T-2 | Notes: 外部プロセスが現在表示中の.outファイルを変更 → webviewに反映 |
| T-3 | 自己書き込みで誤検知しないこと（無限ループにならないこと） |
| T-4 | 編集中に外部変更 → キューされ、編集停止後に反映 |
| T-5 | 編集中に複数回外部変更 → 最新のみ反映 |
| T-6 | Notes: ファイル切替 → 従来通り全リセット（検索・スコープ等） |
| T-7 | Notes: ファイル切替中に旧ファイルの外部変更が到着 → 無視 |
| T-8 | パネル破棄後に外部変更 → エラーにならない |
| T-9 | 外部変更適用後もフォーカスノード・スコープが保持される |
| T-10 | 既存のOutliner機能（編集・検索・スコープ・ページ・タグ）が正常動作 |
