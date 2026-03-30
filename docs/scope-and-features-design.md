# Outliner スコープ改善 + 追加機能 — 要件定義・調査結果・設計書

## 要件一覧

| # | 要件 | 重さ | 影響ファイル |
|---|------|------|------------|
| 1 | 右クリックに「スコープ」追加 | 軽 | outliner.js |
| 2 | Cmd+] でスコープ設定 | 軽 | outliner.js |
| 3 | パンくずリスト表示（検索バー上） | 中 | outlinerWebviewContent.ts, outliner.js, outliner.css |
| 4 | ESCでスコープ解除しない。パンくずTOP or Cmd+[ で解除 | 軽 | outliner.js |
| 5 | 検索はスコープ配下のみ有効 | 中 | outliner.js, outliner-search.js |
| 6 | 検索ボックス空でスコープ解除しない | 軽 | outliner.js |
| 7 | タグクリックで検索ボックスに自動セット | 軽 | outliner.js |
| 8 | outlinerPageDir 設定 + mmd個別設定 | 重 | package.json, outlinerProvider.ts, outlinerWebviewContent.ts, outliner.js |
| 9 | ページをサイドパネルで開く（editorProviderと共有） | 重 | outlinerProvider.ts, editorProvider.ts |
| 10 | サイドパネルの画像パスをpageフォルダ/images固定 | 中 | outlinerProvider.ts, editorProvider.ts |
| 11 | サイドパネルでadd page非表示 | 軽 | editorProvider.ts or editor.js |
| 12 | outlinerにテーマ適用 | 中 | outliner.css |
| 13 | outlinerに言語(i18n)適用 | 中 | outlinerProvider.ts, outlinerWebviewContent.ts, outliner.js, i18n/*.ts |

---

## 要件詳細

### 要件1: 右クリックに「スコープ」追加

**現状**: コンテキストメニューにスコープ関連の項目なし。スコープ設定は Alt+バレットクリックのみ。

**修正箇所**: `showContextMenu()` (outliner.js:1622-1721)

**仕様**:
- スコープ中でない時: 「Scope」メニューを表示 → クリックで `setScope({ type: 'subtree', rootId: nodeId })`
- スコープ中の時: 「Clear Scope」メニューも表示

---

### 要件2: Cmd+] でスコープ設定

**現状**: Cmd+] / Cmd+[ のキーバインドなし。

**修正箇所**: keydownハンドラ (outliner.js, Cmd+metaKey ブロック付近)

**仕様**:
- `Cmd+]` (BracketRight): `setScope({ type: 'subtree', rootId: focusedNodeId })`
- 注意: VSCodeのデフォルト `Cmd+]` はインデント。`e.stopPropagation()` 必須（O-2ルール）

---

### 要件3: パンくずリスト表示

**現状**: `scopeBadge` がスコープ名を表示するのみ（検索バー右端）。

**修正箇所**:
- `outlinerWebviewContent.ts:55-58`: 検索バーの上にパンくず用HTMLを追加
- `outliner.js`: `setScope()` でパンくずを動的生成
- `outliner.css`: パンくずのスタイル

**仕様**:
- 検索バーの上に表示: `TOP > 祖先1 > 祖先2 > 現在のスコープノード`
- TOPは右端ではなく左端（通常のパンくず）。ユーザー指示「TOPを右端に」→ 確認必要だが、通常は `TOP > ...` の左端始まりが自然。ただしユーザー要望通り右端にするか確認。
- 各ノードクリック → そのノードでスコープ
- TOP クリック → スコープ解除 (`setScope({ type: 'document' })`)
- スコープ解除時はパンくず非表示

**パンくず生成ロジック**:
```
1. スコープノードの全祖先を model.getAncestors(nodeId) で取得
2. [TOP, 祖先1, 祖先2, ..., スコープノード] の順で表示
3. 各項目はクリッカブル
```

**注意**: `model.getNode(nodeId).parentId` で親を辿れるか確認 → outliner-model.js の Node 構造に `parentId` があるか調査が必要。

---

### 要件4: ESCでスコープ解除しない

**現状**: ESCキーハンドラ (outliner.js:1106-1113) で:
1. `currentSearchResult` あり → `clearSearch()` (検索+スコープ解除)
2. `currentScope.type !== 'document'` → `setScope({ type: 'document' })` (スコープ解除)

**修正箇所**: outliner.js:1106-1113

**仕様**:
- ESC: 検索がアクティブなら検索をクリア（**スコープは維持**）
- ESC: スコープのみの場合 → **何もしない**（スコープ解除しない）
- スコープ解除手段: パンくずTOPクリック or Cmd+[

**連動修正**: `clearSearch()` (outliner.js:1582-1588) からスコープリセットを削除。

---

### 要件5: 検索はスコープ配下のみ有効

**現状**: 調査結果によると、`executeSearch()` は `currentScope` を `searchEngine.search()` に渡している（outliner.js:1578）。`_getCandidates(scope)` でスコープ内ノードのみを候補にしている。

**つまり既に実装されている可能性が高い**。ただし:
- `renderTree()` での `rootIds` 決定（outliner.js:137-142）がスコープを使用
- 検索結果とスコープのフィルタリングが両方適用される

**検証必要**: `_getCandidates` の実装を確認して、スコープが正しく絞り込まれているか確認。

---

### 要件6: 検索ボックス空でスコープ解除しない

**現状**: `clearSearch()` (outliner.js:1582-1588) が `currentScope = { type: 'document' }` でスコープをリセット。`executeSearch()` 内で空文字列の場合 `clearSearch()` を呼ぶ（outliner.js:1572-1575）。

**修正箇所**: `clearSearch()` からスコープリセットを削除。

**仕様**:
- 検索ボックスを空にする → 検索結果のみクリア、スコープは維持
- `clearSearch()` は `searchInput.value = ''`, `currentSearchResult = null`, `renderTree()` のみ

---

### 要件7: タグクリックで検索ボックスにセット

**現状**: タグ (`#tag`, `@tag`) は `renderInlineText()` で `<span class="outliner-tag">` として描画される（outliner.js:387）。クリックハンドラなし。

**修正箇所**: outliner.js の `createNodeElement()` 内、テキスト要素へのクリックハンドラ追加。

**仕様**:
- `.outliner-tag` クリック → `searchInput.value = tagText` → `executeSearch()`
- 既存の検索値は上書き

**実装方法**: テキスト要素全体のクリックで `e.target.closest('.outliner-tag')` を判定するか、`renderInlineText` 後にタグ要素にイベントリスナーを追加。

---

### 要件8: outlinerPageDir 設定

**現状**: ページ保存先は `path.join(path.dirname(document.uri.fsPath), 'pages')` にハードコード（outlinerProvider.ts:174-176）。

**修正箇所**:
- `package.json`: `fractal.outlinerPageDir` 設定追加（デフォルト `"./pages"`）
- `outlinerProvider.ts`: `getPagesDirPath()` で設定を読み込み
- `outlinerWebviewContent.ts` or `outliner.js`: 設定ボタンUI

**仕様**:
- `fractal.outlinerPageDir`: グローバルデフォルト（相対パス → mmdファイルからの相対）
- 絶対パスも設定可能
- mmd個別設定: どこかにボタン表示 → 入力ダイアログでパスを設定
- mmd個別設定はJSONデータ内 or ファイルレベルの IMAGE_DIR と同様の方式
- フォルダなければ自動作成（`ensurePagesDir`）

**個別設定の保存方法候補**:
1. mmdのJSONデータ内に `"pageDir": "./custom-pages"` を追加
2. 別ファイル（`.mmd.config`）
→ JSON内が最もシンプル。モデルのシリアライズに `pageDir` フィールドを追加。

---

### 要件9: ページをサイドパネルで開く（editorProviderと共有）

**現状**: `handleOpenPage()` (outlinerProvider.ts:209-229) が `vscode.openWith` で `ViewColumn.Beside` に開く。これは**別タブ**として開く動作。

**ユーザー要望**: editorProvider.ts の `openSidePanel` と同じ仕組み（iframe内サイドパネル）で開きたい。

**調査結果**: editorProvider.ts のサイドパネルは:
1. mdファイルの内容を読み取り
2. `webviewPanel.webview.postMessage({ type: 'openSidePanel', markdown, filePath, ... })` でwebviewに送信
3. editor.js 内の iframe で EditorInstance を作成
4. `setupSidePanelFileWatcher` でファイル同期

**問題**: outliner.js と editor.js は完全に別のwebview。outlinerのwebviewにはサイドパネル用のiframeやEditorInstanceがない。

**設計選択肢**:
A. outliner webview内にサイドパネル用iframeを追加（大工事）
B. editorProvider.ts のサイドパネルロジックを共有モジュールに分離し、両方のProviderから呼べるようにする
C. outlinerProvider.ts から `openSidePanel` メッセージをoutliner webviewに送り、outliner.js側でiframe+EditorInstanceを生成する

**推奨: 方式C** — outlinerProvider.ts から openSidePanel メッセージを送信し、outliner.js内にサイドパネル表示用のコンテナを追加。ただしEditorInstanceの読み込みが必要。

**実際の最適解**: outlinerProvider が `vscode.openWith` で `ViewColumn.Beside` に開くのは既にサイドに開いている。ユーザーの「sidepanel editor」とは何を指すか？
- editorProvider.ts の `openSidePanel` = webview内部のiframe（Notion風）
- `ViewColumn.Beside` = VSCodeの別パネル

ユーザーの添付画像を見ると、パンくずリストのような表示がある。おそらくVSCode内の別パネル（`ViewColumn.Beside`）で`fractal.editor`として開くのが正解で、現状の実装と同じ可能性がある。

**結論**: 現状の `handleOpenPage` は既に `ViewColumn.Beside` で `fractal.editor` として開いている。ユーザーの「sidepanel editor」がeditor.js内のiframeサイドパネルを指すなら大きな変更が必要。mdモードの editor.js の openSidePanel をoutlinerでも使うには:
1. outlinerWebviewContent にeditor.js系のスクリプトを全て読み込む（非現実的）
2. または、別のwebviewPanelを作ってeditorとして開く（現状と同等）

→ **現状の ViewColumn.Beside 方式を維持しつつ、要件10/11の制約を editorProvider.ts 側で処理するのが最善**。

---

### 要件10: サイドパネルの画像パスをpageフォルダ/images固定

**現状**: editorProvider.ts で画像パスは IMAGE_DIR ディレクティブ → imageDefaultDir設定 → ドキュメント同ディレクトリの優先順位。

**修正箇所**: editorProvider.ts

**仕様**:
- outlinerから開かれた.mdファイルの場合、画像保存先を `{pageDir}/images/` に強制
- 画像保存先変更機能を非表示

**実装方法**:
- outlinerProvider.ts の `handleOpenPage` で `vscode.openWith` 時にメタデータを渡す方法が必要
- しかし `vscode.openWith` ではカスタムメタデータを渡せない
- 代替案: ファイルパスが `pages/` ディレクトリ配下かどうかで判定
- または: `vscode.commands.executeCommand` で独自コマンドを使い、フラグを渡す
- または: editorProvider が開くファイルのパスに `pages/` が含まれるかチェック → outlinerPageDir設定との一致確認

**推奨**: outlinerProvider.ts で開く前に、editorProvider.ts が参照できるグローバルステートに「このファイルはoutlinerから開かれた」フラグを設定。editorProvider.ts がそのフラグを参照して画像パスと設定ボタンを制御。

---

### 要件11: サイドパネルで add page 非表示

**現状**: editorのコマンドパレットに `addPage` アクション（`COMMAND_PALETTE_ITEMS` の先頭）がある。

**修正箇所**: editor.js のコマンドパレット生成、またはwebview起動時のフラグで制御。

**仕様**: outlinerから開かれたページでは `addPage` をコマンドパレットから除外。

**実装方法**: webview初期化時に `isOutlinerPage: true` フラグを渡し、コマンドパレット生成時にフィルタ。

---

### 要件12: outlinerにテーマ適用

**現状**:
- `data-theme="${config.theme}"` が HTML に設定済み（outlinerWebviewContent.ts:40）
- outliner.css は `--vscode-*` CSS変数を使用（outliner.css:5-24）、フォールバック値がダークテーマ固定（`#1e1e1e`等）
- テーマ別CSSルール（`[data-theme="github"]` 等）がない

**問題**: outliner.css のフォールバック値がダーク系のみ。ライトテーマの場合、VSCode CSS変数が適用されるはずだが、もし変数が未定義なら暗い色になる。

**修正箇所**: outliner.css

**仕様**: mdモードの styles.css と同様に `[data-theme="github"]`, `[data-theme="github-dark"]` 等のテーマ別CSS変数を定義。

**調査**: styles.css のテーマ定義を確認し、同等の変数を outliner.css に追加。

---

### 要件13: outlinerに言語(i18n)適用

**現状**:
- outlinerProvider.ts で `initLocale` を呼んでいない
- outliner.js のUI文字列がハードコード英語
  - "No items yet", "Press Enter to add an item"
  - "Focus mode: matched node + children only", "Tree mode: show ancestors to root"
  - コンテキストメニュー項目（"Make Page", "Delete" 等）
- i18n/locales/ja.ts, en.ts に outliner 固有キーなし

**修正箇所**:
1. `outlinerProvider.ts`: locale初期化 + `getWebviewMessages()` をwebviewに送信
2. `outlinerWebviewContent.ts`: i18n メッセージをHTMLに埋め込み
3. `outliner.js`: ハードコード文字列を i18n キーに置換
4. `i18n/locales/ja.ts`, `en.ts` 等: outliner用キーを追加

---

## 現状コード調査サマリー

### スコープ関連（要件1-6）

| 関数/変数 | 行 | 現状 |
|-----------|-----|------|
| `currentScope` | 22 | `{ type: 'document' }` 初期値 |
| `setScope()` | 1590-1600 | スコープ設定 + バッジ更新 + 再レンダリング |
| `clearSearch()` | 1582-1588 | **検索+スコープ両方クリア**（要修正） |
| ESCハンドラ | 1106-1113 | **スコープ解除あり**（要修正） |
| `executeSearch()` | 1571-1580 | `currentScope` を検索エンジンに渡す（OK） |
| `renderTree()` | 137-142 | `currentScope` で rootIds を制限（OK） |
| `showContextMenu()` | 1622-1721 | **スコープ項目なし**（要追加） |
| Alt+バレットクリック | 263-269 | スコープ設定（OK） |

### ページ関連（要件8-11）

| 関数 | ファイル:行 | 現状 |
|------|------------|------|
| `getPagesDirPath()` | outlinerProvider.ts:174-176 | **ハードコード `pages/`**（要修正） |
| `handleOpenPage()` | outlinerProvider.ts:209-229 | `ViewColumn.Beside` で開く（OK or 要変更） |
| `handleMakePage()` | outlinerProvider.ts:189-207 | ページ作成（パス要修正） |
| サイドパネル | editorProvider.ts:682-758 | iframe方式（outlinerとは別アーキ） |

### テーマ・i18n関連（要件12-13）

| 項目 | 現状 |
|------|------|
| テーマCSS | フォールバック値がダーク固定、テーマ別ルールなし |
| locale初期化 | outlinerProvider.tsで未実装 |
| UI文字列 | 英語ハードコード |

---

## 修正計画

### Phase 1: スコープ改善（要件1-6）— 影響範囲が限定的

#### Step 1.1: clearSearch() からスコープリセットを削除（要件6）
- `outliner.js:1585` の `currentScope = { type: 'document' }` を削除
- `outliner.js:1586` の `scopeBadge.textContent = ''` を削除（スコープバッジはsetScope管理）

#### Step 1.2: ESCハンドラからスコープ解除を削除（要件4）
- `outliner.js:1108-1112` を修正
- ESC: 検索アクティブなら検索クリアのみ（スコープ維持）
- ESC: 検索なし+スコープあり → 何もしない

#### Step 1.3: Cmd+] / Cmd+[ キーバインド追加（要件2, 4）
- `Cmd+]`: `setScope({ type: 'subtree', rootId: focusedNodeId })`
- `Cmd+[`: `setScope({ type: 'document' })`
- `e.preventDefault()` + `e.stopPropagation()` 必須

#### Step 1.4: コンテキストメニューにスコープ追加（要件1）
- `showContextMenu()` に「Scope」項目追加
- クリック → `setScope({ type: 'subtree', rootId: nodeId })`

#### Step 1.5: パンくずリスト表示（要件3）
- `outlinerWebviewContent.ts`: 検索バー上に `<div class="outliner-breadcrumb"></div>` 追加
- `outliner.js`: `setScope()` 内でパンくず動的生成
  - model から祖先チェーンを取得（parentId を辿る）
  - `TOP > 祖先1 > 祖先2 > スコープノード` を生成
  - 各項目にクリックハンドラ
- `outliner.css`: パンくずスタイル
- `scopeBadge` は不要になるため削除 or パンくずに統合

#### Step 1.6: 検索スコープ確認（要件5）
- `_getCandidates(scope)` の実装を確認
- スコープ内ノードのみが検索候補になっていることを検証
- 必要なら修正

### Phase 2: タグクリック（要件7）— 軽量

#### Step 2.1: タグクリックハンドラ
- `createNodeElement()` 内のテキスト要素にクリックイベント委譲
- `e.target.closest('.outliner-tag')` でタグ要素を検出
- `searchInput.value = tagText` → `executeSearch()`

### Phase 3: テーマ + i18n（要件12, 13）

#### Step 3.1: テーマCSS追加
- styles.css からテーマ別変数を抽出
- outliner.css に `[data-theme="github"]`, `[data-theme="github-dark"]` 等を追加
- 背景色、テキスト色、ボーダー色、ホバー色、選択色を定義

#### Step 3.2: i18n 基盤
- `outlinerProvider.ts` に `initLocale` 呼び出し追加
- `outlinerWebviewContent.ts` に `webviewMessages` をscript内に埋め込み
- `outliner.js` で `i18n` オブジェクトを参照してUI文字列を差し替え
- `ja.ts`, `en.ts` 等にoutliner用キーを追加

### Phase 4: ページディレクトリ設定（要件8）

#### Step 4.1: package.json 設定追加
- `fractal.outlinerPageDir` 追加（デフォルト `"./pages"`）

#### Step 4.2: outlinerProvider.ts 修正
- `getPagesDirPath()` で設定値を読み込み
- mmd個別設定: JSONデータ内の `pageDir` フィールドを参照
- `handleMakePage` / `handleOpenPage` でパスを動的解決

#### Step 4.3: 個別設定UI
- outliner.js にページディレクトリ設定ボタンを追加（検索バー付近 or ツールバー）
- クリック → ホストにメッセージ → `vscode.window.showInputBox` でパス入力
- 入力値をmmdのJSONに保存

### Phase 5: ページ表示改善（要件9, 10, 11）

#### Step 5.1: outlinerから開いたページのフラグ管理
- outlinerProvider.ts: `handleOpenPage` 時にグローバルステートにファイルパスを記録
  - `context.workspaceState` or static Set を使用
- editorProvider.ts: ファイルオープン時にステートを確認

#### Step 5.2: 画像パス強制（要件10）
- outlinerから開かれたファイルの場合:
  - 画像保存先を `{pageDir}/images/` に強制
  - `imageDirectoryManager.setFileImageDir()` で設定
  - 画像保存先変更UIを非表示

#### Step 5.3: add page 非表示（要件11）
- editorProvider.ts → webview に `isOutlinerPage: true` フラグを送信
- editor.js: `COMMAND_PALETTE_ITEMS` 生成時にフラグチェックして `addPage` を除外
- 既存ページへのリンクは維持（openLink は影響なし）

### Phase 6: テスト + ビルド

#### Step 6.1: 各Phase完了後にテスト実行
- `npx playwright test` で既存テスト全通過を確認
- 新規テスト追加（スコープ操作、パンくず、タグクリック等）

#### Step 6.2: VSIXビルド
- バージョンインクリメント
- `npm run compile && npm run package`

---

## 追加調査結果

### parentIdによる祖先チェーン（パンくず用）
- `Model.prototype.getParent(nodeId)` (outliner-model.js:367-371) で親ノード取得可能
- 各ノードに `parentId` プロパティあり（null = ルートノード）
- 祖先チェーンは `node.parentId` を再帰的に辿れば取得可能 ✅

### 検索スコープ（要件5）— 既に実装済み
- `_getCandidates(scope)` (outliner-search.js:167-172): subtreeスコープ時は `[rootId] + getDescendantIds(rootId)` のみ返す
- `search()` はcandidatesのみをマッチ対象にする
- **要件5は追加実装不要** ✅

### テーマ定義（styles.css）
7種類のテーマが定義:
- github (ライト), sepia (セピア), night (ダーク), dark (ダーク), minimal (ライト), things (ライト), perplexity (ライト)
- 各テーマで `--bg-color`, `--text-color`, `--heading-color`, `--link-color`, `--code-bg`, `--code-text`, `--border-color`, `--blockquote-color`, `--blockquote-border`, `--sidebar-bg`, `--sidebar-border`, `--toolbar-bg`, `--selection-bg` を定義
- outliner.css は `--vscode-*` 変数に依存しているが、webview内ではVSCode変数が利用可能なため基本動作する
- ただしフォールバック値がダーク固定（`#1e1e1e`, `#cccccc` 等）のため、VSCode変数が未定義の環境ではダーク表示になる
- **修正方針**: テーマ別のoutliner用CSS変数を追加し、`--vscode-*` 依存を `data-theme` ベースに変更

## 深堀り調査: 漏れ・デグレリスク分析

### A. clearSearch() 変更の波及影響

**修正対象**: clearSearch() (行1582-1588) からスコープリセット削除

**波及する全呼び出し元**:
1. **ノードESCハンドラ** (行1109): `currentSearchResult` がある時に呼ぶ → スコープ維持で正しい
2. **searchInput ESCハンドラ** (行1544): 検索バーでESC → スコープ維持で正しい
3. **executeSearch()** (行1574): 空クエリ時に呼ぶ → スコープ維持で正しい

**デグレリスク**: なし。clearSearchは検索クリアのみに責務を限定する正しい変更。

**ただし注意**: clearSearch後、scopeBadge更新コードも削除するので、scopeBadgeの更新はsetScope()内でのみ行われる。**clearSearch内のscopeBadge.textContent = ''を削除する際、setScope()内のバッジ更新が正しく動作することを確認必要**。

### B. ESCハンドラ変更の漏れ

**修正対象**: 2箇所

| 箇所 | 行 | 現状 | 修正後 |
|------|-----|------|--------|
| ノードkeydown | 1106-1113 | 検索クリア→スコープ解除の2段階 | 検索クリアのみ。スコープ解除ブロック削除 |
| searchInput keydown | 1542-1545 | clearSearch()呼び出し | 変更不要（clearSearch自体を修正するため） |

**漏れなし** ✅

### C. Cmd+] / Cmd+[ のVSCode衝突

**リスク**: VSCodeデフォルトで `Cmd+]` = インデント、`Cmd+[` = アウトデント

**対策**: `e.preventDefault()` + `e.stopPropagation()` 必須（CLAUDE.md O-2ルール）

**追加確認**: outliner.js の keydown ハンドラで `e.metaKey || e.ctrlKey` ブロック内に追加。既存の Cmd+B/I/E と同じパターン。**BracketRight/BracketLeft は `e.key` で `']'` / `'['` として取得可能**。

### D. パンくず実装の漏れポイント

**1. scopeBadgeの扱い**: パンくず導入でscopeBadgeは不要になる。
- outlinerWebviewContent.ts:58 の `<span class="outliner-scope-badge"></span>` → パンくずに置換
- outliner.js:91 の `scopeBadge` 初期化 → パンくず要素の初期化に変更
- setScope() 内のscopeBadge更新 → パンくず更新に変更

**2. パンくず更新タイミング**:
- `setScope()` 呼び出し時: 当然更新 ✅
- ノードテキスト編集時: パンくずに表示中のノードのテキストが変わる可能性 → **`renderTree()` 内でもパンくず再描画が必要**
- ノード削除時: スコープルートが削除されたら → **スコープをdocumentに自動復帰する処理が必要**

**3. TOPの位置**: ユーザー要件「TOPを右端に」→ `祖先1 > 祖先2 > 現在ノード ... [TOP]`

**4. model.getNode(nodeId).parentIdでルートまで辿れるか**: ✅ 確認済み。parentId=null がルート。

### E. タグクリックのcontenteditable競合

**リスク**: タグ `<span class="outliner-tag">` をクリックすると、contenteditableがカーソルをspan内に配置。検索ボックスに値をセットしたいのに、カーソルが移動してしまう。

**対策**:
- `e.preventDefault()` + `e.stopPropagation()` でcontenteditable動作を阻止
- **ただし、focus中のノード内のタグクリックでは編集中のカーソル移動として扱うべきか？**
- **推奨**: focus中のノードではタグクリック検索を**無効化**し、blur中のノード（表示モード）でのみタグクリック検索を発火。これにより編集操作と検索操作が衝突しない。

**実装方法**: タグクリックは各textElのclick/mousedownハンドラで判定。focus中かどうかは `document.activeElement === textEl` で判定可能。

### F. テーマCSS 修正の漏れポイント

**問題の深刻度**: outliner.cssに `[data-theme]` ルールが**ゼロ**。全フォールバック値がダーク。

**修正必須箇所**:
| 行 | 変数 | 現在のフォールバック | ライトテーマで必要 |
|----|------|---------------------|-------------------|
| 6 | --outliner-bg | #1e1e1e | #ffffff |
| 7 | --outliner-fg | #cccccc | #24292f |
| 12 | --outliner-border | #333 | #d0d7de |
| 13 | --outliner-hover-bg | rgba(255,255,255,0.05) | rgba(0,0,0,0.04) |
| 18 | --outliner-search-bg | #3c3c3c | #f6f8fa |
| 19 | --outliner-search-border | #555 | #d0d7de |
| 20 | --outliner-search-fg | #ccc | #24292f |
| 256 | .outliner-text:focus bg | rgba(255,255,255,0.03) | rgba(0,0,0,0.02) |
| 320 | code bg | rgba(255,255,255,0.08) | rgba(0,0,0,0.05) |
| 494-499 | scrollbar | rgba(255,255,255,*) | rgba(0,0,0,*) |

**注意**: styles.cssの変数名（`--bg-color`, `--text-color`等）とoutliner.cssの変数名（`--outliner-bg`, `--outliner-fg`等）が異なる。統一するか、テーマ別ブロックで個別に値を設定するか選択必要。

### G. i18n 漏れポイント

**ハードコード文字列の全箇所**（outliner.js内）:
| 行 | 文字列 | 用途 |
|----|--------|------|
| 119 | `'No items yet'` | 空ツリー表示 |
| 120 | `'Press Enter to add an item'` | 空ツリーヒント |
| 1561 | `'Focus mode: matched node + children only'` | 検索モードtitle |
| 1562 | `'Tree mode: show ancestors to root'` | 検索モードtitle |
| 1633-1709 | コンテキストメニュー全項目 | Remove Page, Open Page, Make Page, Remove Checkbox, Add Checkbox, Edit Subtext, Add Subtext, Move Up, Move Down, Delete |
| 1594 | `'scope: '` | スコープバッジ前置詞 |

**全7 localeファイルに追加必要**: en, ja, es, fr, ko, zh-cn, zh-tw

### H. ページディレクトリ設定の漏れポイント

**1. mmd個別設定の保存先**: JSONデータ内に `"pageDir"` フィールドを追加する方式が最適。ただし:
- `outliner-model.js` のシリアライズ/デシリアライズに `pageDir` を追加
- `outlinerProvider.ts` で JSON パース時に `pageDir` を読み取る必要
- 既存の mmd ファイルに `pageDir` がない場合のデフォルト処理

**2. 設定ボタンの位置**: 検索バー横 or ツールバー的な場所。ユーザーの「どこかに設定ボタンを表示して」→ 要確認。

**3. pageDir変更後の既存ページ**: pageDir を変更しても既存ページファイルは移動されない。旧ディレクトリのページは開けなくなる。**警告表示が必要**。

### I. 要件9 サイドパネルの重大な設計課題

**現状**: outlinerProvider.tsの `handleOpenPage()` は `vscode.openWith('fractal.editor', ViewColumn.Beside)` でVSCodeの別タブとして開く。

**ユーザー要望**: 「sidepanel editorで開かれる仕様にしてください。sidepanelは markdownモードですでに実装済み」

**mdモードのsidepanel**: editorProvider.ts のwebview内にiframeを作り、その中にEditorInstanceを生成。これは**同一webview内**の機能。

**outlinerに同じ仕組みを入れるための課題**:
1. outliner webviewにeditor.js、styles.css、turndown等の全スクリプトを読み込む必要
2. outlinerWebviewContent.tsでiframe用のHTMLを生成する必要
3. ファイルウォッチャー（setupSidePanelFileWatcher相当）をoutlinerProvider.tsに追加
4. outliner.jsにサイドパネル表示/非表示のDOM操作を追加

**代替案**: 現状のViewColumn.Beside方式を維持し、以下の制約を適用:
- 画像パス固定（要件10）
- addPage非表示（要件11）
- これらはeditorProvider.ts側で「outlinerから開かれたか」を判定して制御

**判断**: ユーザーの「共有化する形で利用できるとベスト」を考慮すると、ViewColumn.Beside方式をベースに、editorProvider側で制約を適用するのが現実的。**iframe内蔵方式は工数が大きすぎ、outlinerのアーキテクチャを根本的に変える必要がある**。

→ **ユーザーに確認が必要**: iframe型サイドパネル vs ViewColumn.Beside のどちらを望むか。

### J. 要件10-11 の実装で editorProvider.ts に与える影響

**フラグ伝達方法**:
- `vscode.openWith` ではカスタムデータを渡せない
- 代替: `context.globalState` or `context.workspaceState` にファイルパスを記録
- editorProvider.ts の `resolveCustomTextEditor` 内でステートを確認

**デグレリスク**:
- globalState にゴミが残ると、通常のmdファイルもoutlinerページと誤判定される
- **対策**: ファイルを閉じた時にステートからエントリを削除

**addPage非表示**:
- editor.js にフラグを渡す方法: `webviewContent.ts` の config に `isOutlinerPage: boolean` を追加
- editor.js 内の `COMMAND_PALETTE_ITEMS` 生成時にフィルタ
- **既存のコマンドパレットテスト（22アイテム）への影響**: テストは通常モードで実行されるため影響なし

## デグレリスク総括

| リスク | 深刻度 | 対策 |
|--------|--------|------|
| clearSearch変更でスコープが残り続ける | 低 | パンくずTOP + Cmd+[ で明示解除。意図通りの動作 |
| ESC変更で検索クリアが効かなくなる | 低 | ESCは検索クリアのみに限定。テスト確認 |
| Cmd+] がVSCodeインデントと衝突 | 中 | stopPropagation必須 |
| パンくずのノードテキスト変更追従 | 中 | renderTree内でパンくず再描画 |
| スコープルートノード削除時 | 高 | ノード削除ハンドラでスコープ確認→自動解除 |
| タグクリックとcontenteditable競合 | 中 | focus中ノードではタグ検索無効化 |
| テーマCSS追加でレイアウト崩れ | 低 | テーマ別ブロックは上書きのみ。既存ルールに影響なし |
| i18n undefined表示 | 中 | 全localeファイルにキー追加。フォールバック英語必須 |
| pageDir変更で既存ページ消失 | 高 | 変更時に警告表示。既存ファイルは移動しない |
| globalStateのゴミ残り | 中 | ファイルclose時にエントリ削除 |
| outlinerPageフラグでコマンドパレットテスト影響 | 低 | テストは通常モード実行。フラグデフォルトfalse |

---

## 要件 vs 修正内容の漏れチェック（改訂版）

| 要件 | カバー | 漏れ・追加修正 |
|------|--------|----------------|
| 1. 右クリックスコープ | ✅ | — |
| 2. Cmd+]スコープ | ✅ | `e.stopPropagation()` 必須 |
| 3. パンくずリスト | ✅ | **追加**: renderTree内でも再描画、ノード削除時のスコープ自動解除、scopeBadge廃止 |
| 4. ESCスコープ解除しない | ✅ | **追加**: searchInput内ESCハンドラも確認（clearSearch修正で対応済み） |
| 5. 検索スコープ配下のみ | ✅ | 実装済み。追加修正不要 |
| 6. 検索空でスコープ解除しない | ✅ | **追加**: clearSearch内のscopeBadge更新削除も忘れずに |
| 7. タグクリック検索 | ✅ | **追加**: focus中ノードでの競合回避策必要 |
| 8. outlinerPageDir | ✅ | **追加**: pageDir変更時の既存ページ警告、model.jsのシリアライズ対応 |
| 9. サイドパネル表示 | ⚠️ | **要確認**: iframe型 vs ViewColumn.Beside のどちらか |
| 10. 画像パス固定 | ✅ | **追加**: globalStateのライフサイクル管理 |
| 11. add page非表示 | ✅ | **追加**: webviewContent.tsのconfig型拡張 |
| 12. テーマ適用 | ✅ | **追加**: hardcoded rgba値のCSS変数化（6箇所）、全7テーマ分の定義 |
| 13. 言語適用 | ✅ | **追加**: 全7 localeファイル、ハードコード文字列10+箇所 |
