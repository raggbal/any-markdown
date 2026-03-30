# 設計書 — 全エディタ複数パネル間同期

## 変更対象ファイル一覧

| ファイル | 変更内容 | 要件 |
|---------|---------|------|
| `src/extension.ts` | `supportsMultipleEditorsPerDocument: true` に変更 | MP-1 |
| `src/notesEditorProvider.ts` | 複数パネル管理アーキテクチャに変更 | NMP-1〜7 |

**変更しないファイル（v0.195.548で対応済み）:**
- `src/editorProvider.ts` — クロージャベースで既に複数パネル対応
- `src/outlinerProvider.ts` — 同上
- `src/webview/editor.js` — 変更不要
- `src/webview/outliner.js` — 編集中ガード追加済み
- `src/shared/notes-file-manager.ts` — isWriting/updateLastKnownContent追加済み
- `src/shared/notes-message-handler.ts` — 変更不要
- `src/shared/notes-host-bridge.js` — 変更不要

---

## Part 1: Markdown / Outliner standalone

### 設計方針

`resolveCustomTextEditor` 内の全状態がローカルクロージャで管理されているため、
`supportsMultipleEditorsPerDocument: true` に変更するだけで複数パネル間同期が動作する。

### 同期メカニズム（既存の仕組みがそのまま動作）

```
Panel A で編集:
  → scheduleEdit(content) → isApplyingOwnEdit_A = true → WorkspaceEdit
  → onDidChangeTextDocument 発火
  → Panel A: isApplyingOwnEdit_A = true → skip (自分の編集)
  → Panel B: isApplyingOwnEdit_B = false → 検知 → webviewに update/updateData 送信
  → Panel B の webview: 編集中ガード判定 → 適用 or キュー
```

### 変更箇所: extension.ts

```typescript
// Line 29: false → true
supportsMultipleEditorsPerDocument: true,

// Line 44: false → true
supportsMultipleEditorsPerDocument: true,
```

### activeWebviewPanel の動作確認

`editorProvider.ts` と `outlinerProvider.ts` の `activeWebviewPanel` は
undo/redo コマンド転送用。`onDidChangeViewState` で最後にアクティブになった
パネルに設定される。複数パネル時も最後にフォーカスしたパネルが受け取るので正しい動作。

### デグレリスク: なし

- 全状態がクロージャ内 → パネル間の状態汚染なし
- `onDidChangeTextDocument` は document URI でフィルタ済み → 他ファイルのパネルに影響なし
- `FileSystemWatcher` もファイル単位 → 影響範囲限定
- `isApplyingOwnEdit` がパネル独立 → 無限ループなし
- dispose もパネル独立 → リソースリーク なし

---

## Part 2: Notes editor

### 設計方針

Notes editorは WebviewPanel を使用し、`this.panel`（単一参照）で管理している。
これを**複数パネル管理**に変更する。

核心的アイデア: **各パネルが独自の NotesFileManager を持ち、FileSystemWatcher で
他パネルの変更を検知する。** v0.195.548 で追加した `folderWatcher.onDidChange` +
`isWriting` フラグがこの基盤となる。

### アーキテクチャ変更

#### Before (単一パネル)

```typescript
class NotesEditorProvider {
    private panel: WebviewPanel | undefined;
    private fileManager: NotesFileManager | undefined;
    private currentFolderPath: string | undefined;
    private folderWatcher: FileSystemWatcher | undefined;
    private disposables: Disposable[] = [];
}
```

#### After (複数パネル)

```typescript
interface NotesPanelContext {
    panel: vscode.WebviewPanel;
    fileManager: NotesFileManager;
    folderPath: string;
    sidePanel: SidePanelManager;
    disposables: vscode.Disposable[];
    folderWatcher: vscode.FileSystemWatcher;
}

class NotesEditorProvider {
    private panels: Map<vscode.WebviewPanel, NotesPanelContext> = new Map();
}
```

### openNotesFolder の変更

