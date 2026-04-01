# 設計書 — v0.195.560 修正

## 修正1: Notes Undo/Redo スコープ分離

### 問題の根本原因

キーボードイベントの伝播順序で、Cmd+Z / Cmd+Shift+Z が2つの異なるハンドラで処理される:

1. **editor.js の capture-phase ハンドラ**（line 5977-6012, `addEventListener(..., true)`）
   - `EditorInstance.getActiveInstance()` でアクティブインスタンスを解決
   - sidepanel markdown 内にフォーカスがある場合、sidepanelInstance の `_undo()` / `_redo()` を呼ぶ
   - `e.preventDefault()` を実行

2. **outliner.js のグローバルハンドラ**（line 3833-3866, `addEventListener(...)`  = bubble phase）
   - `document.activeElement` が `.outliner-text` でなければ undo/redo を実行
   - sidepanel markdown 内にフォーカスがある場合、`activeElement` は sidepanel の `.editor` 要素
   - `.outliner-text` ではないため、**outliner の undo/redo も発火してしまう**

**結果**: sidepanel markdown 編集中に Cmd+Z を押すと、markdown の undo と outliner の undo が**同時に**実行される。

### 設計

**outliner.js のグローバルキーハンドラ（line 3854-3866）にガード条件を追加:**

```javascript
// グローバル Undo/Redo
if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    if (document.activeElement && document.activeElement.classList.contains('outliner-text')) { return; }
    // 追加ガード: sidepanel が開いていて、その中にフォーカスがある場合はスキップ
    if (sidePanelInstance && sidePanelEl && sidePanelEl.contains(document.activeElement)) { return; }
    e.preventDefault();
    undo();
}
// redo も同様
```

**ガード条件の詳細:**
- `sidePanelInstance` が存在する（sidepanel が作成されている）
- `sidePanelEl` が存在する（DOM要素がある）
- `sidePanelEl.contains(document.activeElement)` が true（フォーカスが sidepanel 内にある）

**この3条件すべてが true の場合のみ、outliner の undo/redo をスキップする。**

### デグレ防止

- 検索バーフォーカス時: `searchInput` は `.outliner-search-bar` 内にあり、`.side-panel` の外 → ガード不発動 → 従来通り outliner undo/redo が動作 ✓
- outliner テキスト編集時: 既存の `.outliner-text` チェックでスキップ → 従来通り ✓
- sidepanel が閉じている時: `sidePanelInstance === null` → ガード不発動 → 従来通り ✓
- .out 単体モードでも同じ条件で動作 ✓

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/webview/outliner.js` | グローバルキーハンドラに sidepanel ガード追加（2箇所: undo, redo） |

---

## 修正2: Scope In 検索インジケーター

### 設計

**DOM構造:**

検索バーの直上（`.outliner-search-bar` の直前）に scope 検索インジケーター要素を追加:

```html
<div class="outliner-scope-search-indicator" style="display:none">
    <span class="outliner-scope-search-tag">Search in scope</span>
</div>
<div class="outliner-search-bar">
    ...
</div>
```

**表示/非表示制御:**

`updateScopeSearchIndicator()` 関数を新規追加:

```javascript
function updateScopeSearchIndicator() {
    if (!scopeSearchIndicator) { return; }
    if (currentScope.type === 'subtree') {
        scopeSearchIndicator.style.display = '';
    } else {
        scopeSearchIndicator.style.display = 'none';
    }
}
```

呼び出し箇所:
- `setScope()` 内（scope 変更時）
- `init()` 内（初期化時、DOM参照取得）

**スタイル:**

```css
.outliner-scope-search-indicator {
    padding: 2px 8px 0;
    display: flex;
    align-items: center;
}
.outliner-scope-search-tag {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--outliner-accent-fg, #007aff);
    color: #fff;
    opacity: 0.7;
    white-space: nowrap;
}
```

**i18n:**

| キー | en | ja | ko | es | fr | zh-cn | zh-tw |
|------|----|----|----|----|-----|-------|-------|
| `outlinerSearchInScope` | `Search in scope` | `スコープ内を検索` | `범위 내 검색` | `Buscar en alcance` | `Recherche dans la portée` | `在范围内搜索` | `在範圍內搜尋` |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/outlinerWebviewContent.ts` | `.outliner-search-bar` の直前に indicator 要素を追加 |
| `src/notesWebviewContent.ts` | 同上（Notes版） |
| `src/webview/outliner.js` | `updateScopeSearchIndicator()` 関数追加、`setScope()` から呼び出し、`init()` で DOM 参照取得 |
| `src/webview/outliner.css` | indicator のスタイル追加 |
| `src/i18n/locales/*.ts` | `outlinerSearchInScope` キー追加（7言語） |

### デグレ防止

- indicator は `display:none` で初期化されるため、scope していない状態では完全に非表示
- CSS は新規クラスのみ使用（既存クラスに影響なし）
- DOM 追加位置は `.outliner-search-bar` の直前（兄弟要素追加のみ、親のレイアウトに影響なし）

---

## 修正3: Outliner → Sidepanel Markdown へのリスト形式ペースト

### 設計

**Clipboard API の変更:**

outliner.js の Cmd+C ハンドラ（line 1771-1791）で、複数ノード選択時に `text/html` も書き込む。

現在:
```javascript
navigator.clipboard.writeText(copyText);
```

