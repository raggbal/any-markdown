# 設計書 — アプリ内リンク機能

## 変更対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/i18n/locales/*.ts` (7ファイル) | `copyInAppLink`, `contextCut`, `contextCopy`, `contextPaste` メッセージ追加 |
| `src/notesWebviewContent.ts` | `NotesConfig.folderName` 追加、HTML `data-note-folder-name` 属性 |
| `src/notesEditorProvider.ts` | `openPanels` Map拡張、`resolvePagePath`, `openPageInCurrentPanel`, `navigateToLink` |
| `src/extension.ts` | `parseFractalLink()`, `fractal.navigateInAppLink` コマンド登録 |
| `src/notesFolderProvider.ts` | `getFolders()` メソッド追加 |
| `src/editorProvider.ts` | openLinkに `fractal://` 分岐追加 |
| `src/outlinerProvider.ts` | openLinkに `fractal://` 分岐追加 |
| `src/shared/notes-message-handler.ts` | `openLink` に `fractal://` 分岐、`notesNavigateInAppLink` ハンドラ、`navigateInAppLink` platform action |
| `src/shared/sidePanelManager.ts` | handleOpenLinkに `fractal://` 分岐追加 |
| `src/shared/editor-body-html.js` | sidepanelヘッダーにアプリ内リンクボタン追加 |
| `src/shared/notes-file-panel.js` | `getCurrentOutFileId()` 追加 |
| `src/shared/sidepanel-bridge-methods.js` | `requestInAppLinkData` 追加（未使用、将来削除可） |
| `src/webview/outliner.js` | コンテキストメニュー「アプリ内リンクをコピー」、sidepanelリンクボタン、`notesNavigateInAppLink` ハンドラ |
| `src/webview/editor.js` | 右クリックメニュー（document-level contextmenu、インラインCSS、Selection保存/復元） |
| `src/webview/styles.css` | `.editor-context-menu` CSS（フォールバック用、実際はインラインスタイルで表示） |
| `electron/src/html-generator.ts` | HTML `data-note-folder-name` 属性追加 |

---

## リンク形式

### ノードリンク
```
fractal://note/{noteFolderName}/{outFileId}/{nodeId}
```

### ページリンク
```
fractal://note/{noteFolderName}/{outFileId}/page/{pageId}
```

`page/` プレフィックスで2種類を区別。各パラメータは `encodeURIComponent` でエンコード。

---

## メッセージフロー

### ノードリンク生成（Outlinerコンテキストメニュー）

