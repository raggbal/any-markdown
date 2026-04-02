# 要件定義書 — アプリ内リンク機能

## 概要

Notes editor内のOutlinerノードやMarkdownページに対して、一発でジャンプ可能なアプリ内リンクを生成・貼り付け・クリック遷移する機能。

---

## 用語

| 用語 | 説明 |
|------|------|
| アプリ内リンク | `fractal://` カスタムスキームを使用したMarkdownリンク形式のリンク |
| ノードリンク | 特定noteの特定outlinerの特定nodeを指すリンク |
| ページリンク | 特定noteの特定outlinerの特定page(.md)を指すリンク |
| noteフォルダ | Activity Barに登録されたNotesフォルダ（globalStateに永続化） |
| outファイルID | .outファイル名（拡張子なし）。outline.note内のfile IDと同一 |
| nodeID | outlinerノードのUUID文字列 |
| pageID | ページノードのUUID v4文字列 |

---

## リンク形式

Markdownリンク形式 `[表示テキスト](URL)` で保存・表示する。

### ノードリンク

```
[表示テキスト](fractal://note/{noteFolderName}/{outFileId}/{nodeId})
```

- 表示テキスト: ノードのtext（インラインマーカー・タグ除去後）
- 例: `[会議メモ](fractal://note/my-notes/default/abc-123-def)`

### ページリンク

```
[表示テキスト](fractal://note/{noteFolderName}/{outFileId}/page/{pageId})
```

- 表示テキスト: mdのH1テキスト優先、なければノードのtext
- `page/` プレフィックスでノードリンクと区別
- 例: `[設計書](fractal://note/my-notes/default/page/uuid-456)`

### パラメータ

| パラメータ | 説明 | 必須 |
|-----------|------|------|
| noteFolderName | noteフォルダ名（`path.basename(folderPath)`）。登録済みフォルダ名から検索 | ○ |
| outFileId | .outファイルID（拡張子なし） | ○ |
| nodeId | ノードID（ノードリンクのみ） | △ |
| pageId | ページID（ページリンクのみ） | △ |

### noteFolderName の解決

- 登録済みnoteフォルダ一覧（globalState `notesFolders`）から `path.basename(folderPath)` が一致するフォルダを検索
- 同名フォルダが複数ある場合は最初にマッチしたものを使用
- 該当フォルダが見つからない場合はエラー表示

---

## 機能要件

### IL-1: ノードリンクの生成（Outlinerコンテキストメニュー）

| No | 要件 |
|----|------|
| IL-1.1 | Notes mode内のOutlinerノード右クリックメニューに「アプリ内リンクをコピー」を追加 |
| IL-1.2 | クリックすると、対象ノードのアプリ内リンク（Markdownリンク形式）をクリップボードにコピー |
| IL-1.3 | リンクの表示テキストはノードのtext（インラインマーカー除去後、#tag/@tag除去後） |
| IL-1.4 | Notes mode以外（単体.outファイル）ではメニュー項目を表示しない |
| IL-1.5 | 複数選択時は表示しない（単一ノードのみ対応） |

### IL-2: ページリンクの生成（Sidepanelヘッダーボタン）

| No | 要件 |
|----|------|
| IL-2.1 | sidepanelヘッダーの「Copy Path」ボタンの右横に「アプリ内リンクをコピー」ボタンを追加 |
| IL-2.2 | Notes mode内のみ表示（単体.outや単体.mdでは非表示） |
| IL-2.3 | クリックすると、当該ページのアプリ内リンクをクリップボードにコピー |
| IL-2.4 | 表示テキスト: sidepanelのmdのH1テキスト優先、なければノードのtext |
| IL-2.5 | コピー後にチェックマークアイコンを2秒間表示（Copy Pathボタンと同じ挙動） |

### IL-3: Markdown右クリックメニュー（基本操作）

