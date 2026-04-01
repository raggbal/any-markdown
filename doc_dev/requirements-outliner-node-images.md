# 要件定義書 — Outliner ノード画像機能

## 概要

Outliner editor のノードに画像を Cmd+V で貼り付け、ノード下部にサムネイルとして表示する機能。画像の並べ替え（D&D）、削除、拡大表示をサポートし、保存先はスタンドアロン/Notes の両モードで設定可能とする。

---

## 機能要件

### OI-1: 画像のペースト（Cmd+V）

| No | 要件 |
|---|---|
| OI-1-1 | ノードのテキスト編集中に Cmd+V でクリップボードの画像を貼り付け可能 |
| OI-1-2 | クリップボードにテキストと画像が同時にある場合は、画像を優先して処理 |
| OI-1-3 | ペースト時、画像ファイルを設定された保存先ディレクトリに保存 |
| OI-1-4 | 保存ファイル名は `image_{timestamp}.{ext}` の自動生成 |
| OI-1-5 | 画像はノードの `images` 配列にファイル名（相対パス）として追加 |
| OI-1-6 | ペースト後、即座にノード下部にサムネイルが表示される |

### OI-2: 画像の表示（サムネイル行）

| No | 要件 |
|---|---|
| OI-2-1 | 画像はノードの下部にサムネイルとして横に並んで表示される |
| OI-2-2 | subtext がある場合、画像は subtext のさらに下に表示 |
| OI-2-3 | 表示順序: テキスト → subtext → 画像サムネイル行 |
| OI-2-4 | 1行あたり4〜5枚の画像が並び、それ以上は折り返す |
| OI-2-5 | サムネイルは小さい画像（アスペクト比を維持） |
| OI-2-6 | ノード折りたたみ時は画像も非表示 |

### OI-3: 画像の D&D 並べ替え

| No | 要件 |
|---|---|
| OI-3-1 | サムネイル画像をドラッグして同一ノード内で並べ替え可能 |
| OI-3-2 | ドロップ位置にインジケーター（青線）を表示 |
| OI-3-3 | 並べ替え後、ノードモデルの `images` 配列順序を更新 |
| OI-3-4 | 並べ替え後に `scheduleSyncToHost()` で保存 |

### OI-4: 画像の削除

| No | 要件 |
|---|---|
| OI-4-1 | サムネイル画像をクリックして選択状態にする（選択枠を表示） |
| OI-4-2 | 選択状態で Delete/Backspace キーを押すと画像をノードから除去 |
| OI-4-3 | 画像ファイル自体はディスクから削除しない（参照のみ除去） |
| OI-4-4 | 削除後に `scheduleSyncToHost()` で保存 |

### OI-5: 画像の拡大表示（ダブルクリック）

| No | 要件 |
|---|---|
| OI-5-1 | サムネイル画像をダブルクリックすると拡大フロート表示 |
| OI-5-2 | フロートはオーバーレイ（半透明黒背景）付き |
| OI-5-3 | 画像は見やすいサイズで中央に表示（画面に収まるよう max-width/max-height 制約） |
| OI-5-4 | オーバーレイクリック、または Escape キーで閉じる |

### OI-6: 画像保存先設定

| No | 要件 |
|---|---|
| OI-6-1 | `fractal.outlinerImageDefaultDir` VSCode設定を追加（type: string, default: `"./images"`） |
| OI-6-2 | .out JSON 内の `imageDir` フィールドで個別設定可（VSCode設定より優先） |
| OI-6-3 | 優先順位: .out JSON の `imageDir` → VSCode設定 `outlinerImageDefaultDir` → デフォルト `./images` |
| OI-6-4 | 相対パスは `.out` ファイルからの相対で解決 |
| OI-6-5 | 空文字の場合は `.out` ファイルと同じディレクトリに保存 |
| OI-6-7 | markdown の `fractal.imageDefaultDir` / `fractal.forceRelativeImagePath` とは独立した設定 |
| OI-6-8 | `imageDir` は webview 側で変数保持し、`syncData` 時に serialize 結果に付加（pageDir と同パターン） |

### OI-7: スタンドアロン Outliner の画像設定 UI

| No | 要件 |
|---|---|
| OI-7-1 | 検索バー右端の設定メニュー（⋮）に「画像フォルダ設定」リンクを追加 |
| OI-7-2 | クリックすると画像保存先設定ダイアログを表示（VSCode InputBox） |
| OI-7-3 | 設定ダイアログでは現在の画像保存先パスを確認できる |
| OI-7-4 | 設定ダイアログでパスの変更が可能（.out JSON の `imageDir` に保存） |
| OI-7-5 | markdown の画像設定画面（outline パネルの「画像保存先」UI）と同等の表示 |

### OI-8: Notes editor からの画像保存先

| No | 要件 |
|---|---|
| OI-8-1 | Notes editor から outliner を開く場合、画像保存先は `{pageDir}/images/` に固定 |
| OI-8-2 | MD ページの画像保存先と同じフォルダに保存（画像を統一管理） |
| OI-8-3 | Notes mode では画像フォルダ設定メニューを非表示（自動管理） |

---

## データモデル変更

### ノードモデルへの `images` フィールド追加

```javascript
{
  id: string,
  parentId: string | null,
  children: string[],
  text: string,
  tags: string[],
  isPage: boolean,
  pageId: string | null,
  collapsed: boolean,
  checked: boolean | null,
  subtext: string,
  images: string[]       // 新規追加: 画像ファイルの相対パス配列（.outファイルからの相対）
}
```

- `images` はデフォルト空配列 `[]`
- 各要素は `.out` ファイルからの相対パス（例: `"./images/image_1712345678.png"`）
- 画像の表示順序は配列順序に従う
- `images` フィールドが存在しない既存データは `[]` として扱う（後方互換）

---

## DOM 構造変更

```
.outliner-node (div[data-id=nodeId])
├── .outliner-node-indent
├── .outliner-scope-btn
├── .outliner-bullet
├── .outliner-checkbox (optional)
├── .outliner-page-icon (optional)
└── .outliner-node-content
    ├── .outliner-text (contenteditable)
    ├── .outliner-subtext (contenteditable)
    └── .outliner-images (div)              ← 新規追加
        ├── .outliner-image-thumb (img)     ← サムネイル1
        ├── .outliner-image-thumb (img)     ← サムネイル2
        └── ...
```

---

## 非機能要件

| No | 要件 |
|---|---|
| ONF-1 | 画像のサムネイル表示は既存のノード操作（テキスト編集、D&D移動、折りたたみ等）に影響しない |
| ONF-2 | 画像データ（パス文字列）はノードモデルに含まれ、syncData で永続化される |
| ONF-3 | 既存テストが全て通ること（デグレなし） |
| ONF-4 | 7テーマ全てで画像表示が適切であること |
