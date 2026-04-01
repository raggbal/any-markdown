# 要件定義書: .mdファイルのOutliner取り込み（ファイルピッカー方式）

## 概要

⋮メニューから「Import .md files」を選択し、ファイルピッカーで `.md` ファイルを選択して、
ページノードとして Outliner に取り込む機能。Notion / Obsidian 等からの一括取り込みを想定。

## 対象エディタ

- Outliner standalone（`.out` ファイル直接編集）
- Notes editor 内の Outliner（`.note` 経由）

## 前提

- VSCode / Electron 両方で同じ挙動（ファイルピッカーダイアログ方式）
- 既存の D&D コード（外部ファイルドロップ）は削除する

---

## 機能要件

### FD-1: ⋮メニューに「Import .md files」を追加

既存の ⋮ メニュー（検索バー右端）に「Import .md files」項目を追加。
Standalone / Notes 両方で表示（条件分岐なし）。

### FD-2: ファイルピッカーダイアログ

メニュー項目クリック時、`vscode.window.showOpenDialog()` でファイルピッカーを表示。
- `.md` ファイルのみ選択可能（フィルタ）
- 複数ファイル選択対応（`canSelectMany: true`）

### FD-3: 挿入位置

フォーカス中のノードの後に兄弟として挿入。
フォーカスノードがない場合はルート末尾に挿入。
複数ファイルの場合、ファイル名順で順次挿入。

### FD-4: ノードテキストの決定

`.md` ファイル内の最初の H1 テキストを使用。H1 がなければ "Untitled"。

### FD-5: Markdownの変換処理

プレーンテキスト変換処理（`normalizeMultiLineTableCells` 等）を適用。
変換処理は `markdown-import.ts` の共通関数を使用。

### FD-6: ページとして保存

既存の `@page` と同じルールで保存:
- `pageId`: UUID v4
- ファイル名: `{pageId}.md`
- 保存先: Standalone = `{pageDir}/`, Notes = `{outlineId}/`
- ノードに `isPage: true`, `pageId` を設定

### FD-7: 画像のコピーとパスの書き換え

元 `.md` 内の画像参照（`![alt](path)`）について:
- 元ファイルからの相対パスで画像ファイルを解決
- 存在する場合、画像保存先にコピー（`image_{timestamp}.{ext}` にリネーム）
- `.md` 内のパスを新しい相対パスに書き換え
- URL（http/https）や存在しないファイルはスキップ

### FD-8: 既存D&Dコードの削除

outliner.js の外部ファイルD&D関連コード（`hasExternalFiles`, `handleExternalFileDrop`, dragover/drop拡張）を削除。
`importMdFilesResult` メッセージ受信処理は維持。

### FD-9: 変換処理の共通化

`markdown-import.ts` にプレーンテキスト変換・リッチテキスト変換（将来用スタブ）を共通関数として維持。
