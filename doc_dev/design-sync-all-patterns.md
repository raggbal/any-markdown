# 全エディタパターンの同期設計書

## エディタパターン一覧

| # | パターン | ファイル種別 | I/O方式 |
|---|---------|------------|--------|
| A | md editor (standalone) | .md | VSCode TextDocument |
| B | md editor の sidepanel md | .md | VSCode TextDocument (SidePanelManager) |
| C | outliner editor (standalone) | .out | VSCode TextDocument |
| D | outliner editor の sidepanel md | .md | VSCode TextDocument (SidePanelManager) |
| E | note editor (outliner部分) | .out | fs.writeFileSync (直接ディスクI/O) |
| F | note editor の sidepanel md | .md | VSCode TextDocument (SidePanelManager) |
| G | note editor (構造管理) | outline.note | fs.writeFileSync (直接ディスクI/O) |

## 編集元パターン一覧

| # | 編集元 | I/O方式 |
|---|--------|--------|
| 1 | 同一タイプの別パネル | 各エディタのI/O方式に依存 |
| 2 | 別タイプのエディタ | 相手のI/O方式に依存 |
| 3 | VSCode text editor | VSCode TextDocument |
| 4 | AI / git / 外部プロセス | 直接ディスク書き込み |

---

## .md ファイルの同期（A, B, D, F）

### 現状

全てVSCode TextDocumentを使用。`onDidChangeTextDocument` がVSCode内の変更を自動ブロードキャスト。

| 編集元 → 反映先 | 現状の同期経路 | 動作 |
|---|---|---|
| A↔A (standalone md 2パネル) | `onDidChangeTextDocument` (各パネル独立クロージャ) | OK |
| A↔B (standalone ↔ sidepanel) | `onDidChangeTextDocument` | OK |
| B↔D (md SP ↔ outliner SP) | `onDidChangeTextDocument` | OK |
| A↔F (standalone md ↔ notes SP) | `onDidChangeTextDocument` | OK |
| 3→A/B/D/F (text editor) | `onDidChangeTextDocument` | OK |
| 4→A/B/D/F (AI/git) | **FileSystemWatcher** → TextDocument更新 → `onDidChangeTextDocument` | OK |

### FileSystemWatcher の現状

| エディタ | watcher数 | 作成場所 |
|---------|----------|---------|
| md standalone (パネルあたり) | 1 | editorProvider.ts resolveCustomTextEditor内 |
| md sidepanel (パネルあたり) | 1 | SidePanelManager.setupFileWatcher内 |
| outliner sidepanel (パネルあたり) | 1 | SidePanelManager.setupFileWatcher内 |
| notes sidepanel (パネルあたり) | 1 | SidePanelManager.setupFileWatcher内 |

同じ.mdファイルを2パネルで開くと、watcherが2つ作成される。
→ 2番目のwatcherは `newContent !== currentContent` でスキップされるため**無害だが無駄**。

### 変更不要

.md ファイルの同期は現状で全パターン動作している。

---

## .out ファイルの同期（C, E）

### 現状

| 編集元 → 反映先 | 現状の同期経路 | 動作 |
|---|---|---|
| C↔C (standalone out 2パネル) | `onDidChangeTextDocument` (各パネル独立クロージャ) | OK |
| E↔E (notes out 2パネル) | Panel A `fs.writeFileSync` → Panel B FileSystemWatcher検知 | OK |
| C→E (standalone → notes) | WorkspaceEdit → document.save() → ディスク変更 → Notes FileSystemWatcher | OK |
| E→C (notes → standalone) | `fs.writeFileSync` → ディスク変更 → outlinerProvider FileSystemWatcher | OK |
| 3→C (text editor → standalone) | `onDidChangeTextDocument` | OK |
| 3→E (text editor → notes) | text editor save → ディスク変更 → Notes FileSystemWatcher | OK |
| 4→C (AI/git → standalone) | FileSystemWatcher → TextDocument更新 → `onDidChangeTextDocument` | OK |
| 4→E (AI/git → notes) | FileSystemWatcher → ファイル読み直し → updateData送信 | OK |

### FileSystemWatcher の現状

| エディタ | watcher数 | 対象 |
|---------|----------|------|
| outliner standalone (パネルあたり) | 1 | 単一.outファイル |
| notes (パネルあたり) | 1 (folder watcher) | `*.out` パターン |

### 変更不要

.out ファイルの同期は現状で全パターン動作している。

---

## outline.note ファイルの同期（G） ★要修正

### 現状

**outline.note は監視対象外。** folderWatcher のパターンは `*.out` のみ。

```typescript
const watcherPattern = new vscode.RelativePattern(vscode.Uri.file(folderPath), '*.out');
```

### outline.note を変更する操作の一覧

