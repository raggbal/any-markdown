# 設計書 — Outliner追加要件 v0.195.555

> **対象ファイル**: `outliner.js`, `outliner.css`, `outliner-model.js`, `outlinerProvider.ts`, `outliner-host-bridge.js`, `test-host-bridge.js`, `notes-host-bridge.js`

---

## 設計1: Shift+↑/↓ 初回選択の修正

### 対象コード

- `outliner.js`: ArrowUp/ArrowDown の `e.shiftKey` 分岐（L1407-1424, L1433-1453）
- `outliner.js`: `selectRange()` (L937-951), `clearSelection()` (L918-926)

### 現状の動作フロー

```
Shift+↑ 1回目（フォーカス=C）:
  1. selectionAnchorId = null → selectionAnchorId = C
  2. prevEl = B
  3. selectRange(C, B) → B,C両方を選択（2行）
  4. focusNodeEl(B) → フォーカスがBに移動
```

### 修正後の動作フロー

```
Shift+↑ 1回目（フォーカス=C）:
  1. selectionAnchorId = null → 初回判定
  2. selectionAnchorId = C
  3. selectRange(C, C) → Cのみ選択（1行）
  4. フォーカスはCのまま（移動しない）

Shift+↑ 2回目（フォーカス=C、selectionAnchorId=C）:
  1. selectionAnchorId = C（既に設定済み）
  2. prevEl = B
  3. selectRange(C, B) → B,C選択（2行）
  4. focusNodeEl(B) → フォーカスがBに移動
```

### 実装方針

**ArrowUp Shift分岐（L1407-1424）の修正:**

```javascript
} else if (e.shiftKey) {
    e.preventDefault();
    if (!selectionAnchorId) {
        // 初回: 自行のみ選択、フォーカス移動なし
        selectionAnchorId = nodeId;
        selectRange(selectionAnchorId, nodeId);  // 自行のみ
        // focusNodeEl を呼ばない → フォーカスは現在行のまま
    } else {
        // 2回目以降: 従来通り拡張
        var prevEl = getDomPrevNodeEl(textEl);
        if (prevEl) {
            var prevElId = prevEl.dataset.id;
            if (prevElId) { selectRange(selectionAnchorId, prevElId); }
            focusNodeEl(prevEl);
        }
    }
}
```

**ArrowDown Shift分岐（L1433-1453）も同様に修正。**

### デグレチェック

- `selectRange()` 関数自体は変更しない
- `clearSelection()` による anchor リセットも変更なし
- 2回目以降の拡張ロジックは完全に従来と同一
- 通常の↑↓（Shift なし）は `clearSelection()` を呼んでリセットするため影響なし

---

## 設計2: ページノードのクリップボード操作

### アーキテクチャ

```
outliner.js (内部クリップボード)
  ↓ Cmd+C/X: getSelectedNodesData() → internalClipboard に保存
  ↓ Cmd+V: getValidInternalClipboard() → ページメタデータ復元
  ↓ コピー時: host.copyPageFile(sourcePageId, newPageId)
  ↓
outliner-host-bridge.js (メッセージ送信)
  ↓ { type: 'copyPageFile', sourcePageId, newPageId }
  ↓
outlinerProvider.ts (ファイル複製)
  → fs.copyFileSync(source, dest)
```

### 2-1. 内部クリップボード変数（outliner.js）

グローバル変数エリア（L58-60付近）に追加:

```javascript
var internalClipboard = null;  // { plainText, isCut, nodes: [{text, level, isPage, pageId}] }
```

### 2-2. getSelectedNodesData() 関数（新規追加）

`getSelectedText()` (L954-976) の直後に追加。テキストに加えてページメタデータも収集する。

