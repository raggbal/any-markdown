# 設計書 — Outliner ノード画像機能

## 概要

Outliner ノードに画像を貼り付け・表示・操作する機能。既存の Markdown 画像保存機構をベースに、Outliner 固有のサムネイル表示・D&D並べ替え・拡大表示を実装する。

---

## アーキテクチャ

### 変更対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/webview/outliner-model.js` | ノードモデルに `images` フィールド追加 |
| `src/webview/outliner.js` | ペーストハンドラ、画像DOM生成、D&D、削除、拡大表示、設定メニュー |
| `src/webview/outliner.css` | サムネイル行スタイル、拡大オーバーレイ、7テーマ対応 |
| `src/outlinerProvider.ts` | 画像保存メッセージハンドラ、画像ディレクトリ解決 |
| `src/shared/outliner-host-bridge.js` | 画像関連メッセージAPI追加 |
| `src/shared/notes-message-handler.ts` | Notes mode 用画像保存ハンドラ追加 |
| `src/notesEditorProvider.ts` | Notes mode 用画像保存 platformActions 追加 |
| `src/outlinerWebviewContent.ts` | localResourceRoots に画像ディレクトリ追加 |
| `src/notesWebviewContent.ts` | localResourceRoots に画像ディレクトリ追加 |
| `package.json` | `fractal.outlinerImageDefaultDir`, `fractal.outlinerForceRelativeImagePath` 設定追加 |
| `src/i18n/messages.ts` + 各ロケール | 画像設定関連の i18n キー追加 |
| `test/build-standalone-outliner.js` | テスト用HTML にモック追加 |

### 変更しないファイル

| ファイル | 理由 |
|---------|------|
| `src/webview/editor.js` | Markdown editor の画像処理には影響なし |
| `src/editorProvider.ts` | Markdown editor のプロバイダには変更不要 |
| `src/shared/notes-file-panel.js` | 左パネルUIには変更なし |
| `src/webview/outliner-search.js` | 検索エンジンには変更なし |

---

## データモデル変更

### outliner-model.js

`addNode()` と `addNodeAtStart()` で生成するノードオブジェクトに `images: []` を追加:

```javascript
var node = {
    id: id,
    parentId: parentId || null,
    children: [],
    text: text,
    tags: parseTags(text),
    isPage: false,
    pageId: null,
    collapsed: false,
    checked: null,
    subtext: '',
    images: []       // 新規追加
};
```

`_ensureChildren()` に `images` のデフォルト値設定を追加:

```javascript
if (!node.images) { node.images = []; }
```

画像操作メソッドを追加:

```javascript
Model.prototype.addImage = function(nodeId, imagePath) {
    var node = this.nodes[nodeId];
    if (node) {
        if (!node.images) node.images = [];
        node.images.push(imagePath);
    }
};

Model.prototype.removeImage = function(nodeId, index) {
    var node = this.nodes[nodeId];
    if (node && node.images && index >= 0 && index < node.images.length) {
        node.images.splice(index, 1);
    }
};

Model.prototype.moveImage = function(nodeId, fromIndex, toIndex) {
    var node = this.nodes[nodeId];
    if (node && node.images) {
        var img = node.images.splice(fromIndex, 1)[0];
        node.images.splice(toIndex, 0, img);
    }
};
```

`serialize()` は既存の `JSON.stringify` ベースのため、`images` フィールドは自動的にシリアライズされる。空配列 `[]` はそのまま出力される（サイズ最小化のため、空配列は出力しない最適化も検討可能だが後方互換性を優先）。

---

## メッセージフロー

### 画像ペースト（Cmd+V）フロー

```
1. outliner.js: handleNodePaste() で clipboardData.items から画像ファイル検出
2. outliner.js: FileReader で base64 dataUrl に変換
3. outliner.js: host.saveOutlinerImage(nodeId, dataUrl, fileName) 呼び出し
4. outliner-host-bridge.js: postMessage({ type: 'saveOutlinerImage', nodeId, dataUrl, fileName })
5. outlinerProvider.ts: 画像保存先ディレクトリ解決 → ファイル書き込み
6. outlinerProvider.ts: webview に postMessage({ type: 'outlinerImageSaved', nodeId, imagePath, displayUri })
7. outliner.js: model.addImage(nodeId, imagePath) → DOM更新 → scheduleSyncToHost()
```

