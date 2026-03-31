# 設計書 — Outliner追加修正 v0.195.559

---

## 設計1: ノードのドラッグ&ドロップ移動

### アーキテクチャ

```
[バレット(●)] draggable="true"
  ↓ dragstart
outliner.js: dragState = { nodeId, nodeEl }
  ↓ dragover (他のノード上)
outliner.js: ドロップ位置判定（上/下/子）→ インジケーター表示
  ↓ drop
outliner.js: model.moveNode(nodeId, newParentId, afterId) → renderTree → syncToHost
```

### 1-1. モデル追加: `model.moveNode(nodeId, newParentId, afterId)`

`outliner-model.js` に汎用的なノード移動メソッドを追加。

```javascript
Model.prototype.moveNode = function(nodeId, newParentId, afterId) {
    var node = this.nodes[nodeId];
    if (!node) { return false; }

    // 1. 元の場所から除去
    var oldSiblings = node.parentId ? this.nodes[node.parentId].children : this.rootIds;
    var oldIdx = oldSiblings.indexOf(nodeId);
    if (oldIdx >= 0) { oldSiblings.splice(oldIdx, 1); }

    // 2. 新しい親の子リストに挿入
    node.parentId = newParentId || null;
    var newSiblings = newParentId ? this.nodes[newParentId].children : this.rootIds;
    if (afterId) {
        var afterIdx = newSiblings.indexOf(afterId);
        if (afterIdx >= 0) {
            newSiblings.splice(afterIdx + 1, 0, nodeId);
        } else {
            newSiblings.push(nodeId);
        }
    } else {
        // afterId=null → 先頭に挿入
        newSiblings.unshift(nodeId);
    }

    return true;
};
```

### 1-2. 循環参照チェック: `model.isDescendant(nodeId, potentialAncestorId)`

```javascript
Model.prototype.isDescendant = function(nodeId, potentialAncestorId) {
    var current = nodeId;
    while (current) {
        if (current === potentialAncestorId) { return true; }
        var n = this.nodes[current];
        current = n ? n.parentId : null;
    }
    return false;
};
```

### 1-3. ドラッグ状態変数（outliner.js グローバル）

```javascript
var dragState = null;  // { nodeId, nodeEl } or null
var dropIndicator = null;  // DOM element for drop line
```

### 1-4. バレットにdraggable属性を追加（createNodeElement内）

`createNodeElement()` 内のバレット生成部分（L430付近）で:

```javascript
bullet.draggable = true;
bullet.addEventListener('dragstart', function(e) {
    e.stopPropagation();
    dragState = { nodeId: node.id, nodeEl: el };
    el.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
});
bullet.addEventListener('dragend', function() {
    if (dragState) {
        dragState.nodeEl.classList.remove('is-dragging');
        dragState = null;
    }
    removeDropIndicator();
});
```

### 1-5. ノード要素にdragover/drop イベント追加（createNodeElement内）

各 `.outliner-node` 要素に:

```javascript
el.addEventListener('dragover', function(e) {
    if (!dragState) { return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    var targetId = el.dataset.id;
    // 循環参照チェック: 自分自身 or 自分の子孫へのドロップ禁止
    if (targetId === dragState.nodeId || model.isDescendant(targetId, dragState.nodeId)) {
        e.dataTransfer.dropEffect = 'none';
        removeDropIndicator();
        return;
    }

    // ドロップ位置判定（Y座標ベース）
    var rect = el.getBoundingClientRect();
    var y = e.clientY - rect.top;
    var h = rect.height;
    var dropPosition; // 'before', 'after', 'child'

    if (y < h * 0.25) {
        dropPosition = 'before';  // 上25%
    } else if (y > h * 0.75) {
        dropPosition = 'after';   // 下25%
    } else {
        dropPosition = 'child';   // 中央50%
    }

    showDropIndicator(el, dropPosition);
});

el.addEventListener('dragleave', function(e) {
    // relatedTarget がまだ el 内ならスキップ
    if (el.contains(e.relatedTarget)) { return; }
    removeDropIndicator();
});

el.addEventListener('drop', function(e) {
    e.preventDefault();
    if (!dragState) { return; }

    var targetId = el.dataset.id;
    if (targetId === dragState.nodeId || model.isDescendant(targetId, dragState.nodeId)) {
        removeDropIndicator();
        return;
    }

    var rect = el.getBoundingClientRect();
    var y = e.clientY - rect.top;
    var h = rect.height;

    saveSnapshot();  // undo対応

    var targetNode = model.getNode(targetId);
    if (y < h * 0.25) {
        // before: targetの前に兄弟として挿入
        var info = model._getSiblingInfo(targetId);
        var afterId = info.index > 0 ? info.siblings[info.index - 1] : null;
        model.moveNode(dragState.nodeId, targetNode.parentId, afterId);
    } else if (y > h * 0.75) {
        // after: targetの後に兄弟として挿入
        model.moveNode(dragState.nodeId, targetNode.parentId, targetId);
    } else {
        // child: targetの子の先頭に挿入
        model.moveNode(dragState.nodeId, targetId, null);
        // 子を受け入れたので折りたたみ解除
        targetNode.collapsed = false;
    }

    var movedNodeId = dragState.nodeId;
    dragState.nodeEl.classList.remove('is-dragging');
    dragState = null;
    removeDropIndicator();

    renderTree();
    focusNode(movedNodeId);
    scheduleSyncToHost();
});
```

