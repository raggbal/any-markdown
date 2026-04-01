# 設計書 — Outliner editor 3点改善

> **対象**: `src/webview/outliner.js`, `src/webview/outliner.css`
> **要件定義書**: `doc_dev/requirements-outliner-link-indent-paste.md`

---

## 修正1: Markdownリンク記法のクリック対応 + URLペースト自動変換

### 1A. blur時リンクのクリック対応 (L-1, L-2, L-4, L-5)

**課題**: `renderInlineText()` で `[text](url)` → `<a href="url">text</a>` に変換されるが、contenteditableの中にあるためクリックがブラウザの編集動作（カーソル配置）として処理され、リンクを開けない。

**設計方針**: blur時（非編集時）のクリックイベントをハンドルし、`<a>` タグがクリックされた場合に `host.openLink(href)` でホストに委任する。

**実装箇所**: `createNodeElement()` 内の `.outliner-text` の既存 `mousedown` イベントリスナー

**処理フロー**:
```
.outliner-text の mousedown イベント（既存ハンドラの先頭に追加）
├─ focusedNodeId !== node.id && !e.shiftKey ?（blur状態 かつ Shift無し？）
│   ├─ Yes → e.target.closest('a') で <a> タグを検出
│   │   ├─ <a> あり → e.preventDefault() + e.stopPropagation()
│   │   │              host.openLink(a.getAttribute('href'))
│   │   │              return（フォーカス遷移を防止してリンクを開く）
│   │   └─ <a> なし → 通常のクリック処理（フォーカス移動等）
│   └─ No → 既存のShift+Click/通常Click処理
```

**重要な設計判断**:
- **`mousedown` イベントを使う**（`click` ではない）。理由: blur状態のノードをクリックすると `mousedown` → `focus`（`renderEditingText()` で `<a>` タグ消失）→ `click` の順でイベントが発火する。`click` 時点では `<a>` タグが既にDOMから消えており検出できない。`mousedown` で `preventDefault()` することでフォーカス遷移自体を防止し、`<a>` タグの消失を回避する。
- `focusedNodeId !== node.id` の条件で、編集中のノードではリンクを開かない（テキスト編集を優先）
- blur状態のノードは `renderInlineText()` で `<a>` タグが存在し、focus状態のノードは `renderEditingText()` で `<a>` タグが存在しないため、focus中は自然にリンク機能が無効になる
- 既存の `mousedown` ハンドラの先頭に条件分岐を追加する形で実装。`<a>` クリック時は `return` で既存のShift+Click/通常Click処理をスキップする

**CSSの追加**:
```css
.outliner-text a {
    cursor: pointer;  /* 追加: リンクカーソルを表示 */
}
```

**HostBridge**: 既に `outliner-host-bridge.js` が `shared` 経由で `openLink(href)` を持っている。`outlinerProvider.ts` で `vscode.env.openExternal()` にルーティング済み。追加変更不要。

**test-host-bridge**: テスト用の `test-host-bridge.js` にも `openLink` は `sidepanel-bridge-methods.js` 経由で存在。`__testApi.messages` にメッセージが記録される。

---

### 1B. URLペースト自動変換 (L-3)

**課題**: URLをペーストする際に手動で `[text](url)` と書く必要がある。

**設計方針**: 単一行ペースト処理の中で、ペーストテキストがURL形式かどうかを判定し、URLの場合は `[URL](URL)` 形式に変換してからモデルに保存する。

**実装箇所**: `handleNodePaste()` 内の単一行ペースト処理（L1565付近）

**処理フロー**:
```
単一行ペースト分岐（既存）
├─ clipText が URL形式か判定: /^https?:\/\/\S+$/.test(clipText.trim())
│   ├─ Yes → clipText を '[' + clipText.trim() + '](' + clipText.trim() + ')' に変換
│   └─ No → そのまま
├─ 既存のテキスト挿入処理を実行
```

**URL判定条件**:
- `http://` または `https://` で始まる
- 空白を含まない（`\S+`）
- 前後の空白はtrimで除去
- 正規表現: `/^https?:\/\/\S+$/`

**変換例**:
- `https://example.com` → `[https://example.com](https://example.com)`
- `http://example.com/path?q=1` → `[http://example.com/path?q=1](http://example.com/path?q=1)`
- `not a url` → そのまま
- `https://example.com with space` → そのまま（空白含むためURL判定失敗）

**カーソル位置の調整**: 変換後のテキスト長が変わるため、`curOff + convertedText.length` にカーソルを配置する。

---

## 修正2: 複数ノード選択時のTab/Shift+Tabインデント・デインデント

### 設計方針

Tab/Shift+Tabのキーハンドラ（`case 'Tab':` ブロック）の冒頭に、`selectedNodeIds.size > 0` の場合の分岐を追加する。既存の単一ノード処理は変更しない。

### 実装箇所

`handleNodeKeydown()` 内の `case 'Tab':` ブロック（L1926-1944）

### 処理フロー

```
case 'Tab':
├─ スコープヘッダー → break（既存）
├─ e.preventDefault()（既存）
├─ selectedNodeIds.size > 0 ?
│   ├─ Yes → 複数ノードインデント/デインデント処理（新規）
│   └─ No → 既存の単一ノード処理
```

### 複数ノードインデント処理（Tab）

