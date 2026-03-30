# 設計書 — Outliner外部変更検知・同期

## 変更対象ファイル一覧

| ファイル | 変更内容 | 要件 |
|---------|---------|------|
| `src/outlinerProvider.ts` | FileSystemWatcher追加 | B-1〜B-5 |
| `src/notesEditorProvider.ts` | 現在開いている.outファイルの外部変更検知追加 | A-1〜A-5 |
| `src/shared/notes-file-manager.ts` | 自己書き込みフラグ追加 | A-2 |
| `src/webview/outliner.js` | 編集中ガード+キュー機構追加 | C-1〜C-7 |

**変更しないファイル:**
- `src/webview/outliner-model.js` — モデル構造は変更不要
- `src/shared/notes-message-handler.ts` — メッセージルーティングは変更不要
- `src/shared/notes-host-bridge.js` — ブリッジは変更不要
- `src/shared/outliner-host-bridge.js` — ブリッジは変更不要
- `src/extension.ts` — 登録は変更不要

---

## レベルB設計: Outliner standaloneの FileSystemWatcher追加

### 対象ファイル: `src/outlinerProvider.ts`

### 設計方針

Markdown editorの [editorProvider.ts:626-666](src/editorProvider.ts#L626-L666) と同じパターンを適用する。

### 変更箇所

`resolveCustomTextEditor` 内、既存の `onDidChangeTextDocument` ハンドラ（line 339-359）の直後に追加。

### 新規コード概要

```typescript
// --- FileSystemWatcher（外部プロセスからの変更検知） ---
const fileWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
        vscode.Uri.joinPath(document.uri, '..'),
        path.basename(document.uri.fsPath)
    )
);

const fileChangeSubscription = fileWatcher.onDidChange(async (uri) => {
    if (uri.toString() === document.uri.toString()) {
        setTimeout(async () => {
            try {
                const fileContent = await vscode.workspace.fs.readFile(uri);
                const newContent = new TextDecoder().decode(fileContent);
                const currentContent = document.getText();

                if (newContent !== currentContent) {
                    // VSCodeドキュメントを更新（onDidChangeTextDocumentをトリガー）
                    isApplyingOwnEdit = true;
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(currentContent.length)
                    );
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(document.uri, fullRange, newContent);
                    await vscode.workspace.applyEdit(edit);
                    isApplyingOwnEdit = false;

                    // dirty状態をクリア（ディスクは最新）
                    await document.save();

                    // webviewに直接通知（isApplyingOwnEditでonDidChangeTextDocumentは抑制済み）
                    try {
                        const data = JSON.parse(newContent);
                        webviewPanel.webview.postMessage({
                            type: 'updateData',
                            data: data
                        });
                    } catch { /* JSONパースエラーは無視 */ }
                }
            } catch (error) {
                isApplyingOwnEdit = false;
                console.error('[Outliner] Error reading file after external change:', error);
            }
        }, 100); // 書き込み完了を待つ
    }
});

disposables.push(fileWatcher);
disposables.push(fileChangeSubscription);
```

### デグレ防止ポイント

1. **`isApplyingOwnEdit` フラグ**: 既存の `onDidChangeTextDocument` ハンドラ（line 344）が `isApplyingOwnEdit` をチェックしているため、FileSystemWatcher経由の更新で重複通知は発生しない
2. **100ms遅延**: ファイル書き込み完了を待つ（Markdown editorと同じ）
3. **内容比較**: `newContent !== currentContent` で変更がない場合はスキップ
4. **JSONパースエラー**: try-catchで無視（書き込み途中の不完全JSONへの対応）
5. **dispose**: 既存のdisposablesパターンに従い、`onDidDispose` で自動クリーンアップ

### import追加

`outlinerProvider.ts` の先頭に `import * as path from 'path';` が必要（既存であれば不要）。

---

## レベルA設計: Notes経由の外部変更検知

### 対象ファイル: `src/notesEditorProvider.ts`, `src/shared/notes-file-manager.ts`

### 設計方針

Notesは VSCode の `TextDocument` を使わず `fs.writeFileSync` で直接ファイルI/Oを行うため、`onDidChangeTextDocument` は使えない。代わりに **FileSystemWatcher** で現在開いている `.out` ファイルの変更を監視する。

### 課題: 自己書き込みの区別

NotesFileManagerの `_writeFile()` がファイルに書き込むと、FileSystemWatcherが反応する。これを外部変更と誤検知しないために、**自己書き込みフラグ**を NotesFileManager に追加する。

### notes-file-manager.ts の変更

```typescript
// 新規プロパティ
private isWriting = false;

// 新規メソッド
getIsWriting(): boolean { return this.isWriting; }
getLastKnownContent(): string | null { return this.lastJsonString; }

/**
 * 外部変更検知時に呼び出す。lastJsonStringを更新し、
 * 残っているデバウンスタイマーを停止する（古いデータの書き戻しを防止）。
 */
updateLastKnownContent(jsonString: string): void {
    this.lastJsonString = jsonString;
    this.isDirty = false;
    if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
    }
}

// _writeFile() の変更
private _writeFile(jsonString: string): void {
    if (!this.currentFilePath) return;
    try {
        this.isWriting = true;
        fs.writeFileSync(this.currentFilePath, jsonString, 'utf8');
        this.isDirty = false;
        // 書き込み完了後、短い遅延でフラグをリセット
        // （FileSystemWatcherの発火タイミングを考慮）
        setTimeout(() => { this.isWriting = false; }, 300);
    } catch (e) {
        this.isWriting = false;
        console.error('[NotesFileManager] write error:', e);
    }
}
```

### notesEditorProvider.ts の変更

既存の `setupFolderWatcher` メソッドに `onDidChange` を追加する。

```typescript
// setupFolderWatcher 内に追加
this.disposables.push(this.folderWatcher.onDidChange((uri) => {
    if (!this.fileManager || !this.panel) return;

    const currentFile = this.fileManager.getCurrentFilePath();
    if (!currentFile) return;

    // 変更されたファイルが現在開いているファイルでなければ無視
    if (uri.fsPath !== currentFile) return;

    // 自己書き込みなら無視
    if (this.fileManager.getIsWriting()) return;

    // 外部変更を検知 → ファイルを読み直してwebviewに送信
    setTimeout(() => {
        try {
            // 再度ガードチェック（遅延中に状態が変わる可能性）
            if (!this.fileManager || !this.panel) return;
            if (this.fileManager.getIsWriting()) return;

            const content = fs.readFileSync(currentFile, 'utf8');

            // 内容が同じなら何もしない（isWritingタイミングずれの安全弁）
            if (content === this.fileManager.getLastKnownContent()) return;

            const data = JSON.parse(content);

            // fileChangeIdなしで送信（ファイル切替ではなく外部変更であることを示す）
            this.panel.webview.postMessage({
                type: 'updateData',
                data: data
                // fileChangeId: なし → outliner.jsで検索・スコープリセットしない
            });

            // lastJsonStringを更新し、デバウンスタイマーを停止
            // （古いデータの書き戻しを防止）
            this.fileManager.updateLastKnownContent(content);
        } catch {
            // JSONパースエラー or ファイル読み込みエラーは無視
        }
    }, 200); // 書き込み完了を待つ（isWritingの300msリセットより短い）
}));
```

### デグレ防止ポイント

1. **自己書き込みガード**: `isWriting` フラグ + 300ms遅延リセットで、`_writeFile` による書き込みを確実にフィルタリング
2. **currentFilePathチェック**: 変更が現在表示中のファイルでない場合は無視
3. **fileChangeIdなし**: `updateData` に `fileChangeId` を含めないことで、outliner.js側で「ファイル切替」ではなく「外部変更」として処理される（既存の分岐 `if (msg.fileChangeId !== undefined)` で区別済み）
4. **lastJsonString更新**: 外部変更後の内容を lastJsonString に反映し、次のデバウンスsaveで古いデータが書き戻されるのを防止
5. **200ms遅延**: FileSystemWatcherの発火が書き込み途中の可能性があるため、遅延を入れる
6. **既存のファイル一覧更新**: `refreshFileList` は `onDidCreate` / `onDidDelete` にのみ登録されたまま。`onDidChange` は新しいハンドラが処理する
7. **`fs` import**: `notesEditorProvider.ts` で既に `fs` をimportしているかを確認。なければ追加

### lastJsonString更新の重要性

```
状態: Notes webview が file.out を表示中

1. 外部プロセスが file.out を変更（外部変更検知 → updateData送信）
2. NotesFileManager.lastJsonString は古いまま
3. webview側はupdateDataで新データを表示
4. ユーザーがノード編集 → scheduleSyncToHost() → 1秒後にsyncData送信
5. ホスト側: saveCurrentFile(syncDataの内容) → _writeFile
   → 問題なし（syncDataにはwebview側の最新データが含まれる）

しかし:
4'. ユーザーが何も編集しないまま、デバウンスタイマーが残っていた場合:
5'. saveCurrentFile(lastJsonString) → _writeFile
   → lastJsonStringが古い → 外部変更が上書きされて消失！

対策: 外部変更検知時にlastJsonStringを更新する
```

### fileManager の公開メソッド

private フィールドには公開メソッド経由でアクセスする（`as any` キャストは使わない）:
- `getIsWriting()` — 自己書き込み中かチェック
- `getLastKnownContent()` — 最後の既知内容を取得（内容比較用）
- `updateLastKnownContent(jsonString)` — 外部変更検知時に呼ぶ。lastJsonString更新、isDirtyクリア、デバウンスタイマー停止

---

## レベルC設計: outliner.js webview側の編集中ガード

### 対象ファイル: `src/webview/outliner.js`

### 設計方針

Markdown editorの `markActivelyEditing()` / `applyQueuedExternalChange()` / `queuedExternalContent` パターンを、Outlinerのデータモデル（JSONツリー）に適合させる。

### 新規変数（outliner.js冒頭の変数宣言エリアに追加）

```javascript
// --- 外部変更検知用 ---
var isActivelyEditing = false;
var editingIdleTimer = null;
var queuedExternalUpdate = null;  // { data: object } キューされた外部変更
var EDITING_IDLE_TIMEOUT = 1500;  // 1.5秒
```

### 新規関数: markActivelyEditing()

```javascript
/**
 * ユーザーが編集中であることをマーク。アイドルタイマーをリセット。
 * 編集中は外部変更をキューし、アイドル時に適用する。
 */
function markActivelyEditing() {
    isActivelyEditing = true;

    clearTimeout(editingIdleTimer);
    editingIdleTimer = setTimeout(function() {
        isActivelyEditing = false;
        applyQueuedExternalUpdate();
    }, EDITING_IDLE_TIMEOUT);
}
```

### 新規関数: applyExternalUpdate(data)

```javascript
/**
 * 外部変更を適用する共通関数。フォーカス・スコープ・isDailyNotesを保持。
 * updateDataハンドラ（アイドル時即時適用）と
 * applyQueuedExternalUpdate()（キュー消化）の両方から呼ばれる。
 */
function applyExternalUpdate(data) {
    var savedFocus = focusedNodeId;

    model = new OutlinerModel(data);
    searchEngine = new OutlinerSearch.SearchEngine(model);
    pageDir = data.pageDir || null;
    sidePanelWidthSetting = data.sidePanelWidth || null;
    pinnedTags = data.pinnedTags || [];
    // isDailyNotes は変更しない（外部変更はファイル切替ではない）
    // currentScope も変更しない（スコープ保持）

    // undo/redoクリア（外部変更後は意味が変わるため）
    undoStack.length = 0;
    redoStack.length = 0;
    updateUndoRedoButtons();

    updatePinnedTagBar();

    // ページタイトル更新（編集中でなければ）
    if (pageTitleInput && document.activeElement !== pageTitleInput) {
        pageTitleInput.value = model.title || '';
    }

    renderTree();

    // フォーカス復元
    if (savedFocus && model.getNode(savedFocus)) {
        focusNode(savedFocus);
    }
}
```

### 新規関数: applyQueuedExternalUpdate()

```javascript
/**
 * キューされた外部変更を適用する。
 */
function applyQueuedExternalUpdate() {
    if (queuedExternalUpdate === null) return;

    var data = queuedExternalUpdate.data;
    queuedExternalUpdate = null;
    applyExternalUpdate(data);
}
```

### updateData ハンドラの変更

既存の `case 'updateData':` ハンドラ（line 3343〜）を修正。
**重要**: fileChangeId分岐の追加は、既存コードの**先頭**に挿入する。既存のfileChangeId付きロジックは一切変更しない。

```javascript
case 'updateData':
    // Notes ファイル切替（fileChangeIdあり）は従来通り即時適用
    if (msg.fileChangeId !== undefined) {
        // isActivelyEditing中でも即時適用（ファイル切替は最優先）
        isActivelyEditing = false;
        clearTimeout(editingIdleTimer);
        queuedExternalUpdate = null;

        // --- ここから既存コードそのまま（1行も変更しない） ---
        var savedFocus = focusedNodeId;
        model = new OutlinerModel(msg.data);
        searchEngine = new OutlinerSearch.SearchEngine(model);
        pageDir = msg.data.pageDir || null;
        sidePanelWidthSetting = msg.data.sidePanelWidth || null;
        pinnedTags = msg.data.pinnedTags || [];
        undoStack.length = 0;
        redoStack.length = 0;
        updateUndoRedoButtons();
        isDailyNotes = !!msg.isDailyNotes;
        updatePinnedTagBar();
        // fileChangeIdが存在するのでNotes用のリセット処理が走る
        navBackStack.length = 0;
        navForwardStack.length = 0;
        // ... (以降も既存コード全てそのまま)
        break;
    }

    // === 以下が新規追加 ===

    // 外部変更（fileChangeIdなし）→ 編集中ガード
    if (isActivelyEditing) {
        queuedExternalUpdate = { data: msg.data };
        break;
    }

    // アイドル状態 → 即時適用（共通関数を使用）
    applyExternalUpdate(msg.data);
    break;
```

### isDailyNotes 保持の理由

外部変更の `updateData` には `isDailyNotes` フィールドが含まれない（`msg.isDailyNotes === undefined`）。
既存コードは `isDailyNotes = !!msg.isDailyNotes` で常に上書きするため、外部変更時に `false` にリセットされてしまう。
Daily Notesナビバーが消えるバグになる。

**対策**: `applyExternalUpdate()` では `isDailyNotes` を変更しない。
ファイル切替時のみ `isDailyNotes = !!msg.isDailyNotes` が実行される（fileChangeId分岐内）。

### markActivelyEditing() の呼び出し箇所

既存の `scheduleSyncToHost()` を呼ぶすべての箇所は、ユーザー操作を意味する。`scheduleSyncToHost()` 内で `markActivelyEditing()` を呼ぶのが最も安全かつ網羅的:

```javascript
function scheduleSyncToHost() {
    markActivelyEditing();  // ← 追加
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(function() {
        syncToHostImmediate();
    }, SYNC_DEBOUNCE_MS);
}
```

**理由:** `scheduleSyncToHost()` は50箇所以上から呼ばれており、全てのユーザー編集操作（テキスト入力・ノード追加削除・移動・タグ変更・チェックボックス等）をカバーする。個別に `markActivelyEditing()` を追加する必要がない。

### デグレ防止ポイント

1. **fileChangeIdによる分岐**: Notes ファイル切替（`fileChangeId !== undefined`）は編集中ガードを**バイパス**して即時適用。これにより既存のNotes機能（ファイル切替・Daily Notes・検索ジャンプ等）に影響しない
2. **scopeToNodeId / jumpToNodeId**: これらは `fileChangeId` 付きの `updateData` でのみ送られるため、外部変更のコードパスには影響しない
3. **scheduleSyncToHost 1箇所変更**: `markActivelyEditing()` を `scheduleSyncToHost()` 内に追加するだけで全ユーザー操作をカバー。個別関数への分散修正は不要
4. **syncToHostImmediate()** には追加しない: `syncToHostImmediate()` はundo/redo（`isUndoRedo = true`）からも呼ばれるが、これはユーザー操作ではないため `markActivelyEditing()` は不要。ただし、`scheduleSyncToHost()` 経由の呼び出しでは既にマーク済み
5. **既存のisDailyNotes処理**: fileChangeId分岐の中にあるため影響なし

---

## メッセージフロー図

### Outliner standalone — 外部変更検知

```
外部プロセスが .out ファイルを変更
  ↓
FileSystemWatcher.onDidChange 発火
  ↓ (100ms delay)
ファイル読み込み → VSCodeドキュメント更新
  ↓ (isApplyingOwnEdit = true で onDidChangeTextDocument を抑制)
webviewPanel.webview.postMessage({ type: 'updateData', data })
  ↓ (fileChangeId なし)
outliner.js updateData ハンドラ
  ├─ isActivelyEditing ? → queuedExternalUpdate にキュー
  └─ idle ? → 即時適用（フォーカス保持）
```

### Notes — 外部変更検知

```
外部プロセスが .out ファイルを変更
  ↓
folderWatcher.onDidChange 発火
  ↓
currentFilePath と一致? + isWriting == false?
  ↓ (200ms delay + 再チェック)
ファイル読み込み → JSONパース → lastJsonString更新
  ↓
panel.webview.postMessage({ type: 'updateData', data })
  ↓ (fileChangeId なし)
outliner.js updateData ハンドラ
  ├─ isActivelyEditing ? → queuedExternalUpdate にキュー
  └─ idle ? → 即時適用（フォーカス保持）
```

### Notes — ファイル切替（変更なし）

```
ユーザーが左パネルでファイルクリック
  ↓
flushOutlinerSync() → syncToHostImmediate()
  ↓
notesOpenFile → fileManager.openFile() → fileChangeId++
  ↓
panel.webview.postMessage({ type: 'updateData', data, fileChangeId })
  ↓ (fileChangeId あり)
outliner.js updateData ハンドラ → 全リセット（検索・スコープ・ナビ・undo）
  ↓ (isActivelyEditing = false に強制リセット)
```

---

## 既存機能への影響分析

### outlinerProvider.ts

| 既存機能 | 影響 | 対策 |
|---------|------|------|
| syncData → applyEdit | なし | isApplyingOwnEditで自己抑制済み |
| onDidChangeTextDocument | なし | FileSystemWatcher経由はisApplyingOwnEditで抑制 |
| SidePanelManager | なし | 変更対象外 |
| ページ操作 (makePage等) | なし | 変更対象外 |
| 設定変更 (theme等) | なし | 変更対象外 |

### notesEditorProvider.ts

| 既存機能 | 影響 | 対策 |
|---------|------|------|
| ファイル切替 | なし | fileChangeId付きupdateDataは変更なし |
| ファイル作成/削除 | なし | onDidCreate/onDidDeleteは変更なし |
| S3同期 | なし | S3操作はflushSave後に実行 |
| Daily Notes | なし | fileChangeId付きupdateDataは変更なし |
| 左パネル開閉 | なし | 変更対象外 |

### outliner.js

| 既存機能 | 影響 | 対策 |
|---------|------|------|
| テキスト編集 | なし | scheduleSyncToHostにmarkActivelyEditing追加のみ |
| undo/redo | なし | isUndoRedo時はsyncToHostImmediateを直接呼び出し |
| 検索 | なし | fileChangeId分岐で保護 |
| スコープ | なし | 外部変更時はスコープ保持、ファイル切替時はリセット |
| ページ操作 | なし | 変更対象外 |
| Daily Notes | なし | fileChangeId付きupdateDataは変更なし |
| 固定タグ | なし | pinnedTagsは外部変更時に再読み込み |

### notes-file-manager.ts

| 既存機能 | 影響 | 対策 |
|---------|------|------|
| saveCurrentFile | isWritingフラグ追加 | _writeFile内で設定、300msで自動リセット |
| flushSave | なし | _writeFile経由でisWriting設定済み |
| openFile | なし | 変更なし |
| dispose | なし | isWritingは自然にGC |

---

## 実装計画

### STEP 1: notes-file-manager.ts の変更（レベルA基盤）

1. `isWriting` プロパティ追加 (`private isWriting = false;`)
2. `getIsWriting()` メソッド追加
3. `getLastKnownContent()` メソッド追加
4. `updateLastKnownContent(jsonString)` メソッド追加
5. `_writeFile()` に `isWriting` フラグ設定 + 300ms setTimeout リセット追加

**確認:** `npm run compile` が通ること

### STEP 2: outlinerProvider.ts の変更（レベルB）

1. `import * as path from 'path';` の追加（未importの場合）
2. `onDidChangeTextDocument` ハンドラ直後に FileSystemWatcher コード追加
3. `disposables.push(fileWatcher)` と `disposables.push(fileChangeSubscription)` 追加

**確認:** `npm run compile` が通ること

### STEP 3: notesEditorProvider.ts の変更（レベルA）

1. `setupFolderWatcher()` 内に `this.folderWatcher.onDidChange` ハンドラ追加
2. ハンドラ内: currentFile一致チェック → isWritingチェック → 200ms遅延 → 再チェック → ファイル読み込み → 内容比較 → updateData送信 → updateLastKnownContent呼び出し

**確認:** `npm run compile` が通ること

### STEP 4: outliner.js の変更（レベルC）

1. 変数宣言追加: `isActivelyEditing`, `editingIdleTimer`, `queuedExternalUpdate`, `EDITING_IDLE_TIMEOUT`
2. `markActivelyEditing()` 関数追加
3. `applyExternalUpdate(data)` 関数追加
4. `applyQueuedExternalUpdate()` 関数追加
5. `scheduleSyncToHost()` 内に `markActivelyEditing()` 呼び出し追加
6. `case 'updateData':` ハンドラの修正:
   - fileChangeId分岐の先頭に `isActivelyEditing`/`editingIdleTimer`/`queuedExternalUpdate` リセット追加
   - fileChangeId分岐の後に外部変更ガード分岐追加

**確認:** テストサーバー起動 + 既存テスト通過

### STEP 5: 既存テスト実行

1. `npm run compile`
2. `npx playwright test` で全テスト実行
3. 失敗があれば原因調査・修正

### STEP 6: 手動検証

1. Outliner standalone: 外部からファイル変更 → webview反映確認
2. Notes: 外部からファイル変更 → webview反映確認
3. 通常編集（テキスト入力・ノード操作・undo/redo）が正常動作
4. Notes ファイル切替が正常動作
5. Daily Notes が正常動作（ナビバー消えないこと）
6. 検索・スコープが正常動作