```
outliner.js: 右クリック「アプリ内リンクをコピー」
  → noteFolderName = .notes-layout[data-note-folder-name]
  → outFileId = notesFilePanel.getCurrentOutFileId()
  → text = stripInlineMarkers(node.text) → #tag/@tag除去
  → navigator.clipboard.writeText(`[text](fractal://note/...)`)
```

### ページリンク生成（Sidepanelヘッダーボタン）

```
outliner.js: sidePanelCopyInAppLinkBtn click
  → noteFolderName, outFileId = 同上
  → pageId = model.getNode(sidePanelOriginNodeId).pageId
  → displayText = sidepanel H1テキスト || ノードtext
  → navigator.clipboard.writeText(`[text](fractal://note/.../page/...)`)
```

### ノードリンクのクリック遷移

```
任意エディタ: fractal://note/.../outFileId/nodeId クリック
  → host.openLink('fractal://...') or sidePanelOpenLink
  → 各ホスト: vscode.commands.executeCommand('fractal.navigateInAppLink', href)
  → extension.ts: parseFractalLink() → nodeId あり
  → notesEditorProvider.openNotesFolder(folderPath) で対象noteを開く/reveal
  → setTimeout(500) → navigateToLink()
  → webview postMessage: { type: 'notesNavigateInAppLink', outFileId, nodeId }
  → outliner.js: closeSidePanelImmediate() + notesHostBridge.jumpToNode()
  → notes-message-handler.ts: notesJumpToNode → updateData + jumpToNodeId
  → outliner.js: renderTree() + jumpToAndHighlightNode(nodeId) [300ms delay]
```

### ページリンクのクリック遷移

```
任意エディタ: fractal://note/.../outFileId/page/pageId クリック
  → fractal.navigateInAppLink コマンド
  → extension.ts: parseFractalLink() → pageId あり
  → notesEditorProvider.resolvePagePath(folderPath, outFileId, pageId)
    → .outファイルをディスクから直接読み、pageDir解決 → {pageDir}/{pageId}.md
  → notesEditorProvider.openPageInCurrentPanel(pagePath)
    → 現在visibleなパネルの openPage(filePath) を呼ぶ
    → SidePanelManager.openFile() でsidepanelにmd表示
  ※ note移動・outliner切替は一切行わない
```

---

## 詳細設計

### 1. noteFolderName のHTML注入

`notesWebviewContent.ts`: `<div class="notes-layout" data-note-folder-name="${config.folderName}">`
`notesEditorProvider.ts`: `folderName: path.basename(folderPath)` を config に追加

### 2. currentOutFileId の追跡

`notes-file-panel.js` に `getCurrentOutFileId()` を追加。現在のcurrentFileからfileListを検索してIDを返す。

### 3. URI解析 (extension.ts)

`parseFractalLink()`:
- `/page/` を含む場合 → ページリンク（`pageId` を設定）
- それ以外 → ノードリンク（`nodeId` を設定）

### 4. fractal:// リンクの検出箇所（5箇所）

| 箇所 | ファイル | 処理 |
|------|---------|------|
| 単体.md openLink | `editorProvider.ts` | `fractal.navigateInAppLink` コマンド実行 |
| 単体.out openLink | `outlinerProvider.ts` | 同上 |
| Notes openLink | `notes-message-handler.ts` | `platform.navigateInAppLink()` → コマンド実行 |
| sidepanel openLink | `sidePanelManager.ts` | コマンド実行 |
| Notes内outliner openLink | notes-host-bridge → notes-message-handler | 同上 |

### 5. Markdown右クリックメニュー

**登録方式**: `document.addEventListener('contextmenu', ...)` をEditorInstanceの `_legacyInit()` 内のクロージャで登録。`editor.contains(e.target)` で自インスタンスのeditorのみ処理。`e.stopImmediatePropagation()` で他のdocument-levelハンドラ（outliner.js等）への伝播を防止。

**VSCode webview制約**:
- 要素レベルのcontextmenuリスナーにはイベントが届かない → document-levelで登録
- CSSクラスが適用されない場合がある → 全スタイルをインラインで設定

**Selection保存/復元** (M-11準拠):
- メニュー表示時に `sel.getRangeAt(0).cloneRange()` でRange保存
- 各操作の前に `editor.focus({preventScroll: true})` + `sel.addRange(savedRange)` で復元

**Cut/Copy**: `document.execCommand('cut'/'copy')` — Selection復元後にネイティブ実行
**Paste**: `document.execCommand('paste')` — エディタのpasteイベントハンドラが発火し、Cmd+Vと同じコードパスを通る

**テーマ対応**: `getComputedStyle(document.documentElement)` で `--bg-color`, `--text-color`, `--border-color` を動的取得しインラインスタイルに反映

### 6. openPanels Map の拡張

```typescript
private openPanels = new Map<string, {
    panel: WebviewPanel;
    postMessage: (msg) => void;
    fileManager: NotesFileManager;
    openPage?: (filePath: string) => Promise<void>;
}>();
```

`openPage` は SidePanelManager.openFile() へのクロージャ参照。外部から任意のmdファイルをsidepanelで開くために使用。

### 7. ページリンクのファイルパス解決

`resolvePagePath(noteFolderPath, outFileId, pageId)`:
- `{noteFolderPath}/{outFileId}.out` をディスクから直接読む
- JSON内の `pageDir` フィールドを解決（デフォルト `./pages`）
- `{resolvedPageDir}/{pageId}.md` のパスを返す
- noteが開いていなくても解決可能（fileManagerに依存しない）

### 8. jumpToNodeId の遅延

`updateData` メッセージ受信後の `jumpToAndHighlightNode()` 呼び出しを 100ms → 300ms に変更。ファイル切替後のDOM再構築が完了するのを待つ。

---

## デグレ防止チェックリスト

| チェック項目 | 対策 |
|-------------|------|
| 既存Outlinerコンテキストメニュー | 新項目はNotes mode判定後に追加。sidepanel内は `.side-panel-editor-root` チェックでスキップ |
| 既存openLink処理 | `fractal://` は全箇所で最初の分岐。既存パスは変更なし |
| Notes左パネルコンテキストメニュー | 変更なし |
| openPanels Map型変更 | 全参照箇所を `.panel` アクセスに更新済み |
| エディタのcontenteditable | contextmenuハンドラはSelection保存/復元で副作用なし |
| flushSync/fileChangeId | notesNavigateInAppLink は flushSave() を先に呼ぶ |
| outliner.jsのdocument contextmenu | `.side-panel-editor-root` 内をスキップする分岐追加 |

---

## 残存する技術的課題

1. **`sidepanel-bridge-methods.js` の `requestInAppLinkData`**: 現在未使用。将来削除可。
2. **`styles.css` の `.editor-context-menu` CSS**: VSCode webviewではインラインスタイルを使用するため実質未使用。Playwright テストでは利用される可能性あり。
