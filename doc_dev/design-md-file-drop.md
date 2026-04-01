# 設計書: .mdファイルのOutliner取り込み（ファイルピッカー方式）

## フロー

```
[outliner.js] ⋮メニュー「Import .md files」クリック
  → host.importMdFilesDialog(focusedNodeId)
  → postMessage({ type: 'importMdFilesDialog', targetNodeId })

[Host側] outlinerProvider.ts / notes-message-handler.ts
  → vscode.window.showOpenDialog({ canSelectMany: true, filters: { Markdown: ['md'] }})
  → ユーザーがファイル選択（またはキャンセル）
  → importMdFiles(filePaths, pageDir, imageDir)  ← markdown-import.ts
  → postMessage({ type: 'importMdFilesResult', results, targetNodeId, position: 'after' })

[outliner.js] importMdFilesResult 受信（既存コードをそのまま活用）
  → model.addNode() + isPage/pageId 設定
  → renderTree() + focusNode() + scheduleSyncToHost()
```

---

## 変更対象ファイル

### 変更

| ファイル | 変更内容 |
|---|---|
| `src/webview/outliner.js` | ⋮メニューに項目追加 + D&Dコード削除 + importMdFilesResult微修正（position固定） |
| `src/shared/outliner-host-bridge.js` | `importMdFiles` → `importMdFilesDialog` に変更 |
| `src/shared/notes-host-bridge.js` | `importMdFiles` → `importMdFilesDialog` に変更 |
| `src/outlinerProvider.ts` | `importMdFiles` → `importMdFilesDialog` に変更（showOpenDialog追加） |
| `src/shared/notes-message-handler.ts` | `importMdFiles` → `importMdFilesDialog` に変更 + NotesPlatformActionsに追加 |
| `src/notesEditorProvider.ts` | `importMdFilesDialog` platform action 実装 |
| `test/build-standalone-outliner.js` | `importMdFiles` → `importMdFilesDialog` に変更 |
| `test/build-standalone-notes.js` | `importMdFiles` → `importMdFilesDialog` に変更 |

### 維持（変更なし）

| ファイル | 理由 |
|---|---|
| `src/shared/markdown-import.ts` | 共通ロジックはそのまま |

---

## 詳細設計

### 1. outliner.js — ⋮メニュー項目追加

`toggleMenuDropdown()` 関数内、既存の4項目の後に追加:

```javascript
// Import .md files (全モード共通 — 条件分岐なし)
var importMdItem = document.createElement('button');
importMdItem.className = 'menu-item';
importMdItem.textContent = 'Import .md files...';
importMdItem.addEventListener('click', function() {
    dropdown.remove();
    host.importMdFilesDialog(focusedNodeId);
});
dropdown.appendChild(importMdItem);
```

`focusedNodeId` はフォーカス中のノードID。outliner.js 内で管理されている変数を確認して使用。

### 2. outliner.js — D&Dコード削除 (FD-8)

以下を削除:
- `hasExternalFiles()` 関数
- `handleExternalFileDrop()` 関数
- treeEl dragover の `&& !hasExternalFiles(e)` 条件
- treeEl drop の外部ファイルチェック（3行）
- ノードel dragover の `&& !hasExternalFiles(e)` 条件 + 循環参照チェック修正
- ノードel drop の外部ファイルチェック（4行）

dragover/drop ハンドラは元の状態に復元:
```javascript
// treeEl dragover — 元に戻す
treeEl.addEventListener('dragover', function(e) {
    if (!dragState) { return; }
    e.preventDefault();
});

// treeEl drop — 外部ファイルチェックを削除
// 元のコード（dragState チェック→ルート末尾移動）のみ残す

// ノードel dragover — 元に戻す
if (!dragState) { return; }
// 循環参照チェックは常に実行（if (dragState) ガード不要に戻す）

// ノードel drop — 外部ファイルチェックを削除
// 元のコード（dragState チェック→位置計算→moveNode）のみ残す
```

### 3. HostBridge — `importMdFilesDialog` メソッド

**outliner-host-bridge.js:**
```javascript
importMdFilesDialog: function(targetNodeId) {
    api.postMessage({ type: 'importMdFilesDialog', targetNodeId: targetNodeId });
},
```

**notes-host-bridge.js:**
```javascript
importMdFilesDialog: function(targetNodeId) {
    api.postMessage({ type: 'importMdFilesDialog', targetNodeId: targetNodeId });
},
```

既存の `importMdFiles` メソッドは削除。

### 4. outlinerProvider.ts — ハンドラ変更

既存の `importMdFiles` case を `importMdFilesDialog` に変更し、`showOpenDialog` を追加:

```typescript
case 'importMdFilesDialog': {
    const options: vscode.OpenDialogOptions = {
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        filters: { 'Markdown': ['md'] },
        title: 'Import .md files'
    };
    const fileUris = await vscode.window.showOpenDialog(options);
    if (!fileUris || fileUris.length === 0) break;

    const filePaths = fileUris.map(u => u.fsPath).sort();
    const pageDir = this.getPagesDirPath(document);
    const imageDir = path.join(pageDir, 'images');
    const results = importMdFiles(filePaths, pageDir, imageDir);

    webviewPanel.webview.postMessage({
        type: 'importMdFilesResult',
        results,
        targetNodeId: message.targetNodeId,
        position: 'after'
    });
    break;
}
```

### 5. notes-message-handler.ts — ハンドラ変更

`NotesPlatformActions` インターフェースに新メソッドを追加:

```typescript
importMdFilesDialog(targetNodeId: string | null): void;
```

case ハンドラを変更:
```typescript
case 'importMdFilesDialog':
    platform.importMdFilesDialog(message.targetNodeId);
    break;
```

### 6. notesEditorProvider.ts — platform action 実装

```typescript
importMdFilesDialog: async (targetNodeId: string | null) => {
    const options: vscode.OpenDialogOptions = {
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        filters: { 'Markdown': ['md'] },
        title: 'Import .md files'
    };
    const fileUris = await vscode.window.showOpenDialog(options);
    if (!fileUris || fileUris.length === 0) return;

    const filePaths = fileUris.map(u => u.fsPath).sort();
    const pagesDir = fileManager.getPagesDirPath();
    const imageDir = path.join(pagesDir, 'images');
    const results = importMdFiles(filePaths, pagesDir, imageDir);

    panel.webview.postMessage({
        type: 'importMdFilesResult',
        results,
        targetNodeId,
        position: 'after'
    });
},
```

### 7. テスト用HostBridge

**build-standalone-outliner.js / build-standalone-notes.js:**
```javascript
importMdFilesDialog: function(targetNodeId) {
    window.__testApi.messages.push({ type: 'importMdFilesDialog', targetNodeId: targetNodeId });
},
```

---

## デグレ防止チェック

| 既存機能 | 影響 | 理由 |
|---|---|---|
| ノードD&D | なし | D&D削除は外部ファイル部分のみ。dragState ベースの既存ロジックを元に戻す |
| 画像D&D | なし | imageDragState ベースのロジックに変更なし |
| ⋮メニュー既存項目 | なし | 新項目を末尾に追加するのみ |
| ページ作成(@page) | なし | 別のコードパス |
| importMdFilesResult受信 | なし | ハンドラは維持。position='after'固定に簡略化 |