変更後:
```javascript
// text/html としてネストリスト構造を生成
var htmlText = buildSelectedNodesHtml(getSelectedNodesData());
try {
    navigator.clipboard.write([
        new ClipboardItem({
            'text/plain': new Blob([copyText], {type: 'text/plain'}),
            'text/html': new Blob([htmlText], {type: 'text/html'})
        })
    ]);
} catch(err) {
    // フォールバック: text/plain のみ
    navigator.clipboard.writeText(copyText);
}
```

**HTML生成関数 `buildSelectedNodesHtml(nodesData)`:**

`getSelectedNodesData()` の結果（`[{text, level, isPage, pageId}]`）からネストされた `<ul>/<li>` 構造を生成:

```javascript
function buildSelectedNodesHtml(nodesData) {
    if (!nodesData || nodesData.length === 0) { return ''; }
    var html = '';
    var currentLevel = 0;
    var openLists = 0;
    
    for (var i = 0; i < nodesData.length; i++) {
        var nd = nodesData[i];
        var level = nd.level;
        
        // レベル上昇（ネスト深化）: <ul> を開く
        while (currentLevel < level) {
            html += '<ul>';
            openLists++;
            currentLevel++;
        }
        // レベル下降（ネスト浅化）: </li></ul> を閉じる
        while (currentLevel > level) {
            html += '</li></ul>';
            openLists--;
            currentLevel--;
        }
        // 同レベルの2番目以降: 前の </li> を閉じる
        if (i > 0 && currentLevel === level) {
            html += '</li>';
        }
        
        // <li> を開く（テキストは HTML エスケープ）
        html += '<li>' + escapeHtml(nd.text);
    }
    
    // 残りの開いているタグを全て閉じる
    while (openLists > 0) {
        html += '</li></ul>';
        openLists--;
    }
    // 最外側も閉じる
    if (nodesData.length > 0) {
        html += '</li>';
    }
    
    return '<ul>' + html + '</ul>';
}
```

入力例:
```
[
  {text: "Parent", level: 0},
  {text: "Child 1", level: 1},
  {text: "Child 2", level: 1},
  {text: "Grandchild", level: 2},
  {text: "Another", level: 0}
]
```

出力:
```html
<ul>
  <li>Parent<ul>
    <li>Child 1</li>
    <li>Child 2<ul>
      <li>Grandchild</li>
    </ul></li>
  </ul></li>
  <li>Another</li>
</ul>
```

**Cmd+X（カット）にも同様の変更を適用（line 1793-1819）。**

### markdown editor 側の処理

**変更不要。** 既存の paste ハンドラ（editor.js）が以下の優先順位でクリップボードデータを処理:

1. `text/x-any-md` → そのまま使用
2. `text/html` → Turndown で Markdown に変換
3. `text/plain` → そのまま使用

`text/html` に `<ul>/<li>` 構造が入っていれば、Turndown が自動的に:
```markdown
- Parent
  - Child 1
  - Child 2
    - Grandchild
- Another
```
に変換する。

### 内部クリップボードとの整合性

`internalClipboard` は `plainText` フィールドとシステムクリップボードのテキスト一致で照合する。`text/html` を追加しても `text/plain` の内容は変わらないため、outliner 内のペースト動作には影響しない。

### デグレ防止

- `navigator.clipboard.write()` が失敗した場合は `writeText()` にフォールバック
- 内部クリップボード（`internalClipboard`）の照合ロジックは変更なし
- outliner 同士のペーストは `text/plain` + `internalClipboard` で動作（変更なし）
- 単一ノードコピー（テキスト選択なし）は従来通り `writeText()` のまま

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/webview/outliner.js` | `buildSelectedNodesHtml()` 関数追加、Cmd+C / Cmd+X ハンドラで `clipboard.write()` 使用 |

---

## 全体の変更ファイルまとめ

| ファイル | 修正1 | 修正2 | 修正3 |
|---------|:-----:|:-----:|:-----:|
| `src/webview/outliner.js` | ✓ | ✓ | ✓ |
| `src/webview/outliner.css` | | ✓ | |
| `src/outlinerWebviewContent.ts` | | ✓ | |
| `src/notesWebviewContent.ts` | | ✓ | |
| `src/i18n/locales/en.ts` | | ✓ | |
| `src/i18n/locales/ja.ts` | | ✓ | |
| `src/i18n/locales/ko.ts` | | ✓ | |
| `src/i18n/locales/es.ts` | | ✓ | |
| `src/i18n/locales/fr.ts` | | ✓ | |
| `src/i18n/locales/zh-cn.ts` | | ✓ | |
| `src/i18n/locales/zh-tw.ts` | | ✓ | |

**editor.js は変更不要** — 既存の paste ハンドラが text/html を自動処理。

---

## 修正間の衝突チェック

| 組み合わせ | 衝突の有無 | 理由 |
|-----------|:---------:|------|
| 修正1 × 修正2 | なし | 修正1は outliner.js のキーハンドラ（undo/redo ガード）、修正2は DOM/CSS/i18n の追加。触るコード箇所が完全に独立 |
| 修正1 × 修正3 | なし | 修正1はキーハンドラのガード条件追加、修正3はコピーハンドラの変更。触るコード箇所が完全に独立 |
| 修正2 × 修正3 | なし | 修正2は scope indicator UI、修正3はクリップボード処理。完全に独立した機能 |
