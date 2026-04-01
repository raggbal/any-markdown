# 設計書 — Outliner ページパスコピー機能

## アーキテクチャ概要

webview側（outliner.js）はノードの `pageId` のみ保持しており、ファイルのフルパスを知らない。
そのため、webview → ホスト間メッセージで `pageId` 配列を送信し、ホスト側でフルパスを解決してクリップボードに書き込む。

```
outliner.js
  → host.copyPagePaths(pageIds: string[])
  → outliner-host-bridge.js / notes-host-bridge.js
    → postMessage({ type: 'copyPagePaths', pageIds: [...] })
  → outlinerProvider.ts / notes-message-handler.ts
    → getPageFilePath(document, pageId) で各pageIdを解決
    → vscode.env.clipboard.writeText(paths.join('\n'))
```

---

## 変更対象ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/webview/outliner.js` | コンテキストメニュー項目追加 + Cmd+Shift+Cキーハンドラ追加 |
| `src/shared/outliner-host-bridge.js` | `copyPagePaths(pageIds)` メソッド追加 |
| `src/shared/notes-host-bridge.js` | `copyPagePaths(pageIds)` メソッド追加 |
| `src/outlinerProvider.ts` | `copyPagePaths` メッセージハンドラ追加 |
| `src/shared/notes-message-handler.ts` | `NotesPlatformActions` に `copyPagePaths` 追加 + ハンドラ追加 |
| `src/notesEditorProvider.ts` | `copyPagePaths` platform実装追加 |
| `src/i18n/locales/*.ts` | `outlinerCopyPagePath` キー追加（7言語） |
| `test/build-standalone-outliner.js` | テスト用HostBridgeに `copyPagePaths` 追加 |
| `test/build-standalone-notes.js` | テスト用HostBridgeに `copyPagePaths` 追加 |

---

## 詳細設計

### 1. outliner.js — コンテキストメニュー

`showContextMenu(nodeId, x, y)` 内の「ページ操作」セクションに追加。

#### 単一ノード右クリック時

```javascript
// 既存: ページノードの場合
if (node.isPage) {
    addMenuItem(..., 'Open Page', ...);
    // ★追加: Copy Page Path
    addMenuItem(contextMenuEl, i18n.outlinerCopyPagePath || 'Copy Page Path', function() {
        host.copyPagePaths([node.pageId]);
        hideContextMenu();
    }, modLabel + '+Shift+C');
    addMenuItem(..., 'Delete Page', ...);
}
```

#### 複数選択中の右クリック時

コンテキストメニューの先頭（ページ操作セクション）で、複数選択中かつ選択ノードにページノードが含まれる場合に「Copy Page Path」を表示する。

```javascript
// 複数選択中の場合
if (selectedNodeIds.size > 0) {
    var selectedPageIds = [];
    // DOM表示順でソート
    var sortedIds = model.getFlattenedIds(true).filter(function(id) {
        return selectedNodeIds.has(id);
    });
    sortedIds.forEach(function(id) {
        var n = model.getNode(id);
        if (n && n.isPage && n.pageId) {
            selectedPageIds.push(n.pageId);
        }
    });
    if (selectedPageIds.length > 0) {
        addMenuItem(contextMenuEl, i18n.outlinerCopyPagePath || 'Copy Page Path', function() {
            host.copyPagePaths(selectedPageIds);
            hideContextMenu();
        }, modLabel + '+Shift+C');
        addMenuSeparator(contextMenuEl);
    }
}
```

**複数選択時のメニュー構成方針:**
- 複数選択中は「Copy Page Path」のみを複数選択用として先頭に表示する
- 残りのメニュー項目（Open Page, Delete Page, Add Sibling等）は、右クリックされた個別ノードに対する操作として従来通り表示する
- これは既存のメニュー構成を変更しないため、デグレリスクが最小限

### 2. outliner.js — キーボードショートカット

`handleNodeKeydown()` 内の既存の `case 'c':` ブロック（Cmd+C）の**前**に、`Shift+C` の判定を追加する。

```javascript
case 'c':
    if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        // Cmd+Shift+C: Copy Page Path
        e.preventDefault();
        e.stopPropagation();
        
        if (selectedNodeIds.size > 0) {
            // 複数選択時: 選択ノード中のページノードのパスをコピー
            var pageIds = [];
            var sortedIds = model.getFlattenedIds(true).filter(function(id) {
                return selectedNodeIds.has(id);
            });
            sortedIds.forEach(function(id) {
                var n = model.getNode(id);
                if (n && n.isPage && n.pageId) {
                    pageIds.push(n.pageId);
                }
            });
            if (pageIds.length > 0) {
                host.copyPagePaths(pageIds);
            }
        } else {
            // 単一ノード: フォーカス中のノードがページノードならパスをコピー
            if (node.isPage && node.pageId) {
                host.copyPagePaths([node.pageId]);
            }
        }
        break;
    }
    // 以下は既存の Cmd+C 処理（変更なし）
    ...
```