```typescript
async openNotesFolder(folderPath: string): Promise<void> {
    // ★ disposePanel() を呼ばない — 既存パネルを閉じない

    // フォルダ存在確認
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        vscode.window.showErrorMessage(`Notes folder not found: ${folderPath}`);
        return;
    }

    // ★ 各パネル独自の NotesFileManager
    const fileManager = new NotesFileManager(folderPath);
    const noteStructure = fileManager.loadStructure();
    // ... (ファイル一覧取得、初期ファイル読み込みは既存ロジック)

    // WebviewPanel 作成
    const panel = vscode.window.createWebviewPanel(...);

    // ★ パネル固有の SidePanelManager
    const sidePanel = new SidePanelManager(
        {
            postMessage: (msg: any) => panel.webview.postMessage(msg),
            asWebviewUri: (uri: vscode.Uri) => panel.webview.asWebviewUri(uri),
        },
        { logPrefix: '[Notes]' }
    );

    // ★ パネル固有の sender (this.panel → panel)
    const sender: NotesSender = {
        postMessage: (msg: unknown) => { panel.webview.postMessage(msg); },
    };

    // ★ platform actions も panel / fileManager をキャプチャ (this.xxx → ローカル変数)
    const platform: NotesPlatformActions = {
        openExternalLink: (href) => { ... },  // panel, fileManager を直接参照
        // ...
    };

    // メッセージハンドラ登録
    const disposables: vscode.Disposable[] = [];
    disposables.push(
        panel.webview.onDidReceiveMessage((message) => {
            if (!fileManager) return;
            handleNotesMessage(message, fileManager, sender, platform);
        })
    );

    // ★ パネル固有の folderWatcher
    const folderWatcher = this.createFolderWatcher(folderPath, panel, fileManager);
    disposables.push(folderWatcher);

    // テーマ変更対応
    disposables.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            // panel, fileManager をローカル参照
        })
    );

    // ★ パネル管理マップに登録
    const ctx: NotesPanelContext = {
        panel, fileManager, folderPath, sidePanel, disposables, folderWatcher
    };
    this.panels.set(panel, ctx);

    // パネル破棄時のクリーンアップ
    panel.onDidDispose(() => {
        this.disposePanelContext(ctx);
    });
}
```

### パネル間同期メカニズム

**v0.195.548で追加済みのFileSystemWatcher `onDidChange` がそのまま使える。**

```
Panel A で編集:
  → syncData → fileManager_A.saveCurrentFile() → _writeFile()
  → fileManager_A.isWriting = true (300ms)

FileSystemWatcher fires (フォルダ内の *.out 変更):
  → Panel A のハンドラ: fileManager_A.isWriting = true → skip (自分の書き込み)
  → Panel B のハンドラ: fileManager_B.isWriting = false → 検知 → ファイル読み込み
    → content !== fileManager_B.getLastKnownContent() → updateData 送信
    → fileManager_B.updateLastKnownContent(content)
```

**重要**: 各パネルが独自の `fileManager` を持つため、`isWriting` フラグは
書き込んだパネルの fileManager にのみ設定される。他パネルの fileManager は
`isWriting = false` のままなので、変更を正しく検知する。

### createFolderWatcher メソッド

```typescript
private createFolderWatcher(
    folderPath: string,
    panel: vscode.WebviewPanel,
    fileManager: NotesFileManager
): vscode.FileSystemWatcher {
    const pattern = new vscode.RelativePattern(vscode.Uri.file(folderPath), '*.out');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // ファイル作成/削除 → ファイル一覧更新
    const refreshFileList = () => {
        (fileManager as any).structure = null;
        const structure = fileManager.loadStructure();
        const fileList = fileManager.listFiles();
        const currentFile = fileManager.getCurrentFilePath();
        panel.webview.postMessage({
            type: 'notesFileListChanged',
            fileList, structure, currentFile,
        });
    };

    watcher.onDidCreate(refreshFileList);
    watcher.onDidDelete(refreshFileList);

    // ファイル変更 → 現在表示中ファイルの外部変更検知
    watcher.onDidChange((uri) => {
        const currentFile = fileManager.getCurrentFilePath();
        if (!currentFile) return;
        if (uri.fsPath !== currentFile) return;
        if (fileManager.getIsWriting()) return;

        setTimeout(() => {
            try {
                if (fileManager.getIsWriting()) return;
                const content = fs.readFileSync(currentFile, 'utf8');
                if (content === fileManager.getLastKnownContent()) return;
                const data = JSON.parse(content);
                panel.webview.postMessage({ type: 'updateData', data });
                fileManager.updateLastKnownContent(content);
            } catch { /* ignore */ }
        }, 200);
    });

    return watcher;
}
```

### disposePanelContext メソッド

```typescript
private disposePanelContext(ctx: NotesPanelContext): void {
    ctx.fileManager.dispose();
    ctx.sidePanel.disposeFileWatcher();
    ctx.folderWatcher.dispose();
    ctx.disposables.forEach(d => d.dispose());
    this.panels.delete(ctx.panel);
}
```

### refreshPanel の変更

`this.panel` / `this.fileManager` への参照を削除。
代わりにパネル固有のコンテキストを使用。

```typescript
// 既存の refreshPanel は削除
// 代わりに各パネルのconfiguration changeハンドラ内で直接リフレッシュ
```

### this.panel / this.fileManager / this.currentFolderPath の削除

全ての `this.panel`、`this.fileManager`、`this.currentFolderPath` 参照を
ローカル変数 (`panel`, `fileManager`, `folderPath`) に置き換える。

**変更前**: `this.panel?.webview.postMessage(msg)`
**変更後**: `panel.webview.postMessage(msg)`