| 操作 | メッセージ | outline.note変更 | .out変更 | 他パネル反映(現状) |
|------|----------|-----------------|---------|----------------|
| ファイル作成 | `notesCreateFile` | あり | .out作成 | **される** (onDidCreate) |
| ファイル削除 | `notesDeleteFile` | あり | .out削除 | **される** (onDidDelete) |
| ファイル名変更 | `notesRenameTitle` | あり | .out書き換え | **される** (onDidChange) |
| フォルダ作成 | `notesCreateFolder` | あり | **なし** | **されない** ★ |
| フォルダ削除 | `notesDeleteFolder` | あり | .out削除あり | **部分的** |
| フォルダ名変更 | `notesRenameFolder` | あり | **なし** | **されない** ★ |
| フォルダ開閉 | `notesToggleFolder` | あり | **なし** | **されない** ★ |
| アイテム移動 | `notesMoveItem` | あり | **なし** | **されない** ★ |
| パネル幅変更 | `notesSavePanelWidth` | あり | **なし** | **されない** ★ |
| S3パス保存 | `notesS3SaveBucketPath` | あり | **なし** | **されない** ★ |
| Daily Notes作成 | `notesOpenDailyNotes`等 | あり | .out作成 | **される** (onDidCreate) |

★マークの6操作が、複数パネル時に同期されない。

### 編集元と反映先のパターン

| 編集元 → 反映先 | 現状の同期経路 | 動作 |
|---|---|---|
| E(Panel A) → E(Panel B) 構造変更 | **経路なし** | **されない** ★ |
| 4→E (AI/git → notes) 構造変更 | **経路なし** | **されない** ★ |

### 修正設計

#### 方針: outline.note 用の FileSystemWatcher を追加

`notesEditorProvider.ts` の `openNotesFolder` 内で、`*.out` watcher に加えて `outline.note` watcher を作成する。

#### 自己書き込みガード

`saveStructure()` には `isWriting` に相当するフラグがないため、追加が必要。

**notes-file-manager.ts に追加:**

```typescript
private isWritingStructure = false;
private isWritingStructureTimer: ReturnType<typeof setTimeout> | null = null;

getIsWritingStructure(): boolean { return this.isWritingStructure; }

saveStructure(): void {
    if (!this.structure) return;
    try {
        this.isWritingStructure = true;
        fs.writeFileSync(this.getNoteFilePath(), JSON.stringify(this.structure, null, 2), 'utf8');
        if (this.isWritingStructureTimer) clearTimeout(this.isWritingStructureTimer);
        this.isWritingStructureTimer = setTimeout(() => {
            this.isWritingStructure = false;
            this.isWritingStructureTimer = null;
        }, 300);
    } catch (e) {
        this.isWritingStructure = false;
        console.error('[NotesFileManager] saveStructure error:', e);
    }
}

// dispose() に追加:
if (this.isWritingStructureTimer) {
    clearTimeout(this.isWritingStructureTimer);
    this.isWritingStructureTimer = null;
}
this.isWritingStructure = false;
```

#### notesEditorProvider.ts に追加

`openNotesFolder` 内、既存の `folderWatcher` セットアップの後に:

```typescript
// --- outline.note の外部変更検知 ---
const noteFileWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(folderPath), 'outline.note')
);

disposables.push(noteFileWatcher.onDidChange(() => {
    // 自己書き込みなら無視
    if (fileManager.getIsWritingStructure()) return;

    setTimeout(() => {
        try {
            if (fileManager.getIsWritingStructure()) return;

            // 構造を再読み込みしてwebviewに送信
            (fileManager as any).structure = null; // キャッシュ無効化
            const structure = fileManager.loadStructure();
            const refreshFileList = fileManager.listFiles();
            const currentFile = fileManager.getCurrentFilePath();
            panel.webview.postMessage({
                type: 'notesFileListChanged',
                fileList: refreshFileList,
                structure,
                currentFile,
            });
        } catch {
            // 読み込みエラーは無視
        }
    }, 200);
}));

disposables.push(noteFileWatcher);
```

---

## 修正後の全パターンまとめ

### .md ファイル（変更なし）

| 同期ケース | 仕組み |
|-----------|-------|
| VSCode内パネル間 | `onDidChangeTextDocument` |
| AI/git/外部プロセス | FileSystemWatcher → TextDocument更新 → `onDidChangeTextDocument` |

### .out ファイル（変更なし）

| 同期ケース | 仕組み |
|-----------|-------|
| standalone 2パネル間 | `onDidChangeTextDocument` |
| Notes 2パネル間 | FileSystemWatcher (`*.out`) + `isWriting` フラグ |
| standalone ↔ Notes | FileSystemWatcher |
| AI/git/外部プロセス | FileSystemWatcher |

### outline.note ファイル（★今回修正）

| 同期ケース | 修正前 | 修正後 |
|-----------|-------|-------|
| Notes 2パネル間 (構造変更) | **同期されない** | FileSystemWatcher (`outline.note`) + `isWritingStructure` フラグ |
| AI/git/外部プロセス | **同期されない** | FileSystemWatcher (`outline.note`) |

---

## 修正対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/shared/notes-file-manager.ts` | `isWritingStructure` フラグ + タイマー追加、`saveStructure()` 修正、`dispose()` にタイマークリア追加 |
| `src/notesEditorProvider.ts` | `outline.note` 用 FileSystemWatcher 追加 |

---

## 変更しても同期されないもの（仕様）

| 項目 | 理由 |
|------|------|
| パネル幅変更 (`notesSavePanelWidth`) | outline.note変更は検知されるが、webviewにはファイル一覧として送信される。パネル幅はwebview側のローカル状態なので、`notesFileListChanged` では復元されない。**各パネル独立で正しい動作** |
| フォルダ開閉状態 (`notesToggleFolder`) | 同上。各パネルで独立した開閉状態を持つのが正しい |
| S3バケットパス | 設定値であり、頻繁に変更されない。反映されなくても実害なし |
