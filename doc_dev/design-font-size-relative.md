# 設計書: fractal.fontSize デフォルト変更 & 相対サイズ化

## 概要

`fractal.fontSize` のデフォルトを 16px → 14px に変更し、同時にコンテンツ領域のハードコードされた px 値を `em` ベースの相対指定に移行する。UIクロム（ツールバー、検索、メニュー等）は固定 px のまま維持する。

---

## 現状の問題

### 1. outliner.css が `fractal.fontSize` を無視している

`styles.css` は `__FONT_SIZE__` プレースホルダーを使い、ビルド時に設定値で置換される:

```css
/* styles.css */
:root { --font-size: __FONT_SIZE__px; }
```

一方、`outliner.css` は **ハードコード** されており、置換処理が適用されない:

```css
/* outliner.css */
:root { --outliner-font-size: 16px; }  /* 設定値を無視 */
```

`outlinerWebviewContent.ts` で `styles.css` には `.replace('__FONT_SIZE__', ...)` があるが、`outliner.css` には適用されていない。

### 2. コンテンツ領域のサイズが font-size と連動しない

ノードテキストの行高さ (`24px`)、ノード最小高さ (`28px`)、サブテキスト (`12px`, `14px`) 等がハードコードされており、`fractal.fontSize` を変更してもレイアウトバランスが崩れる。

---

## 設計方針: 「コンテンツ領域は相対、UIクロムは固定」

VSCode 自身の設計思想に倣う:
- `editor.fontSize` はエディタ領域のみ影響
- サイドバー、ステータスバー、メニュー等のフォントサイズは別管理

### 相対化すべきもの（コンテンツ領域）

ユーザーが読み書きするテキストに直接関わる要素。`fractal.fontSize` の変更に追従すべき。

| 要素 | 現状 | 変更後 | 根拠 |
|------|------|--------|------|
| `--outliner-font-size` | `16px` ハードコード | `__FONT_SIZE__px` 動的置換 | バグ修正: 設定が反映されない |
| ノード min-height | `28px` | `1.75em` | テキスト1行分 + 余白。font-sizeに比例すべき |
| ノード line-height | `24px` | `1.5em` | テキストの行高さは font-size に比例すべき |
| バレット height | `28px` | `1.75em` | ノード高さと揃える必要がある |
| スコープボタン height | `28px` | `1.75em` | 同上 |
| ページアイコン height | `28px` | `1.75em` | 同上 |
| チェックボックス height | `28px` | `1.75em` | 同上 |
| サブテキスト font-size | `12px` | `0.75em` | 本文との比率を維持 |
| テキスト min-height | `24px` | `1.5em` | line-height と一致させる |
| テキスト line-height | `24px` | `1.5em` | font-size に比例 |
| `--outliner-indent` | `24px` | `1.5em` | テキストとのバランス。indent が固定だとフォント変更時に詰まる/空く |

### 固定でよいもの（UIクロム）

アプリケーションUIの構造要素。テキストサイズに関係なく一定の操作性を保つべき。

| 要素 | 値 | 根拠 |
|------|-----|------|
| ツールバー高さ | `40px` | 操作領域。タッチターゲットとして一定サイズ必要 |
| ツールバーアイコン | `16px` | アイコンは固定サイズが標準 |
| 検索入力 font-size | `13px` | UIコントロール。VSCode の検索も固定 |
| メニュー/ドロップダウン font-size | `13px` / `11px` | UIクロム |
| パンくず font-size | `12px` | ナビゲーションUI |
| ダイアログ各種 | 各 px 値 | モーダルUI |
| ツールチップ | `11px` | 補助的UI |
| `--outliner-bullet-size` | `6px` | 微細なビジュアル要素。相対化すると sub-pixel になりやすい |
| `--outliner-gutter` | `32px` | レイアウト余白。コンテンツサイズと独立 |
| ボーダー、角丸、シャドウ | 各 px 値 | 装飾的要素 |
| サイドバー幅/アウトライン項目 (styles.css) | 各 px 値 | UIクロム |

