# 実装計画 — Outliner スコープ改善 + 追加機能 (v0.195.468〜)

## 実装順序と依存関係

```
Phase 1 (スコープ基盤) → Phase 2 (パンくず) → Phase 3 (タグ・UI)
Phase 4 (テーマ) → Phase 5 (i18n)
Phase 6 (ページ設定) → Phase 7 (ページ制約)
各Phase完了後にテスト実行
```

---

## Phase 1: スコープ基盤修正 (要件4, 6)

### Step 1.1: clearSearch() からスコープリセットを削除
**ファイル**: outliner.js
**修正箇所**:
- 行1582-1588: `clearSearch()` 関数
  - 削除: `currentScope = { type: 'document' };` (行1585)
  - 削除: `scopeBadge.textContent = '';` (行1586)
  - 追加: `clearTimeout(debounceTimer);` (debounceタイマークリア)
- **注意**: `debounceTimer` は `setupSearchBar()` のローカル変数。クロージャ外からアクセスするには、モジュールスコープに移動するか、clearSearch を setupSearchBar 内で定義する構造変更が必要。

### Step 1.2: ESCハンドラからスコープ解除を削除
**ファイル**: outliner.js
**修正箇所**:
- 行1106-1113: ノードkeydownのEscaseブロック
  - 削除: `else if (currentScope.type !== 'document') { setScope({ type: 'document' }); }` (行1110-1111)
  - 結果: ESCは検索クリアのみ

### Step 1.3: ノード削除時のスコープ安全確認
**ファイル**: outliner.js
**修正箇所** (3箇所):
- `deleteSelectedNodes()` (行733-757): 削除後に `if (currentScope.type === 'subtree' && !model.getNode(currentScope.rootId)) { setScope({ type: 'document' }); }` 追加
- `handleBackspaceAtStart()` (行1388-1439): `model.removeNode()` 呼び出し後に同様のチェック追加
- コンテキストメニュー削除ハンドラ (行1702-1710): 同様のチェック追加

### Step 1.4: Cmd+] でスコープ設定 / Cmd+[ でスコープ解除 (要件2, 4)
**ファイル**: outliner.js
**修正箇所**: keydownハンドラの `e.metaKey || e.ctrlKey` ブロック内 (行1040付近)
```javascript
case ']':
    e.preventDefault();
    e.stopPropagation();
    if (focusedNodeId) { setScope({ type: 'subtree', rootId: focusedNodeId }); }
    return;
case '[':
    e.preventDefault();
    e.stopPropagation();
    setScope({ type: 'document' });
    return;
```

### Step 1.5: 右クリックにスコープ追加 (要件1)
**ファイル**: outliner.js
**修正箇所**: `showContextMenu()` (行1622-1721)
- セパレータ後に「Scope」メニュー項目追加
- スコープ中なら「Clear Scope」も追加

---

## Phase 2: パンくずリスト (要件3)

### Step 2.1: HTML構造追加
**ファイル**: outlinerWebviewContent.ts (行54-61)
- `outliner-search-bar` の上に `<div class="outliner-breadcrumb"></div>` 追加
- `<span class="outliner-scope-badge"></span>` は削除（パンくずに統合）

### Step 2.2: CSS追加
**ファイル**: outliner.css
```css
.outliner-breadcrumb {
    display: none;  /* スコープ時のみ表示 */
    flex-shrink: 0;
    padding: 6px 16px;
    border-bottom: 1px solid var(--outliner-border);
    font-size: 12px;
    color: var(--outliner-fg);
    overflow-x: auto;
    white-space: nowrap;
    align-items: center;
}
.outliner-breadcrumb.is-visible { display: flex; }
.outliner-breadcrumb-item {
    cursor: pointer;
    opacity: 0.7;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.outliner-breadcrumb-item:hover { opacity: 1; }
.outliner-breadcrumb-separator { margin: 0 4px; opacity: 0.4; }
.outliner-breadcrumb-spacer { flex: 1; }
.outliner-breadcrumb-top {
    cursor: pointer;
    font-weight: 600;
    opacity: 0.7;
    flex-shrink: 0;
}
.outliner-breadcrumb-top:hover { opacity: 1; }
```