```javascript
function getSelectedNodesData() {
    var flat = model.getFlattenedIds(true);
    var minDepth = Infinity;
    var selectedFlat = [];
    for (var i = 0; i < flat.length; i++) {
        if (selectedNodeIds.has(flat[i])) {
            var depth = model.getDepth(flat[i]);
            if (depth < minDepth) { minDepth = depth; }
            selectedFlat.push(flat[i]);
        }
    }
    var nodes = [];
    for (var j = 0; j < selectedFlat.length; j++) {
        var node = model.getNode(selectedFlat[j]);
        if (!node) { continue; }
        var relDepth = model.getDepth(selectedFlat[j]) - minDepth;
        nodes.push({
            text: node.text,
            level: relDepth,
            isPage: node.isPage || false,
            pageId: node.pageId || null
        });
    }
    return nodes;
}
```

### 2-3. getValidInternalClipboard() 関数（新規追加）

```javascript
function getValidInternalClipboard(clipText) {
    if (!internalClipboard) { return null; }
    if (internalClipboard.plainText !== clipText) { return null; }  // 外部からのペースト
    return internalClipboard;
}
```

### 2-4. Cmd+C 修正（L1534-1548）

```javascript
case 'c':
    if (selectedNodeIds.size > 0) {
        e.preventDefault();
        var copyText = getSelectedText();
        navigator.clipboard.writeText(copyText);
        // 内部クリップボードにページメタデータも保存
        internalClipboard = {
            plainText: copyText,
            isCut: false,
            nodes: getSelectedNodesData()
        };
    } else {
        // 単一ノード: 従来通り（ページメタデータ不要）
        var selC = window.getSelection();
        if (!selC || selC.isCollapsed) {
            e.preventDefault();
            navigator.clipboard.writeText(node.text || '');
            internalClipboard = null;  // 単一ノードコピーでは内部クリップボードクリア
        }
    }
    break;
```

### 2-5. Cmd+X 修正（L1549-1568）

```javascript
case 'x':
    if (selectedNodeIds.size > 0) {
        e.preventDefault();
        var cutText = getSelectedText();
        navigator.clipboard.writeText(cutText);
        // 内部クリップボードにページメタデータも保存（isCut=true）
        internalClipboard = {
            plainText: cutText,
            isCut: true,
            nodes: getSelectedNodesData()
        };
        deleteSelectedNodes();
    } else {
        // 単一ノード: 従来通り
        var selX = window.getSelection();
        if (!selX || selX.isCollapsed) {
            e.preventDefault();
            navigator.clipboard.writeText(node.text || '');
            internalClipboard = null;
            saveSnapshot();
            model.updateText(nodeId, '');
            textEl.innerHTML = '';
            scheduleSyncToHost();
        }
    }
    break;
```

### 2-6. pasteNodesFromText() の修正

`pasteNodesFromText()` にオプション引数 `clipboardNodes` を追加。ページメタデータの復元を行う。

```javascript
function pasteNodesFromText(text, baseParentId, afterId, clipboardNodes, isCut) {
    // ... 既存のパース処理は変更なし ...

    // ノード作成ループ内で、clipboardNodes がある場合はページメタデータを復元
    for (var n = 0; n < parsed.length; n++) {
        // ... 既存の parentId/after 計算 ...

        var newNode = model.addNode(parentId, after, parsed[n].text);

        // ページメタデータ復元
        if (clipboardNodes && clipboardNodes[n] && clipboardNodes[n].isPage) {
            var srcPageId = clipboardNodes[n].pageId;
            if (isCut) {
                // カット→ペースト: 元のpageIdをそのまま使う
                newNode.isPage = true;
                newNode.pageId = srcPageId;
            } else {
                // コピー→ペースト: 新pageId発行 + .mdファイル複製
                var newPageId = generatePageId();  // outliner-model.js の関数を利用
                newNode.isPage = true;
                newNode.pageId = newPageId;
                host.copyPageFile(srcPageId, newPageId);
            }
        }

        // ... 既存のlevelToLastId処理 ...
    }

    // ... 既存の renderTree/focusNode/scheduleSyncToHost ...
}
```