### Notes mode のフロー

```
1-3. 同上（outliner.js 共通）
4. notes-host-bridge.js: postMessage({ type: 'saveOutlinerImage', nodeId, dataUrl, fileName })
5. notes-message-handler.ts → notesEditorProvider.ts: saveOutlinerImage platformAction
6. notesEditorProvider.ts: {pageDir}/images/ にファイル保存
7. 同上
```

### メッセージ型定義

| 方向 | type | パラメータ |
|------|------|-----------|
| webview→host | `saveOutlinerImage` | `nodeId`, `dataUrl`, `fileName` |
| host→webview | `outlinerImageSaved` | `nodeId`, `imagePath`, `displayUri` |
| webview→host | `getOutlinerImageDir` | (なし) |
| host→webview | `outlinerImageDirStatus` | `displayPath`, `source` |
| webview→host | `setOutlinerImageDir` | (なし) |
| host→webview | `outlinerImageDirChanged` | `displayPath`, `source` |
| webview→host | `resolveOutlinerImageUri` | `imagePaths: string[]` |
| host→webview | `outlinerImageUris` | `uris: {path: string, displayUri: string}[]` |

---

## outliner.js の変更

### 1. handleNodePaste() の拡張

既存の `handleNodePaste()` の先頭に画像ペースト判定を追加:

```javascript
function handleNodePaste(e, nodeId, textEl) {
    // 画像ペースト判定（テキストより先に判定）
    if (e.clipboardData && e.clipboardData.items) {
        for (var i = 0; i < e.clipboardData.items.length; i++) {
            var item = e.clipboardData.items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault();
                var file = item.getAsFile();
                if (file) {
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        host.saveOutlinerImage(nodeId, ev.target.result, file.name);
                    };
                    reader.readAsDataURL(file);
                }
                return;  // 画像があればテキストペーストは行わない
            }
        }
    }
    
    // 既存のテキストペースト処理（変更なし）
    var clipText = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    // ...
}
```

**デグレ防止:** 画像がクリップボードにない場合は既存のテキストペースト処理にそのままフォールスルー。`return` で分岐するため既存コードパスへの影響なし。

### 2. createNodeElement() の拡張

subtext の後に画像コンテナを追加:

```javascript
// サブテキスト（既存コード）
contentEl.appendChild(subtextEl);

// 画像サムネイル行（新規追加）
var imagesEl = document.createElement('div');
imagesEl.className = 'outliner-images';
imagesEl.dataset.nodeId = node.id;
if (node.images && node.images.length > 0) {
    renderNodeImages(imagesEl, node);
}
contentEl.appendChild(imagesEl);

el.appendChild(contentEl);
```

### 3. renderNodeImages() — サムネイル描画

```javascript
function renderNodeImages(container, node) {
    container.innerHTML = '';
    if (!node.images || node.images.length === 0) return;
    
    for (var i = 0; i < node.images.length; i++) {
        var img = document.createElement('img');
        img.className = 'outliner-image-thumb';
        img.dataset.index = i;
        img.dataset.nodeId = node.id;
        img.src = resolveImageSrc(node.images[i]);
        img.draggable = true;
        
        // クリックで選択
        img.addEventListener('click', handleImageClick);
        // ダブルクリックで拡大
        img.addEventListener('dblclick', handleImageDblClick);
        // D&Dイベント
        img.addEventListener('dragstart', handleImageDragStart);
        img.addEventListener('dragover', handleImageDragOver);
        img.addEventListener('drop', handleImageDrop);
        img.addEventListener('dragend', handleImageDragEnd);
        
        container.appendChild(img);
    }
}
```

### 4. 画像 src の解決

webview 内で画像を表示するには `webview.asWebviewUri()` で変換した URI が必要。しかし webview 側からは `asWebviewUri()` を呼べないため、2つの方式を検討:

**方式A: 初期ロード時にホストから URI マップを受け取る**
- `init()` / `updateData` 時にホストが全画像の displayUri マップを送信
- メリット: 同期的に描画可能
- デメリット: 画像数が多いとメッセージサイズ増大

**方式B: ベース URI を使った相対パス解決**
- `outlinerWebviewContent.ts` で `documentBaseUri` を HTML に埋め込み
- webview 側で `documentBaseUri + imagePath` で src を構築
- メリット: シンプル、メッセージ不要
- デメリット: VSCode webview の CSP/localResourceRoots の設定が必要