### Step 2.3: パンくず描画関数
**ファイル**: outliner.js
- 新関数 `updateBreadcrumb()` を作成
- `setScope()` 内から呼び出し（scopeBadge更新を置換）
- `renderTree()` 内からも呼び出し（テキスト編集時の更新対応）
- ロジック:
  1. `currentScope.type === 'document'` → パンくず非表示
  2. `currentScope.type === 'subtree'` → 祖先チェーンを `parentId` で辿る
  3. `[祖先1] > [祖先2] > [スコープノード] ... [TOP]` を生成
  4. 各祖先クリック → `setScope({ type: 'subtree', rootId: ancestorId })`
  5. TOP クリック → `setScope({ type: 'document' })`
  6. TOPは右端（`flex: 1` のスペーサーで右寄せ）

### Step 2.4: scopeBadge 廃止
**ファイル**: outliner.js
- 行91: `scopeBadge` 初期化 → `breadcrumbEl` に変更
- `setScope()` 内の `scopeBadge.textContent` 更新 → `updateBreadcrumb()` 呼び出しに変更

---

## Phase 3: タグクリック検索 + UI改善 (要件7)

### Step 3.1: タグクリックハンドラ
**ファイル**: outliner.js
**修正箇所**: `createNodeElement()` 内のテキスト要素
- `textEl` に `click` イベントリスナー追加（既存のmousedownとは別）
- `e.target.closest('.outliner-tag')` でタグ要素判定
- **focus中のノードではタグクリック検索を無効化**（カーソル移動を優先）
- blur中のノード（`renderInlineText` 表示中）でのみ検索発火:
  ```javascript
  textEl.addEventListener('click', function(e) {
      if (document.activeElement === textEl) return; // focus中は無視
      var tag = e.target.closest('.outliner-tag');
      if (tag) {
          e.preventDefault();
          e.stopPropagation();
          searchInput.value = tag.textContent;
          executeSearch();
          searchInput.focus();
      }
  });
  ```

---

## Phase 4: テーマ適用 (要件12)

### Step 4.1: テーマ別CSS変数追加
**ファイル**: outliner.css
- 7テーマ分の `[data-theme="xxx"]` ブロックを追加
- 各テーマで以下の変数を上書き:
  - `--outliner-bg`, `--outliner-fg`, `--outliner-border`
  - `--outliner-hover-bg`, `--outliner-focus-bg`
  - `--outliner-search-bg`, `--outliner-search-border`, `--outliner-search-fg`
  - `--outliner-placeholder`
  - `--outliner-tag-color`, `--outliner-tag-bg`

### Step 4.2: hardcoded rgba値のCSS変数化
**ファイル**: outliner.css
- 行256: `.outliner-text:focus` bg → `--outliner-text-focus-bg` 変数化
- 行294: `.outliner-subtext.is-editing` bg → 同上
- 行320: `.outliner-text code` bg → `--outliner-code-bg` 変数化
- 行494-499: スクロールバー → `--outliner-scrollbar-thumb` 変数化

### Step 4.3: テーマ値の定義
**styles.css のテーマ色を参考に、outliner.css 用の値を定義**:
| テーマ | --outliner-bg | --outliner-fg | --outliner-border |
|--------|-------------|-------------|-----------------|
| github | #ffffff | #24292f | #d0d7de |
| sepia | #fbf8f1 | #5b4636 | #e0d6c8 |
| night | #1a1b26 | #a9b1d6 | #32344a |
| dark | #0d1117 | #c9d1d9 | #30363d |
| minimal | #fafafa | #2d2d2d | #e0e0e0 |
| things | #ffffff | #1C1C1E | #E5E5EA |
| perplexity | #ffffff | #1a1a1a | #D8D8D0 |

---

## Phase 5: i18n適用 (要件13)

### Step 5.1: outlinerProvider.ts に locale 初期化追加
**修正箇所**:
- import に `initLocale, getWebviewMessages` 追加
- `resolveCustomTextEditor` 内で `initLocale` 呼び出し
- config に `webviewMessages` を追加して webview に渡す

### Step 5.2: outlinerWebviewContent.ts に i18n メッセージ埋め込み
**修正箇所**:
- `OutlinerConfig` に `webviewMessages` 追加
- HTML script 内に `window.__outlinerMessages = ${JSON.stringify(messages)};` 埋め込み

### Step 5.3: i18n キー追加 (全7 locale)
**ファイル**: ja.ts, en.ts, es.ts, fr.ts, ko.ts, zh-cn.ts, zh-tw.ts
**追加キー** (約15個):
- outlinerNoItems, outlinerAddHint
- outlinerFocusMode, outlinerTreeMode
- outlinerScope, outlinerClearScope, outlinerTop
- outlinerRemovePage, outlinerOpenPage, outlinerMakePage
- outlinerRemoveCheckbox, outlinerAddCheckbox
- outlinerEditSubtext, outlinerAddSubtext
- outlinerMoveUp, outlinerMoveDown, outlinerDelete