**注意**: `parsed` 配列と `clipboardNodes` 配列のインデックスは1:1で対応する必要がある。`getSelectedNodesData()` と `getSelectedText()` は同じノード順序でデータを生成するため、`pasteNodesFromText()` のパース結果と一致する。最終行の空行スキップ (`content === '' && i === lines.length - 1`) が `clipboardNodes` のインデックスと不整合を起こさないよう、空行スキップ時はインデックスマッピングで調整する。

### 2-7. handleNodePaste() の修正

```javascript
function handleNodePaste(e, nodeId, textEl) {
    var clipText = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!clipText) { return; }
    e.preventDefault();

    // 内部クリップボードの照合
    var intClip = getValidInternalClipboard(clipText);
    var clipNodes = intClip ? intClip.nodes : null;
    var isCut = intClip ? intClip.isCut : false;

    // カット時は1回消費
    if (intClip && intClip.isCut) {
        internalClipboard = null;
    }

    // ... 以降の処理で pasteNodesFromText() 呼び出し時に clipNodes, isCut を渡す
    // 複数選択時の置換:
    //   pasteNodesFromText(clipText, insertParentId, insertAfter, clipNodes, isCut);
    // 空ノードからの挿入:
    //   pasteNodesFromText(clipText, parentId, insertAfterForEmpty, clipNodes, isCut);
    // テキストありノードの後への挿入:
    //   pasteNodesFromText(clipText, node.parentId, nodeId, clipNodes, isCut);
    // 単一行ペースト: clipNodes は無視（ページメタデータは行単位では不要）
}
```

### 2-8. generatePageId のアクセス

`generatePageId()` は `outliner-model.js` (L18-30) にあるが、outliner.js からアクセスする必要がある。

**方式**: `model.generatePageId()` としてModelのプロトタイプメソッドを追加する。

```javascript
// outliner-model.js に追加
Model.prototype.generatePageId = function() {
    return generatePageId();  // 既存のモジュールスコープ関数を呼ぶ
};
```

### 2-9. host.copyPageFile() の追加

**outliner-host-bridge.js に追加:**

```javascript
copyPageFile: function(sourcePageId, newPageId) {
    api.postMessage({ type: 'copyPageFile', sourcePageId: sourcePageId, newPageId: newPageId });
},
```

**test-host-bridge.js にも追加（テスト用no-op）:**

```javascript
copyPageFile: function() { /* no-op in test */ },
```

**notes-host-bridge.js にも追加:**

```javascript
copyPageFile: function(sourcePageId, newPageId) {
    api.postMessage({ type: 'copyPageFile', sourcePageId: sourcePageId, newPageId: newPageId });
},
```

### 2-10. outlinerProvider.ts に handleCopyPageFile() 追加

```typescript
case 'copyPageFile':
    await this.handleCopyPageFile(document, message);
    break;

// ...

private async handleCopyPageFile(
    document: vscode.TextDocument,
    message: { sourcePageId: string; newPageId: string }
): Promise<void> {
    await this.ensurePagesDir(document);
    const sourcePath = this.getPageFilePath(document, message.sourcePageId);
    const destPath = this.getPageFilePath(document, message.newPageId);
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
    }
}
```

### 2-11. notesEditorProvider.ts への対応

`notesEditorProvider.ts` は `notes-message-handler.ts` 経由でメッセージを処理する。

**notes-message-handler.ts に追加:**

```typescript
case 'copyPageFile': {
    const pagesDir = fileManager.getPagesDirPath();
    const sourcePath = path.join(pagesDir, `${message.sourcePageId}.md`);
    const destPath = path.join(pagesDir, `${message.newPageId}.md`);
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
    }
    break;
}
```

**notes-host-bridge.js に追加（outlinerHostBridge内）:**

```javascript
copyPageFile: function(sourcePageId, newPageId) {
    api.postMessage({ type: 'copyPageFile', sourcePageId: sourcePageId, newPageId: newPageId });
},
```