### 判断基準

```
相対化する条件:
  1. ユーザーが直接読み書きするテキストである
  2. テキストの行高さ・余白としてテキストサイズと視覚的にバランスが必要
  3. font-size 変更時にバランスが崩れると可読性に影響する

固定にする条件:
  1. アプリケーションUIの操作要素である
  2. アイコン・バッジ等の固定サイズが期待されるビジュアル
  3. 相対化すると sub-pixel レンダリングで表示が崩れるほど小さい
```

---

## 変更対象ファイル

### 1. package.json

```diff
 "fractal.fontSize": {
   "type": "number",
-  "default": 16,
+  "default": 14,
   "description": "Base font size in pixels"
 }
```

### 2. src/outlinerWebviewContent.ts

`outliner.css` にも `__FONT_SIZE__` 置換を適用:

```diff
 const outlinerCssPath = path.join(__dirname, 'webview', 'outliner.css');
-const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');
+const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8')
+    .replace('__FONT_SIZE__', String(config.fontSize));
```

### 3. src/notesWebviewContent.ts

同様に outliner.css の `__FONT_SIZE__` 置換を追加。

### 4. src/webview/outliner.css

```diff
 :root {
     --outliner-indent: 24px;
+    --outliner-indent: __FONT_SIZE_INDENT__; /* 検討: 1.5em にするか */
     --outliner-bullet-size: 6px;
-    --outliner-font-size: 16px;
+    --outliner-font-size: __FONT_SIZE__px;
     --outliner-line-height: 1.5;
 }
```

コンテンツ領域の px → em 変換:

```diff
 .outliner-node {
-    min-height: 28px;
+    min-height: 1.75em;
 }

 .outliner-bullet {
     width: 24px;          /* 固定: UI操作要素 */
-    height: 28px;
+    height: 1.75em;
 }

 .outliner-text {
-    min-height: 24px;
-    line-height: 24px;
+    min-height: 1.5em;
+    line-height: 1.5;     /* 単位なし推奨（CSS best practice） */
 }

 .outliner-subtext {
-    font-size: 12px;
+    font-size: 0.75em;
 }
```

### 5. デフォルトフォールバック値の更新

各 Provider の fallback を 16 → 14 に変更:

- `src/editorProvider.ts`: `fontSize: config?.fontSize ?? 14`
- `src/outlinerProvider.ts`: `fontSize: config.get<number>('fontSize', 14)`
- `src/notesEditorProvider.ts`: `fontSize: config.get<number>('fontSize', 14)`

### 6. test/build-standalone-outliner.js, test/build-standalone-notes.js

テスト用スタンドアロンHTMLでも `__FONT_SIZE__` 置換が必要。

---

## 変更しないもの

- `styles.css` のサイドバー/ツールバー/検索関連の px 値
- `outliner.css` の検索/メニュー/ダイアログ/ツールチップの px 値
- `--outliner-bullet-size: 6px`
- `--outliner-gutter: 32px`
- `editor.js` / `outliner.js` 内の動的 px 計算（ポジショニング用）

---

## テスト計画

1. `fractal.fontSize` を 12, 14, 16, 20 に変更し、各エディタで表示確認
2. Outliner のノードテキスト、サブテキスト、インデントのバランス確認
3. Markdown editor の見出し・本文・コードブロックのバランス確認
4. Notes editor の左パネル + Outliner 領域の表示確認
5. 既存 Playwright テスト全通過確認（テスト内のスタンドアロンHTMLも更新必要）

---

## リスク

| リスク | 対策 |
|--------|------|
| em 変換で sub-pixel が発生し表示がぼやける | 最終的な計算値を確認。問題があれば該当要素のみ px に戻す |
| 既存ユーザーのレイアウトが変わる | デフォルト変更は breaking change。CHANGELOG に明記 |
| テスト内のピクセル比較が壊れる | スタンドアロンHTMLのビルドスクリプトを更新 |
