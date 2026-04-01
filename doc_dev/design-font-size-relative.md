# 設計書: fractal.fontSize デフォルト変更 & 相対サイズ化

## 概要

`fractal.fontSize` のデフォルトを 16px → 14px に変更し、同時にコンテンツ領域のハードコードされた px 値を `em` ベースの相対指定に移行する。UIクロム（ツールバー、検索、メニュー等）は固定 px のまま維持する。

---

## 現状の問題

### 1. outliner.css が `fractal.fontSize` を無視している

`styles.css` は `__FONT_SIZE__` プレースホルダーを使い、ビルド時に設定値で置換される:

```css
/* styles.css:2 */
:root { --font-size: __FONT_SIZE__px; }
```

一方、`outliner.css` は **ハードコード**:

```css
/* outliner.css:11 */
--outliner-font-size: 16px;  /* 設定値を無視 */
```

`__FONT_SIZE__` 置換の適用状況:

| ファイル | styles.css に置換あり | outliner.css に置換あり |
|---------|---------------------|----------------------|
| `webviewContent.ts:80` | ✓ | — (outliner.css使わない) |
| `outlinerWebviewContent.ts:34` | ✓ | ✗ (29行目で raw読み込み) |
| `notesWebviewContent.ts:40` | ✓ | ✗ (36行目で raw読み込み) |
| `electron/html-generator.ts:301` | ✓ | ✗ (298行目で raw読み込み) |
| `test/build-standalone-outliner.js:46` | ✓ (ただし '16px' 直値) | ✗ (47行目で raw読み込み) |
| `test/build-standalone-notes.js:48` | ✓ (ただし '16px' 直値) | ✗ (49行目で raw読み込み) |

### 2. コンテンツ領域のサイズが font-size と連動しない

ノードテキストの行高さ (`24px`)、ノード最小高さ (`28px`)、サブテキスト (`12px`) 等がハードコードされており、`fractal.fontSize` を変更してもレイアウトバランスが崩れる。

---

## 設計方針: 「コンテンツ領域は相対、UIクロムは固定」

VSCode 自身の設計思想に倣う:
- `editor.fontSize` はエディタ領域のみ影響
- サイドバー、ステータスバー、メニュー等のフォントサイズは別管理

---

## 変更内容 (全7箇所)

### 変更1: package.json — デフォルト値変更

```diff
 "fractal.fontSize": {
   "type": "number",
-  "default": 16,
+  "default": 14,
   "description": "Base font size in pixels"
 }
```

### 変更2: src/webviewContent.ts — フォールバック値更新

```diff
 const safeConfig: EditorConfig = {
     theme: config?.theme ?? 'github',
-    fontSize: config?.fontSize ?? 16,
+    fontSize: config?.fontSize ?? 14,
```

### 変更3: src/outlinerProvider.ts — フォールバック値更新

```diff
-fontSize: config.get<number>('fontSize', 16),
+fontSize: config.get<number>('fontSize', 14),
```

### 変更4: src/notesEditorProvider.ts — フォールバック値更新

```diff
-fontSize: config.get<number>('fontSize', 16),
+fontSize: config.get<number>('fontSize', 14),
```

### 変更5: src/webview/outliner.css — 動的置換 + 相対化

`:root` 変数:
```diff
-    --outliner-indent: 24px;
+    --outliner-indent: 1.5em;
     --outliner-bullet-size: 6px;
-    --outliner-font-size: 16px;
+    --outliner-font-size: __FONT_SIZE__px;
```

`.outliner-node` (L290):
```diff
-    min-height: 28px;
+    min-height: 1.75em;
```

`.outliner-bullet` (L333):
```diff
-    height: 28px;
+    height: 1.75em;
```

`.outliner-scope-btn` (L387):
```diff
-    height: 28px;
+    height: 1.75em;
```

`.outliner-page-icon` (L424):
```diff
-    height: 28px;
+    height: 1.75em;
```

`.outliner-checkbox` (L442):
```diff
-    height: 28px;
+    height: 1.75em;
```

`.outliner-text` (L463-464):
```diff
-    min-height: 24px;
-    line-height: 24px;
+    min-height: 1.5em;
+    line-height: 1.5;
```

`.outliner-subtext` (L489):
```diff
-    font-size: 12px;
+    font-size: 0.75em;
```

### 変更6: outliner.css を読み込む全ファイルに `__FONT_SIZE__` 置換を追加

**src/outlinerWebviewContent.ts (L29)**:
```diff
-const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');
+const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8')
+    .replace('__FONT_SIZE__', String(config.fontSize));
```

**src/notesWebviewContent.ts (L36)**:
```diff
-const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');
+const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8')
+    .replace('__FONT_SIZE__', String(config.fontSize));
```

**electron/src/html-generator.ts (L298)**:
```diff
-const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');
+const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8')
+    .replace('__FONT_SIZE__', String(config.fontSize));
```

**test/build-standalone-outliner.js (L46-47)**:
```diff
 const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
-    .replace('__FONT_SIZE__', '16px');
-const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf-8');
+    .replace('__FONT_SIZE__', '14');
+const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf-8')
+    .replace('__FONT_SIZE__', '14');
```