**採用: 方式B（ベース URI 方式）**

`outlinerWebviewContent.ts` で既に `localResourceRoots` に `documentDir` が含まれている。画像ディレクトリも追加し、`documentBaseUri` を webview に渡す:

```typescript
// outlinerWebviewContent.ts
const imageBaseUri = webview.asWebviewUri(documentDir).toString();
// HTML内に埋め込み
<script>window.__outlinerImageBaseUri = "${imageBaseUri}";</script>
```

```javascript
// outliner.js
function resolveImageSrc(imagePath) {
    var baseUri = window.__outlinerImageBaseUri;
    if (!baseUri) return imagePath;
    // 相対パスを解決
    return baseUri + '/' + imagePath.replace(/^\.\//, '');
}
```

### 5. 画像選択と削除

```javascript
var selectedImageInfo = null; // { nodeId, index, element }

function handleImageClick(e) {
    e.stopPropagation();
    clearImageSelection();
    var img = e.target;
    img.classList.add('is-selected');
    selectedImageInfo = {
        nodeId: img.dataset.nodeId,
        index: parseInt(img.dataset.index, 10),
        element: img
    };
}

function clearImageSelection() {
    if (selectedImageInfo) {
        selectedImageInfo.element.classList.remove('is-selected');
        selectedImageInfo = null;
    }
}
```

グローバルキーハンドラに Delete/Backspace 対応を追加:

```javascript
// setupKeyHandlers() 内
if ((e.key === 'Delete' || e.key === 'Backspace') && selectedImageInfo) {
    e.preventDefault();
    saveSnapshot();
    model.removeImage(selectedImageInfo.nodeId, selectedImageInfo.index);
    var imagesEl = document.querySelector('.outliner-images[data-node-id="' + selectedImageInfo.nodeId + '"]');
    if (imagesEl) {
        renderNodeImages(imagesEl, model.getNode(selectedImageInfo.nodeId));
    }
    clearImageSelection();
    scheduleSyncToHost();
}
```

### 6. 画像 D&D 並べ替え

ノード D&D（バレットドラッグ）とは完全に分離。`dragState` 変数ではなく `imageDragState` 変数で管理:

```javascript
var imageDragState = null; // { nodeId, fromIndex }

function handleImageDragStart(e) {
    e.stopPropagation(); // ノード D&D と干渉しない
    var img = e.target;
    imageDragState = {
        nodeId: img.dataset.nodeId,
        fromIndex: parseInt(img.dataset.index, 10)
    };
    img.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleImageDragOver(e) {
    if (!imageDragState) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    // ドロップインジケーター表示（画像間の左右に青線）
}

function handleImageDrop(e) {
    if (!imageDragState) return;
    e.preventDefault();
    e.stopPropagation();
    var targetIndex = parseInt(e.target.dataset.index, 10);
    if (imageDragState.fromIndex !== targetIndex) {
        saveSnapshot();
        model.moveImage(imageDragState.nodeId, imageDragState.fromIndex, targetIndex);
        var imagesEl = e.target.closest('.outliner-images');
        renderNodeImages(imagesEl, model.getNode(imageDragState.nodeId));
        scheduleSyncToHost();
    }
    imageDragState = null;
}
```

**デグレ防止:** `e.stopPropagation()` により、画像 D&D イベントがノード D&D のハンドラに伝播しない。`imageDragState` と `dragState` は別変数で完全に独立。

### 7. 画像拡大表示

```javascript
function handleImageDblClick(e) {
    e.stopPropagation();
    var overlay = document.createElement('div');
    overlay.className = 'outliner-image-overlay';
    
    var largeImg = document.createElement('img');
    largeImg.className = 'outliner-image-large';
    largeImg.src = e.target.src;
    
    overlay.appendChild(largeImg);
    document.body.appendChild(overlay);
    
    // 閉じるイベント
    overlay.addEventListener('click', function(ev) {
        if (ev.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function closeOnEsc(ev) {
        if (ev.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
}
```

### 8. 設定メニューへの画像フォルダ設定追加

`toggleMenuDropdown()` に「Set image directory...」メニュー項目を追加:

```javascript
// Notes mode でなければ表示
if (!document.querySelector('.notes-layout')) {
    var setImageDirItem = document.createElement('button');
    setImageDirItem.className = 'menu-item';
    setImageDirItem.textContent = i18n.outlinerSetImageDir || 'Set image directory...';
    setImageDirItem.addEventListener('click', function() {
        dropdown.remove();
        host.setOutlinerImageDir();
    });
    dropdown.appendChild(setImageDirItem);
}
```

### 9. imageDir 変数管理（pageDir と同パターン）

`init()` で JSON から復元、`syncToHostImmediate()` で付加:

```javascript
// グローバル変数
var imageDir = null; // .out JSON の imageDir フィールド

// init() 内で復元
if (data && data.imageDir) {
    imageDir = data.imageDir;
}

// syncToHostImmediate() に追加
function syncToHostImmediate() {
    clearTimeout(syncDebounceTimer);
    var data = model.serialize();
    data.searchFocusMode = searchFocusMode;
    if (pageDir) { data.pageDir = pageDir; }
    if (imageDir) { data.imageDir = imageDir; }  // ← 追加
    if (sidePanelWidthSetting) { data.sidePanelWidth = sidePanelWidthSetting; }
    if (pinnedTags && pinnedTags.length > 0) { data.pinnedTags = pinnedTags; }
    host.syncData(JSON.stringify(data, null, 2));
}
```

### 10. ホストメッセージ受信ハンドラ追加

`init()` 内のメッセージハンドラに追加:

```javascript
case 'outlinerImageSaved':
    if (msg.nodeId && msg.imagePath) {
        saveSnapshot();
        model.addImage(msg.nodeId, msg.imagePath);
        var imagesEl = document.querySelector('.outliner-images[data-node-id="' + msg.nodeId + '"]');
        if (imagesEl) {
            renderNodeImages(imagesEl, model.getNode(msg.nodeId));
        }
        scheduleSyncToHost();
    }
    break;

case 'outlinerImageDirChanged':
    // 設定変更後: imageDir 変数を更新 → syncData で .out JSONに永続化
    imageDir = msg.imageDir || null;
    scheduleSyncToHost();
    break;

case 'outlinerImageDirStatus':
    // 設定画面用の表示更新
    break;
```

---

## outliner-host-bridge.js の変更

```javascript
window.outlinerHostBridge = Object.assign(shared, {
    // 既存メソッド...
    
    // 画像操作（新規追加）
    saveOutlinerImage: function(nodeId, dataUrl, fileName) {
        api.postMessage({ type: 'saveOutlinerImage', nodeId: nodeId, dataUrl: dataUrl, fileName: fileName });
    },
    setOutlinerImageDir: function() {
        api.postMessage({ type: 'setOutlinerImageDir' });
    },
    getOutlinerImageDir: function() {
        api.postMessage({ type: 'getOutlinerImageDir' });
    }
});
```

## notes-host-bridge.js の変更

`window.outlinerHostBridge` セクションに同じメソッドを追加（Notes mode でも outliner.js は同一の `host.saveOutlinerImage()` を呼び出すため）:

```javascript
// 画像操作（新規追加）
saveOutlinerImage: function(nodeId, dataUrl, fileName) {
    api.postMessage({ type: 'saveOutlinerImage', nodeId: nodeId, dataUrl: dataUrl, fileName: fileName });
},
// Notes mode では画像フォルダは自動管理のため setOutlinerImageDir / getOutlinerImageDir は no-op
setOutlinerImageDir: function() { /* no-op in notes */ },
getOutlinerImageDir: function() { /* no-op in notes */ }
```

---

## outlinerProvider.ts の変更

### 画像ディレクトリ解決

`getPagesDirPath()` と同パターンで、.out JSON 内の `imageDir` フィールドを優先:

```typescript
private getOutlinerImageDirPath(document: vscode.TextDocument): string {
    // 1. out JSON内のimageDirフィールドを優先
    try {
        const data = JSON.parse(document.getText());
        if (data.imageDir) {
            if (path.isAbsolute(data.imageDir)) {
                return data.imageDir;
            }
            return path.resolve(path.dirname(document.uri.fsPath), data.imageDir);
        }
    } catch { /* ignore parse errors */ }

    // 2. VSCode設定
    const config = vscode.workspace.getConfiguration('fractal');
    const configDir = config.get<string>('outlinerImageDefaultDir', './images');
    if (!configDir) {
        return path.dirname(document.uri.fsPath);
    }
    if (path.isAbsolute(configDir)) {
        return configDir;
    }
    return path.resolve(path.dirname(document.uri.fsPath), configDir);
}
```