**注意:** `case 'c':` 内で `e.shiftKey` を先に判定するため、既存の Cmd+C 処理（`!e.shiftKey` の場合）には影響しない。

### 3. outliner-host-bridge.js

```javascript
copyPagePaths: function(pageIds) {
    api.postMessage({ type: 'copyPagePaths', pageIds: pageIds });
}
```

### 4. notes-host-bridge.js

```javascript
copyPagePaths: function(pageIds) {
    api.postMessage({ type: 'copyPagePaths', pageIds: pageIds });
}
```

### 5. outlinerProvider.ts — メッセージハンドラ

`case 'copyFilePath':` の近くに追加:

```typescript
case 'copyPagePaths': {
    const pageIds: string[] = message.pageIds || [];
    const paths = pageIds
        .map((pid: string) => this.getPageFilePath(document, pid))
        .filter((p: string) => fs.existsSync(p));
    if (paths.length > 0) {
        await vscode.env.clipboard.writeText(paths.join('\n'));
    }
    break;
}
```

### 6. notes-message-handler.ts — メッセージハンドラ

`NotesPlatformActions` インターフェースに `copyPagePaths` メソッドを追加し、`case 'copyFilePath':` の近くにハンドラを追加:

**notes-message-handler.ts（インターフェース追加）:**
```typescript
// NotesPlatformActions に追加
copyPagePaths?(paths: string[]): void;
```

**notes-message-handler.ts（ハンドラ追加）:**
```typescript
case 'copyPagePaths': {
    const pageIds: string[] = message.pageIds || [];
    const paths = pageIds
        .map((pid: string) => fileManager.getPageFilePath(pid))
        .filter((p: string) => fs.existsSync(p));
    if (paths.length > 0) {
        platform.copyPagePaths?.(paths);
    }
    break;
}
```

**notesEditorProvider.ts（platform実装追加）:**
```typescript
copyPagePaths: (paths: string[]) => {
    vscode.env.clipboard.writeText(paths.join('\n'));
},
```

既存の `copyFilePath` パターン（platform経由でクリップボード書き込み）に準拠。

### 7. i18n — 7言語対応

各ロケールファイルに `outlinerCopyPagePath` キーを追加:

| 言語 | キー | 値 |
|---|---|---|
| en | `outlinerCopyPagePath` | `'Copy Page Path'` |
| ja | `outlinerCopyPagePath` | `'ページパスをコピー'` |
| ko | `outlinerCopyPagePath` | `'페이지 경로 복사'` |
| es | `outlinerCopyPagePath` | `'Copiar ruta de página'` |
| fr | `outlinerCopyPagePath` | `'Copier le chemin de la page'` |
| zh-cn | `outlinerCopyPagePath` | `'复制页面路径'` |
| zh-tw | `outlinerCopyPagePath` | `'複製頁面路徑'` |

### 8. テスト用HostBridge

`test/build-standalone-outliner.js` と `test/build-standalone-notes.js`:

```javascript
copyPagePaths: function(pageIds) {
    window.__testApi.messages.push({ type: 'copyPagePaths', pageIds: pageIds });
}
```

---

## デグレ防止の考慮

### 既存機能への影響なし

1. **Cmd+C**: `case 'c':` 内で `e.shiftKey` を先に判定するため、Shift無しの Cmd+C は従来通り動作
2. **Cmd+X**: `case 'x':` は別のcaseブロックのため影響なし
3. **右クリックメニュー**: 既存項目の順序・表示条件は変更しない。新項目を追加するのみ
4. **複数選択**: `selectedNodeIds` の読み取りのみ（書き込みなし）。選択状態に影響しない
5. **コンテキストメニューの位置計算**: 項目数が増えるが、既存の画面はみ出し防止コードが対応済み

### 衝突チェック

- `Cmd+Shift+C`: 現在このショートカットは未使用（使用中のショートカット一覧を調査済み）
- `copyPagePaths` メッセージタイプ: 新規追加（既存メッセージとの衝突なし）
- `outlinerCopyPagePath` i18nキー: 新規追加（既存キーとの衝突なし）

---

## メッセージフロー図

### 単一ノード（右クリック or Cmd+Shift+C）
```
outliner.js: host.copyPagePaths([pageId])
  → outliner-host-bridge.js: postMessage({ type: 'copyPagePaths', pageIds: [pageId] })
  → outlinerProvider.ts: getPageFilePath(document, pageId) → clipboard.writeText(path)
```

### 複数選択（Cmd+Shift+C or 右クリック）
```
outliner.js: host.copyPagePaths([pageId1, pageId2, pageId3])
  → outliner-host-bridge.js: postMessage({ type: 'copyPagePaths', pageIds: [...] })
  → outlinerProvider.ts: map(getPageFilePath) → clipboard.writeText(paths.join('\n'))
```