**変更前**: `if (!this.fileManager) return;`
**変更後**: `if (!fileManager) return;`  (クロージャキャプチャ)

### platform actions の変更

全 23 の platform action で `this.panel` → `panel`、`this.fileManager` → `fileManager` に変更。
`this.currentFolderPath` → `folderPath` に変更。

これにより各 action closure は自身のパネルコンテキストのみを参照する。

### S3 同期の対応

S3 操作は `runS3Operation` メソッドで実行される。
現在は `this.fileManager` を参照しているため、パネルコンテキスト経由に変更:

```typescript
// platform actions 内で呼び出す際にfileManagerを引数で渡す
s3Sync: async (bucketPath: string) => {
    await this.runS3Operation('s3Sync', bucketPath, sender, fileManager, folderPath);
},
```

### disposePanel の変更

既存の `disposePanel()` は不要になる（各パネルが独自にdispose）。
ただし後方互換のため、全パネルをdisposeする `disposeAllPanels()` を用意:

```typescript
private disposeAllPanels(): void {
    for (const ctx of this.panels.values()) {
        ctx.panel.dispose(); // → onDidDispose → disposePanelContext
    }
}
```

---

## 既存機能への影響分析

### extension.ts

| 項目 | 影響 | 対策 |
|------|------|------|
| `supportsMultipleEditorsPerDocument` | `false` → `true` | VSCodeが複数パネルを許可 |
| 他の登録設定 | なし | 変更なし |

### editorProvider.ts (Markdown)

| 項目 | 影響 | 対策 |
|------|------|------|
| `resolveCustomTextEditor` | 同じドキュメントで複数回呼ばれる可能性 | クロージャベースで問題なし |
| `activeWebviewPanel` | 最後にアクティブなパネルのみ追跡 | undo/redo転送は最後のパネルのみ（正しい動作） |
| `onDidChangeTextDocument` | 複数パネルで重複発火 | 各パネルの`isApplyingOwnEdit`で自己編集フィルタ |
| `FileSystemWatcher` | 複数パネルで重複 | 同じファイルの変更は全パネルに通知（正しい動作） |

### outlinerProvider.ts (Outliner standalone)

| 項目 | 影響 | 対策 |
|------|------|------|
| 同上 | 同上 | 同上 |

### notesEditorProvider.ts (Notes)

| 項目 | 影響 | 対策 |
|------|------|------|
| アーキテクチャ | 単一パネル → 複数パネル | `panels: Map` + `NotesPanelContext` |
| `this.panel` 参照(45箇所) | 全てローカル変数に変更 | クロージャキャプチャ |
| `this.fileManager` 参照(36箇所) | 全てローカル変数に変更 | クロージャキャプチャ |
| FileSystemWatcher | パネル毎に独立 | `createFolderWatcher` メソッド |
| S3同期 | `this.fileManager` → 引数 | `runS3Operation` の引数追加 |
| SidePanelManager | パネル毎に独立 | ローカル変数キャプチャ |
| ファイル切替 | fileChangeId付きupdateData | 変更なし（パネル毎のfileManagerが管理） |

### outliner.js (webview側)

| 項目 | 影響 | 対策 |
|------|------|------|
| `updateData` ハンドラ | v0.195.548で対応済み | fileChangeIdなし=外部変更として処理 |
| 編集中ガード | v0.195.548で対応済み | `markActivelyEditing`/`applyQueuedExternalUpdate` |

---

## 実装計画

### STEP 1: extension.ts の変更

`supportsMultipleEditorsPerDocument: true` に変更（2行）。

### STEP 2: notesEditorProvider.ts のリファクタリング

1. `NotesPanelContext` インタフェース定義
2. `this.panel` → `this.panels: Map<WebviewPanel, NotesPanelContext>`
3. `this.fileManager`, `this.currentFolderPath`, `this.folderWatcher`, `this.disposables` 削除
4. `openNotesFolder` 内の全 `this.panel` / `this.fileManager` / `this.currentFolderPath` をローカル変数に変更
5. platform actions の全 `this.xxx` 参照をローカル変数に変更
6. `createFolderWatcher` メソッド新規作成
7. `disposePanelContext` メソッド新規作成
8. `disposePanel` → `disposePanelContext` に変更
9. `refreshPanel` をクロージャ内のローカル関数に変更
10. `runS3Operation` のシグネチャ変更（fileManager, folderPath を引数追加）

### STEP 3: コンパイル・テスト

1. `npm run compile` 通過確認
2. `npx playwright test` 全テスト通過確認

### STEP 4: 手動検証

1. Markdown: 同ファイル2パネル → 片方編集 → 他方に反映
2. Outliner: 同上
3. Notes: 同フォルダ2パネル → 片方編集 → 他方に反映
4. Notes: ファイル作成/削除 → 他パネルの一覧更新
5. 単一パネルの既存機能全て正常動作