### メッセージハンドラ追加

```typescript
case 'saveOutlinerImage': {
    const imageDir = this.getOutlinerImageDirPath(document);
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
    }
    let imgFileName = message.fileName;
    if (!imgFileName) {
        const extMatch = message.dataUrl.match(/^data:image\/(\w+);/);
        const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'png';
        imgFileName = `image_${Date.now()}.${ext}`;
    }
    const base64Data = message.dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const destPath = path.join(imageDir, imgFileName);
    fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
    
    // .out ファイルからの相対パスを計算
    const outDir = path.dirname(document.uri.fsPath);
    const relativePath = path.relative(outDir, destPath).replace(/\\/g, '/');
    const displayUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
    
    webviewPanel.webview.postMessage({
        type: 'outlinerImageSaved',
        nodeId: message.nodeId,
        imagePath: relativePath,
        displayUri: displayUri
    });
    break;
}

case 'setOutlinerImageDir': {
    // pageDirと同パターン: .out JSONのimageDirフィールドに保存
    const currentDir = this.getOutlinerImageDirPath(document);
    const outDir = path.dirname(document.uri.fsPath);
    const relCurrent = path.relative(outDir, currentDir).replace(/\\/g, '/') || './images';
    const input = await vscode.window.showInputBox({
        prompt: 'Image directory path (relative to .out file or absolute)',
        value: relCurrent
    });
    if (input !== undefined) {
        // webview側に通知 → outliner.js が imageDir 変数を更新 → syncData で .out JSONに永続化
        webviewPanel.webview.postMessage({
            type: 'outlinerImageDirChanged',
            imageDir: input,
            displayPath: input || './images',
            source: 'file'
        });
    }
    break;
}

case 'getOutlinerImageDir': {
    const imgDir = this.getOutlinerImageDirPath(document);
    const outDir = path.dirname(document.uri.fsPath);
    const displayPath = path.relative(outDir, imgDir).replace(/\\/g, '/') || '.';
    webviewPanel.webview.postMessage({
        type: 'outlinerImageDirStatus',
        displayPath: displayPath,
        source: 'settings'
    });
    break;
}
```

### localResourceRoots の拡張

画像ディレクトリへのアクセスを許可:

```typescript
const imageDir = this.getOutlinerImageDirPath(document);
webviewPanel.webview.options = {
    enableScripts: true,
    localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        documentDir,
        vscode.Uri.file(imageDir)  // 追加
    ]
};
```

---

## Notes mode の変更

### notesEditorProvider.ts

`NotesPlatformActions` に `saveOutlinerImage` を追加:

```typescript
saveOutlinerImage: (nodeId: string, dataUrl: string, fileName: string) => {
    const pagesDir = fileManager.getPagesDirPath();
    const imagesDir = path.join(pagesDir, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    
    let imgFileName = fileName;
    if (!imgFileName) {
        const extMatch = dataUrl.match(/^data:image\/(\w+);/);
        const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'png';
        imgFileName = `image_${Date.now()}.${ext}`;
    }
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const destPath = path.join(imagesDir, imgFileName);
    fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
    
    // .out ファイルからの相対パスを計算
    const outFilePath = fileManager.getCurrentFilePath();
    const outDir = outFilePath ? path.dirname(outFilePath) : fileManager.folderPath;
    const relativePath = path.relative(outDir, destPath).replace(/\\/g, '/');
    const displayUri = panel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
    
    sender.postMessage({
        type: 'outlinerImageSaved',
        nodeId: nodeId,
        imagePath: relativePath,
        displayUri: displayUri
    });
}
```

### notes-message-handler.ts

```typescript
case 'saveOutlinerImage':
    if (platform.saveOutlinerImage) {
        platform.saveOutlinerImage(message.nodeId, message.dataUrl, message.fileName);
    }
    break;
```

---

## CSS 設計 (outliner.css)

### サムネイル行

```css
.outliner-images {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 0 2px 0;
    min-height: 0;
}

.outliner-images:empty {
    display: none;
}

.outliner-image-thumb {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.15s, opacity 0.15s;
}

.outliner-image-thumb:hover {
    opacity: 0.85;
}

.outliner-image-thumb.is-selected {
    border-color: var(--outliner-accent-fg, #2196F3);
}

.outliner-image-thumb.is-dragging {
    opacity: 0.4;
}
```