### Step 5.4: outliner.js でハードコード文字列を置換
**修正箇所**: 全ハードコード文字列をi18nキー参照に変更
- `var i18n = window.__outlinerMessages || {};`
- 各箇所: `i18n.outlinerNoItems || 'No items yet'` 形式

---

## Phase 6: ページディレクトリ設定 (要件8)

### Step 6.1: package.json に設定追加
```json
"fractal.outlinerPageDir": {
    "type": "string",
    "default": "./pages",
    "description": "Outliner page files directory. Relative to .mmd file or absolute path."
}
```

### Step 6.2: outlinerProvider.ts の getPagesDirPath() 修正
- VSCode設定 `outlinerPageDir` を読み込み
- mmd JSONデータ内の `pageDir` フィールドを優先（個別設定）
- 相対パスはmmdファイルからの相対で解決
- 絶対パスはそのまま使用

### Step 6.3: outliner-model.js にpageDirフィールド追加
- JSONシリアライズ/デシリアライズに `pageDir` を追加
- 既存ファイルで `pageDir` がない場合は undefined（設定値にフォールバック）

### Step 6.4: 設定ボタンUI
**ファイル**: outliner.js, outlinerWebviewContent.ts
- 検索バー右端に歯車アイコンボタン追加
- クリック → ホストに `setPageDir` メッセージ送信
- ホスト側: `vscode.window.showInputBox` でパス入力
- 入力値をmmdのJSONデータに保存 + webviewに通知

---

## Phase 7: ページ表示制約 (要件9, 10, 11)

### Step 7.1: outlinerから開いたページのフラグ管理
**ファイル**: outlinerProvider.ts, editorProvider.ts
- `OutlinerProvider` に static `outlinerPagePaths: Map<string, string>` 追加
  - key: ファイルパス, value: ページディレクトリパス
- `handleOpenPage()` 内: Map にエントリ追加
- `editorProvider.ts` の `resolveCustomTextEditor` 内: Map を参照

### Step 7.2: 画像パス強制 (要件10)
**ファイル**: editorProvider.ts
- outlinerPageと判定された場合:
  - `imageDirectoryManager.setFileImageDir()` で `{pageDir}/images/` を強制設定
  - `setImageDir` メッセージハンドラで変更を拒否（or ハンドラ内でスキップ）
  - webview に `hideImageDirButton: true` フラグを送信

### Step 7.3: add page 非表示 (要件11)
**ファイル**: webviewContent.ts, editor.js
- `EditorConfig` に `isOutlinerPage?: boolean` 追加
- editor.js: `COMMAND_PALETTE_ITEMS` 生成時に `isOutlinerPage` なら `addPage` を除外
- ツールバーの addPage ボタンも非表示

### Step 7.4: ページクローズ時のクリーンアップ
**ファイル**: editorProvider.ts
- `webviewPanel.onDidDispose` で `OutlinerProvider.outlinerPagePaths.delete(filePath)`

---

## Phase 8: テスト + ビルド

### Step 8.1: 各Phase後にテスト
```bash
npx playwright test  # 全テスト通過確認
```

### Step 8.2: 最終ビルド
```bash
npm run compile && npm run package
```

---

## 修正ファイル一覧

| ファイル | Phase | 修正内容 |
|----------|-------|----------|
| outliner.js | 1,2,3 | スコープ、パンくず、タグクリック |
| outliner.css | 2,4 | パンくず、テーマ |
| outlinerWebviewContent.ts | 2,5,6 | パンくずHTML、i18n、設定ボタン |
| outlinerProvider.ts | 5,6,7 | i18n、ページ設定、フラグ管理 |
| outliner-model.js | 6 | pageDir フィールド |
| outliner-search.js | — | 変更なし（検索は既にスコープ対応済み） |
| package.json | 6 | outlinerPageDir 設定 |
| editorProvider.ts | 7 | outlinerPage 判定、画像パス制約 |
| webviewContent.ts | 7 | isOutlinerPage config |
| editor.js | 7 | addPage非表示 |
| i18n/locales/*.ts (7ファイル) | 5 | outliner用キー追加 |
| editor-utils.js | — | 変更なし |

合計: **12ファイル** (i18n 7ファイル含む)
