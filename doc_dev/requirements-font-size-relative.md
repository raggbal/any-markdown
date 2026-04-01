# 要件定義書: fractal.fontSize デフォルト変更 & 相対サイズ化

## 背景

`fractal.fontSize` のデフォルトが 16px であるが、14px に変更したい。
また、outliner.css が `fractal.fontSize` 設定を無視するバグがあり、コンテンツ領域のサイズが font-size と連動していない。
この機会に、コンテンツ領域の px ハードコードを em ベースの相対指定に移行し、`fractal.fontSize` 変更時にレイアウトバランスが自動調整されるようにする。
ただし、UIクロム（ツールバー、検索、メニュー等）は固定 px のまま維持する。

---

## 要件一覧

### REQ-1: デフォルト値の変更

`fractal.fontSize` のデフォルト値を 16 → 14 に変更する。

**変更対象:**
- `package.json`: `"default": 16` → `"default": 14`
- `src/webviewContent.ts`: `fontSize: config?.fontSize ?? 16` → `?? 14`
- `src/editorProvider.ts`: 内部で `webviewContent.ts` を使用するため直接のフォールバック値がある場合は更新
- `src/outlinerProvider.ts`: `fontSize: config.get<number>('fontSize', 16)` → `14`
- `src/notesEditorProvider.ts`: `fontSize: config.get<number>('fontSize', 16)` → `14`

### REQ-2: outliner.css の `fractal.fontSize` 反映（バグ修正）

outliner.css の `--outliner-font-size: 16px` がハードコードされており、`fractal.fontSize` 設定が反映されない。
`__FONT_SIZE__` プレースホルダーに変更し、ビルド時に設定値で動的置換されるようにする。

**変更対象:**
- `src/webview/outliner.css`: `--outliner-font-size: 16px` → `--outliner-font-size: __FONT_SIZE__px`
- `src/outlinerWebviewContent.ts`: outliner.css 読み込み時に `.replace('__FONT_SIZE__', String(config.fontSize))` を追加
- `src/notesWebviewContent.ts`: 同上
- `electron/src/html-generator.ts`: outliner.css 読み込み時に `.replace('__FONT_SIZE__', String(config.fontSize))` を追加
- `test/build-standalone-outliner.js`: outliner.css 読み込み時に `__FONT_SIZE__` 置換を追加
- `test/build-standalone-notes.js`: 同上

### REQ-3: コンテンツ領域の px → em 相対化

outliner.css および styles.css のコンテンツ領域（ユーザーが読み書きするテキストに直接関わる要素）のハードコード px を em ベースの相対指定に変更する。

**相対化対象（outliner.css — Outliner/Notes コンテンツ領域）:**

| 要素 | セレクタ | プロパティ | 現状 | 変更後 | 根拠 |
|------|---------|-----------|------|--------|------|
| ノード | `.outliner-node` | `min-height` | `28px` | `1.75em` | テキスト1行分+余白、font-sizeに比例 |
| バレット | `.outliner-bullet` | `height` | `28px` | `1.75em` | ノード高さと揃える |
| スコープボタン | `.outliner-scope-btn` | `height` | `28px` | `1.75em` | 同上 |
| ページアイコン | `.outliner-page-icon` | `height` | `28px` | `1.75em` | 同上 |
| チェックボックス | `.outliner-checkbox` | `height` | `28px` | `1.75em` | 同上 |
| テキスト | `.outliner-text` | `min-height` | `24px` | `1.5em` | line-height と一致 |
| テキスト | `.outliner-text` | `line-height` | `24px` | `1.5` | CSS best practice: 単位なし推奨 |
| サブテキスト | `.outliner-subtext` | `font-size` | `12px` | `0.75em` | 本文との比率維持 |
| インデント | `--outliner-indent` (CSS変数) | 値 | `24px` | `1.5em` | テキストとのバランス |

**相対化対象（styles.css — Markdown コンテンツ領域）:**

| 要素 | セレクタ | プロパティ | 現状 | 変更後 | 根拠 |
|------|---------|-----------|------|--------|------|
| コードブロック | `.editor pre` | `font-size` | `14px` | `0.875em` | Perplexity/Things テーマでは既に em 化済み。デフォルト変更時にコードと本文が同サイズになるのを防ぐ |
| ソースエディタ | `.source-editor` | `font-size` | `14px` | `0.875em` | ソースモードも本文と連動すべき |

### REQ-4: UIクロムは固定 px を維持

以下のUIクロム要素は px 固定のまま変更しない。

- ツールバー高さ、アイコンサイズ
- 検索入力/メニュー/ドロップダウンの font-size
- パンくず font-size
- ダイアログ各種
- ツールチップ
- `--outliner-bullet-size: 6px`
- `--outliner-gutter: 32px`
- ボーダー、角丸、シャドウ
- サイドバー幅/アウトライン項目 (styles.css)
- バレットのwidth (`24px`) — 操作領域としてクリック/ドラッグターゲットの固定サイズが必要

---

## 判断基準

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