### 拡大オーバーレイ

```css
.outliner-image-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    cursor: pointer;
}

.outliner-image-large {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}
```

### テーマ対応

各テーマブロック `[data-theme="xxx"]` に以下の変数を追加:
- `--outliner-image-border`: サムネイル選択時のボーダー色（既存の `--outliner-accent-fg` を流用）
- `--outliner-image-overlay-bg`: オーバーレイ背景色

---

## package.json の変更

```json
"fractal.outlinerImageDefaultDir": {
    "type": "string",
    "default": "./images",
    "description": "Default directory for saving outliner node images. Uses relative path from .out file."
},
"fractal.outlinerForceRelativeImagePath": {
    "type": "boolean",
    "default": false,
    "description": "Always insert outliner image paths as relative paths."
}
```

---

## i18n キー追加

| キー | en | ja |
|------|----|----|
| `outlinerSetImageDir` | Set image directory... | 画像フォルダを設定... |
| `outlinerImageDirLabel` | Image save directory: | 画像保存先: |

---

## テスト用 HTML 変更

### test/build-standalone-outliner.js

`__testApi` に画像関連のモックを追加:

```javascript
// 画像保存のモック
window.outlinerHostBridge.saveOutlinerImage = function(nodeId, dataUrl, fileName) {
    // テスト用: 即座にモデルに追加して返す
    var mockPath = './images/' + (fileName || 'test_image.png');
    window.__hostMessageHandler({
        type: 'outlinerImageSaved',
        nodeId: nodeId,
        imagePath: mockPath,
        displayUri: dataUrl  // テスト時はdataUrl自体をsrcに使用
    });
};
```

---

## デグレ防止の考慮事項

### 1. handleNodePaste() の変更

- 画像判定は `clipboardData.items` のループで行い、画像が見つかった場合のみ `return` で早期脱出
- テキストのみのペーストは既存コードパスに変更なし
- 内部クリップボード（ページメタデータ含む）のペーストにも影響なし

### 2. createNodeElement() の変更

- `imagesEl` は `subtextEl` の後、`el.appendChild(contentEl)` の前に追加
- 既存の `contentEl` 構造（text + subtext）には触れない
- D&D イベント（バレットドラッグ、ノードドロップ）は `el` に登録されており、画像コンテナは `contentEl` 内なのでイベント伝播で到達するが、`imageDragState` チェックで分離

### 3. D&D の分離

- ノード D&D は `dragState` 変数で管理、バレット要素の `dragstart` で開始
- 画像 D&D は `imageDragState` 変数で管理、画像要素の `dragstart` で開始
- 画像の `dragstart` で `e.stopPropagation()` を呼び、ノード D&D との干渉を防止

### 4. syncData の互換性

- `images` フィールドは配列として自動シリアライズ
- 古いバージョンで開いた場合、`images` フィールドは無視される（JSON の追加プロパティは安全）
- 新バージョンで古いデータを開いた場合、`_ensureChildren()` で `images = []` をデフォルト設定

### 5. 選択状態の管理

- ノード選択（`selectedNodeIds` Set）と画像選択（`selectedImageInfo`）は別変数
- ノードクリック時に `clearImageSelection()` を呼び、画像クリック時に既存のノード選択は解除しない（ノードテキスト編集とは独立した操作）
- ただし、テキスト編集開始時（focus）に `clearImageSelection()` を呼ぶ

### 6. Undo/Redo 対応

- 画像追加・削除・並べ替えの前に `saveSnapshot()` を呼ぶ
- 既存の snapshot/undo/redo メカニズムがそのまま機能する（`model.serialize()` が `images` を含むため）

---

## Notes mode での画像ディレクトリ自動管理

Notes mode（`document.querySelector('.notes-layout')` で判定）では:

1. 画像フォルダ設定メニュー項目を非表示
2. 画像保存先は `{pageDir}/images/` に固定（MD ページ画像と同一フォルダ）
3. `notesEditorProvider.ts` の `saveOutlinerImage` で `fileManager.getPagesDirPath()` を使用

これは既存のサイドパネル画像保存（`saveImageToDir` platformAction）と同じパターンを踏襲する。