```javascript
// 1. DOM表示順でソート（上から下）
var flat = model.getFlattenedIds(true); // visibleのみ
var sortedIds = flat.filter(function(id) { return selectedNodeIds.has(id); });

// 2. スナップショット保存
saveSnapshot();

// 3. 上から順にインデント
var anyMoved = false;
for (var i = 0; i < sortedIds.length; i++) {
    if (model.indentNode(sortedIds[i])) {
        anyMoved = true;
    }
}

// 4. ツリー再描画 + 選択状態復元
if (anyMoved) {
    renderTree();
    // 選択状態を復元（renderTreeで全DOMが再構築されるため）
    sortedIds.forEach(function(id) {
        var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + id + '"]');
        if (nodeEl) { nodeEl.classList.add('is-selected'); }
    });
    scheduleSyncToHost();
}
```

### 複数ノードデインデント処理（Shift+Tab）

```javascript
// 1. DOM表示順でソート
var flat = model.getFlattenedIds(true);
var sortedIds = flat.filter(function(id) { return selectedNodeIds.has(id); });

// 2. スナップショット保存
saveSnapshot();

// 3. 上から順にデインデント（スコープ境界チェック付き）
var anyMoved = false;
for (var i = 0; i < sortedIds.length; i++) {
    var n = model.getNode(sortedIds[i]);
    // スコープ境界制限
    if (currentScope.type === 'subtree' && currentScope.rootId && n && n.parentId === currentScope.rootId) {
        continue; // このノードはスキップ
    }
    if (model.outdentNode(sortedIds[i])) {
        anyMoved = true;
    }
}

// 4. ツリー再描画 + 選択状態復元（インデントと同じ）
```

### 選択状態の復元

`renderTree()` は全DOMを再構築するため、選択のCSS表示（`.is-selected`クラス）が消える。`selectedNodeIds` Set自体は変わらないため、再描画後にDOMに再適用する。

### デグレ防止

- 単一ノード時（`selectedNodeIds.size === 0`）は既存パスをそのまま通る
- `model.indentNode()` / `model.outdentNode()` のモデル層は変更なし
- スコープ境界チェックは既存の単一ノード用ロジックと同じ条件を使用

---

## 修正3: ペースト時の空行ノード作成抑制

### 設計方針

`pasteNodesFromText()` 内のパース処理で、中間の空行もスキップする。現在は最終行の空行のみスキップされている。

### 実装箇所

`pasteNodesFromText()` のパースループ（L1606-1625）

### 変更内容

```javascript
// 変更前（L1622）:
if (content === '' && i === lines.length - 1) { continue; } // 最終空行スキップ

// 変更後:
if (content === '') { continue; } // 空行は全てスキップ
```

### clipNodeIndexMapへの影響

`clipNodeIndexMap` は `parsed[n] → clipboardNodes[originalIndex]` のマッピングを保持する。空行スキップ時は `parsed.push()` が呼ばれないため `clipNodeIndexMap.push(i)` も呼ばれず、マッピングは自動的に正しく維持される。

**検証**:
- 入力: `["line1", "", "line3"]`（clipboardNodes = [A, B, C]）
- 変更前: parsed = [{text:"line1"}, {text:""}, {text:"line3"}], clipNodeIndexMap = [0, 1, 2]
- 変更後: parsed = [{text:"line1"}, {text:"line3"}], clipNodeIndexMap = [0, 2]
  - parsed[0] → clipboardNodes[0] = A ✓
  - parsed[1] → clipboardNodes[2] = C ✓

### スペースのみの行の扱い

インデント解析でスペースはインデントレベルとして消費されるため、スペースのみの行は `content = ""` となり空行としてスキップされる。タブのみの行も同様。これは意図した動作。

### デグレ防止

- 内部クリップボード（ノード間コピー&ペースト）: 空テキストノードは通常コピーされないため影響なし
- 最終行の空行スキップ: 変更後は全空行がスキップされるため、最終行の特別扱いは不要になるが、条件が包含関係にあるため問題なし

---

## 修正間の衝突分析

### 修正1 vs 修正2
- 修正1はリンクのクリック処理とペースト時のURL変換
- 修正2はTab/Shift+Tabの複数選択対応
- コード上の接点なし。衝突なし。

### 修正1 vs 修正3
- 修正1のURLペースト変換は単一行ペースト処理（`!clipText.includes('\n')`分岐）
- 修正3は複数行ペースト処理（`pasteNodesFromText()`）
- 処理パスが完全に分離。衝突なし。

### 修正2 vs 修正3
- 修正2はTab/Shift+Tabキーハンドラ
- 修正3はペースト処理
- コード上の接点なし。衝突なし。

---

## 既存機能へのデグレリスク分析

| 修正 | リスク | 対策 |
|---|---|---|
| 1A | blur状態のクリックで意図せずリンクを開く | `focusedNodeId !== node.id` の条件で編集中は無効。`mousedown` で `<a>` タグを検出した場合のみリンクを開き、`<a>` 以外のクリックは通常のフォーカス遷移。`preventDefault()` でfocus遷移を防止するため、リンクを開いた後もノードはblur状態のまま |
| 1B | URLっぽいがURLでないテキストが変換される | `/^https?:\/\/\S+$/` で厳密に `http://` or `https://` 開始 + 空白なしを要求 |
| 2 | 単一ノードのTab/Shift+Tab動作が変わる | `selectedNodeIds.size > 0` で分岐。選択がない場合は既存パスを通る |
| 2 | 複数ノードインデント時に親子関係が壊れる | `model.indentNode()` は前兄弟がない場合は `false` を返して何もしない。安全 |
| 3 | 内部クリップボードのページメタデータ復元に影響 | `clipNodeIndexMap` のマッピングが正しく維持されることを検証済み |