**test/build-standalone-notes.js (L47-49)**:
```diff
 const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
-    .replace('__FONT_SIZE__', '16px');
-const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf-8');
+    .replace('__FONT_SIZE__', '14');
+const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf-8')
+    .replace('__FONT_SIZE__', '14');
```

### 変更7: test/build-standalone.js (Markdown) — フォールバック値更新

```diff
 const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
-    .replace('__FONT_SIZE__', '16px');
+    .replace('__FONT_SIZE__', '14');
```

---

### 変更5b: src/webview/styles.css — Markdown コンテンツ領域の相対化

`.editor pre` (L638):
```diff
-.editor pre {
-    font-size: 14px;
+.editor pre {
+    font-size: 0.875em;
```

`.source-editor` (L432):
```diff
-.source-editor {
-    font-size: 14px;
+.source-editor {
+    font-size: 0.875em;
```

**注意:** Perplexity テーマは `.editor pre { font-size: 0.875em }` (L575)、Things テーマは `.editor pre { font-size: 0.867em }` (L606) で既に em 化済み。今回のデフォルト変更はこれらのテーマオーバーライドの `em` 値を更に上書きするものではなく、テーマオーバーライドが指定されていない場合の基本値を em 化する。

---

## 変更しないもの

- `styles.css` のサイドバー/ツールバー/検索関連の px 値
- `outliner.css` の検索/メニュー/ダイアログ/ツールチップの px 値
- `--outliner-bullet-size: 6px`
- `--outliner-gutter: 32px`
- `.outliner-bullet` の `width: 24px` (操作ターゲットとして固定サイズ必要)
- `.outliner-scope-btn` の `width: 20px` (同上)
- `.outliner-page-icon` の `width: 20px`, `font-size: 14px` (アイコン固定サイズ)
- `.outliner-checkbox` の `width: 20px` (同上)
- `.outliner-checkbox input` の `width: 14px`, `height: 14px` (チェックボックスUI)
- `editor.js` / `outliner.js` 内の動的 px 計算（ポジショニング用）

---

## 注意: `__FONT_SIZE__` 置換の整合性

`styles.css:2` は `--font-size: __FONT_SIZE__px;` の形式。CSS側に `px` が記述されているため、置換値は数値のみ。

| 呼び出し元 | 現在の置換値 | 結果 | 正誤 |
|-----------|------------|------|------|
| `webviewContent.ts:80` | `String(safeConfig.fontSize)` → `'16'` | `16px` | ✓ 正しい |
| `outlinerWebviewContent.ts:34` | `String(config.fontSize)` → `'16'` | `16px` | ✓ 正しい |
| `notesWebviewContent.ts:40` | `String(config.fontSize)` → `'16'` | `16px` | ✓ 正しい |
| `electron/html-generator.ts:301` | `String(config.fontSize)` → `'16'` | `16px` | ✓ 正しい |
| `test/build-standalone.js:41` | `'16px'` | `16pxpx` | ✗ **バグ** |
| `test/build-standalone-outliner.js:46` | `'16px'` | `16pxpx` | ✗ **バグ** |
| `test/build-standalone-notes.js:48` | `'16px'` | `16pxpx` | ✗ **バグ** |

**対策**: ビルドスクリプト3つの `'16px'` → `'14'` (数値のみ) に修正。既存バグも同時に修正。

---

## テーマ影響分析（7テーマ全確認済み）

### outliner.css

7テーマブロック（github, sepia, night, dark, minimal, things, perplexity）を確認済み。
**いずれも `--outliner-font-size` のオーバーライドなし** → `:root` の変更で全テーマに自動反映。
テーマ追加対応は不要。

### styles.css

| テーマ | body font-size | 追従方法 |
|--------|---------------|----------|
| github/sepia/night/dark/minimal | `var(--font-size)` | 自動追従 |
| perplexity | `var(--font-size)` | 自動追従 |
| things | `calc(var(--font-size) - 1px)` | 自動追従（14px → 13px） |

全テーマで `--font-size` CSS変数ベースのため、デフォルト値変更に自動追従する。

### em 相対化の影響

em は親要素の `font-size` から計算される。outliner.css のコンテンツ要素は `.outliner-container` の `font-size: var(--outliner-font-size)` から継承するため、全テーマで自動的にバランスが保たれる。

---

## デグレ防止チェックリスト

- [ ] styles.css の `--font-size` が正常に動作（Markdown editor）
- [ ] outliner.css の `--outliner-font-size` が設定値に追従（Outliner editor）
- [ ] Notes editor のメインエリアがフォント設定に追従
- [ ] テーマ切替でレイアウトが崩れない（7テーマ全確認）
- [ ] 既存 Playwright テスト全通過
- [ ] ノードのテキスト・サブテキスト・バレット・インデントのバランスが 12/14/16/20px で適切
- [ ] サイドパネルの EditorInstance が正常動作
- [ ] Electron版ビルドが成功

---

## テスト計画

1. スタンドアロンHTML再生成（3エディタ分）
2. 既存テスト全実行（回帰確認）
3. `fractal.fontSize` を 12, 14, 16, 20 に変更し、各エディタで目視確認（手動）
