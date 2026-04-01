# 要件定義書 — v0.195.560 修正

## 修正1: Notes Undo/Redo スコープ分離

### 背景
Notes editor (.note) で outliner + sidepanel markdown を開いた状態で Cmd+Z / Cmd+Shift+Z を実行すると、sidepanel markdown を編集中にもかかわらず、outliner 側でも undo/redo が同時に発火してしまう。

### 要件

| No | 要件 |
|---|---|
| UR-10 | sidepanel markdown が開いており、かつ sidepanel markdown 内にフォーカスがある場合、Cmd+Z / Cmd+Shift+Z は markdown エディタのみに適用し、outliner の undo/redo は発火しない |
| UR-11 | sidepanel markdown が閉じている場合、または outliner 内にフォーカスがある場合は、従来通り outliner の undo/redo が動作する |
| UR-12 | 検索バーにフォーカスがある場合は、従来通り outliner の undo/redo が動作する（sidepanel が開いていても） |
| UR-13 | .out 単体（Notes以外）で sidepanel を開いた場合でも同様の挙動 |

### 影響範囲
- outliner.js のグローバルキーハンドラ（undo/redo部分）
- 既存の markdown undo/redo（editor.js capture handler）は変更不要

---

## 修正2: Scope In 検索インジケーター

### 背景
Outliner で scope in している状態で検索を行うと、検索はスコープ内に限定されるが、UIとしてそれが明示されていない。ユーザーが「全体を検索している」と誤認する可能性がある。

### 要件

| No | 要件 |
|---|---|
| SI-10 | scope in 中に、検索テキストボックスの上に「Search in scope」のようなタグ/バッジを表示する |
| SI-11 | scope out したら、タグ/バッジを非表示にする |
| SI-12 | scope を変更（別ノードへの scope in / scope out）するたびにタグの表示/非表示を更新する |
| SI-13 | タグは i18n 対応する（日本語: 「スコープ内を検索」等） |
| SI-14 | タグのデザインは小さくて目立ちすぎず、検索バーのレイアウトを崩さない |

### 影響範囲
- outliner.js（DOM生成 + 表示/非表示制御）
- outlinerWebviewContent.ts / notesWebviewContent.ts（HTML追加）
- outliner.css（スタイル追加）
- i18n messages（翻訳キー追加）

---

## 修正3: Outliner → Sidepanel Markdown へのリスト形式ペースト（Nice to have）

### 背景
Outliner で複数行を選択して Cmd+C し、sidepanel markdown editor で Cmd+V すると、現状はプレーンテキスト（タブインデント）として貼り付けられる。これをMarkdownリスト形式（`- item` + インデント）で貼り付けたい。

### 要件

| No | 要件 |
|---|---|
| CP-10 | Outliner で複数ノードを選択して Cmd+C した場合、クリップボードに text/plain に加えて text/html としてネストされたリスト（`<ul>/<li>`）構造も書き込む |
| CP-11 | sidepanel markdown editor で Cmd+V した際、text/html のリスト構造が Turndown 経由でMarkdownリスト（`- item` + 2sp indent）に変換されて貼り付けられる |
| CP-12 | Outliner 同士のペースト（内部クリップボード）の既存動作に影響を与えない |
| CP-13 | 単一ノードのコピー（テキスト選択なし）は従来通りプレーンテキストのみ |
| CP-14 | Cmd+X（カット）でも同様に text/html を書き込む |
| CP-15 | 外部アプリ（テキストエディタ等）へのペーストは text/plain が使われるため影響なし |