### 1-6. ドロップインジケーター表示/除去

```javascript
function showDropIndicator(targetEl, position) {
    removeDropIndicator();
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'outliner-drop-indicator';

    var rect = targetEl.getBoundingClientRect();
    var treeRect = treeEl.getBoundingClientRect();

    dropIndicator.style.position = 'absolute';
    dropIndicator.style.left = '0';
    dropIndicator.style.right = '0';

    if (position === 'before') {
        dropIndicator.style.top = (rect.top - treeRect.top + treeEl.scrollTop) + 'px';
        dropIndicator.style.height = '2px';
    } else if (position === 'after') {
        dropIndicator.style.top = (rect.bottom - treeRect.top + treeEl.scrollTop) + 'px';
        dropIndicator.style.height = '2px';
    } else {
        // child: ターゲット全体を囲む
        dropIndicator.style.top = (rect.top - treeRect.top + treeEl.scrollTop) + 'px';
        dropIndicator.style.height = rect.height + 'px';
        dropIndicator.style.background = 'rgba(0, 120, 212, 0.1)';
        dropIndicator.style.border = '1px dashed var(--vscode-focusBorder, #007acc)';
        dropIndicator.style.borderRadius = '4px';
    }

    treeEl.style.position = 'relative';
    treeEl.appendChild(dropIndicator);
}

function removeDropIndicator() {
    if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
    }
}
```

### 1-7. treeElへのdragoverイベント（空エリアへのドロップ対応）

```javascript
treeEl.addEventListener('dragover', function(e) {
    if (!dragState) { return; }
    e.preventDefault();
});
treeEl.addEventListener('drop', function(e) {
    if (!dragState) { return; }
    // ノード上でないドロップ → ルート末尾に移動
    if (e.target === treeEl || e.target.classList.contains('outliner-tree')) {
        e.preventDefault();
        saveSnapshot();
        var lastRootId = model.rootIds.length > 0 ? model.rootIds[model.rootIds.length - 1] : null;
        model.moveNode(dragState.nodeId, null, lastRootId);
        dragState.nodeEl.classList.remove('is-dragging');
        dragState = null;
        removeDropIndicator();
        renderTree();
        scheduleSyncToHost();
    }
});
```

### デグレチェック

- バレットのクリック（collapse/expand）: `dragstart` は `mousedown`+移動で発火。クリックは `click` イベントで処理されるため衝突しない
- バレットのAlt+Click（scope設定）: 同様に衝突しない
- テキスト部分のドラッグ: `draggable` はバレット要素のみに設定。テキスト部分のブラウザ標準テキスト選択は影響なし
- キーボード移動（Cmd+Shift+↑/↓、Tab/Shift+Tab）: 既存ロジックに変更なし
- 検索結果のjump: DOMイベントのみで状態管理は `dragState` 変数のみ。検索中のD&Dも動作する

---

## 設計2: サイドパネルMarkdownエディタの自動フォーカス

### 対象コード

- `editor.js`: `openSidePanel()` 関数（L13420付近）

### 実装方針

`openSidePanel()` の末尾、アニメーション開始後にsetTimeoutで遅延フォーカスを追加:

```javascript
// アニメーション完了後にエディタにフォーカス
setTimeout(function() {
    if (sidePanelInstance && sidePanelInstance.container) {
        var spEditor = sidePanelInstance.container.querySelector('.editor');
        if (spEditor) {
            spEditor.focus();
            // カーソルを先頭に設定
            var firstBlock = spEditor.querySelector(':scope > *');
            if (firstBlock) {
                var range = document.createRange();
                var sel = window.getSelection();
                range.setStart(firstBlock, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }
}, 300);  // CSSアニメーション(slide-in)の完了を待つ
```

### デグレチェック

- メインエディタのフォーカス: `EditorInstance._lastKnownActive` がサイドパネルインスタンスに切り替わる。サイドパネルを閉じると自動でメインに戻る
- ショートカット競合: サイドパネルにフォーカスがある状態でCmd+B等はサイドパネルに適用される。これは正しい動作

---

## 設計間衝突チェック

| 組み合わせ | 共有リソース | 衝突 |
|---|---|---|
| 修正1 × 修正2 | なし | D&Dはoutliner.js、自動フォーカスはeditor.js。完全独立。**衝突なし** |