### 2-12. parsed配列とclipboardNodesのインデックス整合性

`pasteNodesFromText()` のパース処理では最終行の空行をスキップする（`content === '' && i === lines.length - 1`）。一方、`clipboardNodes` は `getSelectedNodesData()` で生成されるため空行ノードを含まない。

テキストのパース結果とクリップボードノードのマッピング:
- `getSelectedText()` が生成するテキストは各ノードの `text` をタブインデント + `\n` で結合
- 最後のノードの後に `\n` が付かないため、最終空行は発生しない
- ただし安全のため、`parsed` 配列の構築時にスキップされたエントリ数をカウントし、`clipboardNodes[n]` ではなく `clipboardNodes[originalIndex]` を使うインデックスマッピングを実装する

### デグレチェック

- `getSelectedText()` は変更なし → 既存のシステムクリップボードへのテキストコピーに影響なし
- `pasteNodesFromText()` は `clipboardNodes` が `null` の場合、既存の動作と完全に同一
- `deleteSelectedNodes()` は変更なし → カット時のノード削除に影響なし
- `model.addNode()` は変更なし → 新ノード作成後にページ属性を上書きするだけ
- 単一ノードのコピー/カット/ペーストには影響なし（`internalClipboard = null` でクリアされる）
- カット→ペーストで `deleteSelectedNodes()` がページノードを削除する際、`model.removeNode()` はページファイルを削除しない（`host.removePage()` が呼ばれない）。ペースト時に同じpageIdで復元するため問題なし

---

## 設計3: 選択色のオレンジ化

### 対象コード

- `outliner.css`: `.outliner-node.is-selected` (L284-290)
- `outliner.css`: 各テーマの `--outliner-focus-bg`, `--outliner-active` 等（L727-928）
- `outliner.css`: `:root` 変数定義（L5-36）

### 実装方針

新しいCSS変数 `--outliner-selection-bg` を追加し、`is-selected` クラスと `::selection` に適用する。

**`:root` デフォルト値:**

```css
--outliner-selection-bg: rgba(255, 165, 0, 0.2);
--outliner-selection-text-bg: rgba(255, 165, 0, 0.3);
```

**`.is-selected` の変更:**

```css
.outliner-node.is-selected {
    background: var(--outliner-selection-bg);
}
```

**`::selection` の追加（outliner専用）:**

`.outliner-container` スコープで `::selection` を定義:

```css
.outliner-container ::selection {
    background: var(--outliner-selection-text-bg);
}
```

### テーマ別配色

| テーマ | 系統 | `--outliner-selection-bg` | `--outliner-selection-text-bg` |
|---|---|---|---|
| github | ライト | `rgba(255, 165, 0, 0.18)` | `rgba(255, 165, 0, 0.3)` |
| sepia | ライト | `rgba(210, 140, 20, 0.2)` | `rgba(210, 140, 20, 0.3)` |
| night | ダーク | `rgba(255, 165, 0, 0.15)` | `rgba(255, 165, 0, 0.25)` |
| dark | ダーク | `rgba(255, 165, 0, 0.15)` | `rgba(255, 165, 0, 0.25)` |
| minimal | ライト | `rgba(200, 130, 0, 0.15)` | `rgba(200, 130, 0, 0.25)` |
| things | ライト | `rgba(255, 165, 0, 0.18)` | `rgba(255, 165, 0, 0.3)` |
| perplexity | ライト | `rgba(255, 165, 0, 0.18)` | `rgba(255, 165, 0, 0.3)` |

### デグレチェック

- `is-focused` の色は変更しない（水色系のまま）→ フォーカス行の表示に影響なし
- ホバー色 `--outliner-hover-bg` も変更なし
- 検索マッチ色 `--outliner-match-bg` も変更なし
- `::selection` は `.outliner-container` スコープで定義するため、サイドパネル（mdエディタ）には影響しない
- `styles.css` の `--selection-bg` は変更しない → mdエディタの選択色に影響なし