| No | 要件 |
|----|------|
| IL-3.1 | 全Markdown editor（単体.md + sidepanel）に右クリックコンテキストメニューを追加 |
| IL-3.2 | メニュー項目: Cut（切り取り）、Copy（コピー）、Paste（貼り付け） |
| IL-3.3 | テキスト選択がない場合、Cut と Copy は disabled（グレーアウト） |
| IL-3.4 | Cut/Copy/Paste はCmd+X/C/Vと完全に同じコードパスを通ること |
| IL-3.5 | メニューのスタイルはテーマのCSS変数（--bg-color, --text-color, --border-color）に連動 |
| IL-3.6 | 画面端でのメニュー位置自動調整 |
| IL-3.7 | 外部クリックでメニューを閉じる |
| IL-3.8 | メニュー上での右クリックはネイティブメニューを表示しない |
| IL-3.9 | メニュー操作後にスクロール位置が変わらないこと |

### IL-4: リンクのクリック遷移（ノードリンク）

| No | 要件 |
|----|------|
| IL-4.1 | `fractal://note/...` 形式のリンクをクリックした際、アプリ内ナビゲーションを実行 |
| IL-4.2 | noteFolderNameから登録済みnoteフォルダのパスを解決 |
| IL-4.3 | 対象noteフォルダが開いていない場合、自動でNotesパネルを開く |
| IL-4.4 | 対象noteフォルダが既に開いている場合、そのパネルをrevealする |
| IL-4.5 | outFileIdで指定されたoutlinerファイルに切り替え |
| IL-4.6 | nodeIdで指定されたノードにジャンプ（スクロール + 2秒ハイライト） |
| IL-4.7 | sidepanelが開いている場合は即座に閉じてからジャンプ |
| IL-4.8 | 全エディタ（単体.md、単体.out、Notes内outliner、Notes内sidepanel）からクリック遷移可能 |

### IL-5: リンクのクリック遷移（ページリンク）

| No | 要件 |
|----|------|
| IL-5.1 | 現在開いているnoteのsidepanelで、指定のmdファイルを直接表示する |
| IL-5.2 | note移動・outliner切替は行わない（現在のoutliner表示はそのまま） |
| IL-5.3 | 別noteフォルダのmdファイルも、現在のnoteのsidepanelで表示可能 |

### IL-6: リンクの表示

| No | 要件 |
|----|------|
| IL-6.1 | Outlinerノード内のアプリ内リンクは、通常のMarkdownリンクと同じく `<a>` タグとして表示 |
| IL-6.2 | Markdown editor内のアプリ内リンクは、通常のMarkdownリンクと同じく `<a>` タグとして表示 |
| IL-6.3 | blur時（Outliner）/display時（Markdown）にクリック可能 |

### IL-7: エラーハンドリング

| No | 要件 |
|----|------|
| IL-7.1 | noteFolderNameに一致するフォルダが見つからない場合、VSCode通知でエラー表示 |
| IL-7.2 | outFileIdに一致するファイルが存在しない場合、VSCode通知でエラー表示 |
| IL-7.3 | nodeIdに一致するノードが存在しない場合、ファイルは開くがジャンプはスキップ |
| IL-7.4 | pageIdに一致するページファイルが存在しない場合、警告表示 |

---

## 非機能要件

| No | 要件 |
|----|------|
| NF-1 | Electron版にも同等の機能を提供（将来対応可、今回はVSCode版のみ） |
| NF-2 | i18n対応: メニュー項目を7言語に翻訳（en, ja, ko, es, fr, zh-cn, zh-tw） |
| NF-3 | 既存の右クリックメニュー（Outliner / Notes左パネル）の動作に影響を与えない |

---

## スコープ外

- Electron版での完全対応（将来対応）
- リンク先のプレビューポップアップ
- リンクの自動補完（入力中の候補表示）
- 相互リンク（バックリンク）の管理・表示
- 行番号指定リンク（mdは編集で行がずれるため非対応）