---

## 設計4: メニューボタンのフロートメニュー位置修正

### 対象コード

- `outliner.js`: `toggleMenuDropdown()` (L2065-2119)
- `outliner.css`: `.outliner-menu-dropdown` (L197-224)

### 現状の問題分析

```
[検索バー (.outliner-search-bar) position: relative, padding: 8px 32px]
  [各ボタン...]
  [メニューボタン (.outliner-menu-btn)]
  [ドロップダウン (.outliner-menu-dropdown) position: absolute, right: 0, top: 100%]
```

`right: 0` は `searchBar` の右端（padding含む）に配置するため、メニューボタンの右端よりも32px（`--outliner-gutter`）分外側になる。

### 修正方針

メニューボタンの `getBoundingClientRect()` と検索バーの `getBoundingClientRect()` を使って、ドロップダウンの `right` を正確に計算する。

**`toggleMenuDropdown()` の修正:**

```javascript
// 検索バーを基準に配置
var searchBar = document.querySelector('.outliner-search-bar');
searchBar.style.position = 'relative';
searchBar.appendChild(dropdown);

// メニューボタンの位置を基準にright値を計算
var barRect = searchBar.getBoundingClientRect();
var btnRect = menuBtn.getBoundingClientRect();
var rightOffset = barRect.right - btnRect.right;
dropdown.style.right = rightOffset + 'px';

// 画面右端からはみ出さないよう調整
var dropRect = dropdown.getBoundingClientRect();
if (dropRect.right > window.innerWidth) {
    dropdown.style.right = (barRect.right - window.innerWidth + 8) + 'px';
}
if (dropRect.left < 0) {
    dropdown.style.right = 'auto';
    dropdown.style.left = '0';
}
```

### CSSの変更

`.outliner-menu-dropdown` の `right: 0` を削除（JSで動的に設定するため）:

```css
.outliner-menu-dropdown {
    position: absolute;
    /* right: 0; ← 削除（JSで動的設定） */
    top: 100%;
    /* ... 残りは変更なし */
}
```

### デグレチェック

- ドロップダウンの項目（Open in Text Editor, Copy File Path, Set page directory）のイベントハンドラは変更なし
- Notes mode での「Set page directory」非表示ロジックは変更なし
- 外側クリックで閉じるロジックは変更なし
- `searchBar.style.position = 'relative'` の設定は既存と同じ

---

## 要件間の衝突チェック

### 設計1 × 設計2: Shift選択 × クリップボード

- 設計1はShift+↑/↓の **初回のみ** の動作変更
- 設計2はCmd+C/X/Vの変更
- 両方とも `selectedNodeIds` を参照するが、設計1は `selectRange()` で追加、設計2は読み取りのみ
- **衝突なし**

### 設計1 × 設計3: Shift選択 × 選択色

- 設計1は `is-selected` クラスの付与タイミング変更
- 設計3は `is-selected` クラスのCSS色変更
- 互いに独立（JS vs CSS）
- **衝突なし**

### 設計2 × 設計3: クリップボード × 選択色

- 完全に独立（JS処理 vs CSS表示）
- **衝突なし**

### 設計4 × その他: メニュー位置修正

- メニューのDOM構造とイベントハンドラに閉じた変更
- 他の3設計とは完全に独立
- **衝突なし**

### 設計2の注意点: deleteSelectedNodes と ページ

`deleteSelectedNodes()` は `model.removeNode()` を呼ぶが、これはページファイルの削除を行わない（`host.removePage()` は呼ばれない）。カット操作ではノードがモデルから削除されるが、`.md` ファイルは残る。ペースト時に同じ `pageId` で復元するため、これは正しい動作。

ただし、カットして**ペーストしない**場合、孤立した `.md` ファイルが残る。これは既存のページ削除フロー（`removePage()` → `host.removePage()`）とは別の問題であり、今回のスコープ外とする。
