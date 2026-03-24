# Changelog

All notable changes to the "Any Markdown Editor" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.195.515] - 2026-03-24

### Added

- **Notes: タブナビゲーション** — 左パネルをNotes/Search/Todayの3タブ構成に刷新
- **Notes: Daily Notesナビバー** — アウトライナ側にToday/前日/翌日/カレンダー日付ピッカーを表示（dailynotes.out表示時のみ）
- **Notes: MD検索結果ジャンプ** — フル検索で.mdファイルの結果クリック時、親アウトラインを表示しサイドパネルで該当行にスクロール

### Fixed

- **Notes: ファイル切替時にアウトライナの検索・スコープ状態が残るバグを修正**
- **Notes: フル検索が間欠的に0件になるバグを修正**

## [0.195.514] - 2026-03-24

### Added

- **Notes: フル検索** — 全.out/.mdファイルを横断検索。Match Case/Whole Word/Regex対応。結果クリックでノードにジャンプ＋ハイライト
- **Notes: Daily Notes** — Todayボタンで今日のノードを自動作成（年→月→日階層）。`< >`ボタンで前日/翌日ナビゲーション
- **Notes: 左パネル幅リサイズ** — D&Dでパネル幅を変更可能。幅はoutline.noteに保存され次回復元
- **Notes: サイドパネル幅リサイズ** — D&Dでサイドパネル幅を変更可能。Outlinerでは.outに永続化、Markdownではセッション内のみ
- **Notes: outline.noteリネーム** — 管理ファイルを`.note`から`outline.note`に変更（自動マイグレーション付き）

## [0.195.513] - 2026-03-24

### Added

- **Notes: フォルダ/ツリー管理** — 左パネルで仮想フォルダを作成し、アウトラインをフォルダで分類・管理可能に。D&Dでファイルやフォルダの並び替え・移動が可能

### Fixed

- **Notes: ファイル切替時にアウトラインデータが消失するバグを修正** — 入力中にファイルを切り替えると未保存データが失われる問題を修正

## [0.195.509] - 2026-03-23

### Fixed

- **Notes: Outlinesヘッダーと検索バーの高さを統一** — 左パネルヘッダーと検索バーの数pxの高さズレを修正

## [0.195.506] - 2026-03-23

### Added

- **Notes機能（VSCode Activity Bar）** — Activity Barからフォルダを登録し、複数の.outアウトラインをまとめて管理できる新機能。左パネルでファイル一覧表示・追加・削除・リネーム・切替が可能。Electron版と同等の体験をVSCode上で実現

### Improved

- **Notes: 空フォルダ追加時にdefaultアウトラインを自動作成** — 空のフォルダを追加しても即座に編集開始可能
- **Notes: Set page directoryメニューを非表示** — Notes modeではpageDirが自動管理されるため手動設定を無効化
- **Notes: パネル閉じ時のUIレイアウト修正** — トグルボタンと検索モードボタンが重ならないよう調整

## [0.195.504] - 2026-03-23

### Improved

- **Outliner: スコープアウト時のカーソル位置改善** — Cmd+Shift+]やTOPリンクでスコープ解除した際、直前にスコープしていたノードにカーソルが移動するようになりました

## [0.195.502] - 2026-03-23

### Fixed

- **Outliner: ページディレクトリ設定が編集で消失するバグを修正** — outファイル個別に設定した `pageDir` が、ノード編集のたびに消えてしまう問題を修正しました

### Added

- **Outliner: メニューボタン** — 検索バー右端にメニューボタン（⋮）を追加。ページディレクトリの設定が可能です

## [0.195.500] - 2026-03-22

### Improved

- **Outliner: ページ解除でファイルをゴミ箱に移動** — ページ解除時に対応する `.md` ファイルをOSのゴミ箱に移動するようになりました。誤操作時はゴミ箱から復元できます

## [0.195.483] - 2026-03-22

### Fixed

- **Image paste/D&D paragraph separation** — Consecutive image pastes into empty paragraphs now create separate paragraphs instead of concatenating into one line

## [0.195.475] - 2026-03-22

### Changed

- **Internal: SidePanelManager shared class** — Extracted duplicated side panel logic (file watcher, save, link handling, TOC) from both editor and outliner providers into a single shared class

## [0.195.468] - 2026-03-21

### Added

- **Outliner: Breadcrumb navigation** — Shows ancestor chain above search bar when scoped; click any ancestor to re-scope, click TOP to return to full document
- **Outliner: Scope keyboard shortcuts** — Cmd+] to scope into focused node, Cmd+[ to clear scope
- **Outliner: Scope context menu** — Right-click "Scope" and "Clear Scope" options
- **Outliner: Tag click search** — Click a #tag or @tag on a non-focused node to auto-search
- **Outliner: 7 theme support** — github, sepia, night, dark, minimal, things, perplexity themes now applied to outliner
- **Outliner: i18n support** — 7 languages (en, ja, ko, es, fr, zh-cn, zh-tw) for all outliner UI strings
- **Outliner: Page directory setting** — `any-markdown.outlinerPageDir` setting + per-file override via mmd JSON `pageDir` field
- **Outliner: Page display constraints** — Pages opened from outliner have forced image directory and hidden addPage feature

### Fixed

- **Outliner: ESC clears scope** — ESC now only clears search, not scope
- **Outliner: Search clear resets scope** — Empty search or clearSearch no longer resets scope
- **Outliner: Scope becomes stale after node deletion** — Added safety checks on all 5 node deletion paths

## [0.195.466] - 2026-03-21

### Fixed

- **Markdown: Block pattern conversion fails with existing text** — Typing input patterns (##, [ ], -, 1., >) at the beginning of a line with existing text and pressing space now correctly converts the block

## [0.195.464] - 2026-03-21

### Fixed

- **Outliner: Cmd+B toggles VSCode sidebar** — Added stopPropagation to prevent Cmd+B/I/E/Shift+S from triggering VSCode shortcuts
- **Outliner: `**text*` incorrectly rendered as italic** — Fixed italic regex to not match `*` that is part of `**` bold markers
- **Outliner: Cursor jumps to end after inline formatting** — Fixed offset mismatch between rendered text and source text by separating editing mode (raw markers) and display mode (formatted)
- **Outliner: Enter splits text incorrectly with inline markers** — Same root cause as cursor jump; editing mode now uses source text offsets directly

## [0.195.463] - 2026-03-21

### Added

- **Outliner: Search mode toggle** — Toggle between Tree mode (shows ancestors to root) and Focus mode (shows matched node as top + children only)
- **Outliner: Inline formatting shortcuts** — Cmd+B (bold), Cmd+I (italic), Cmd+E (code), Cmd+Shift+S (strikethrough) for outliner text

## [0.195.449] - 2026-03-21

### Fixed

- **Outliner: Tag escape requires two spaces** — Fixed `#tag`/`@tag` requiring two Space presses to escape and insert a space (now works in one press)

## [0.195.435] - 2026-03-17

### Fixed

- Fixed code block Copy button losing line breaks when copying to clipboard

## [0.195.433] - 2026-03-16

### Fixed
- **Image in list item treated as empty** — Fixed Enter/Backspace on list items containing only images incorrectly treating them as empty (outdenting instead of creating new sibling).
- **Image paste misalignment in lists** — Fixed pasted images appearing visually offset from the bullet due to a trailing `<br>` element.
- **Image bullet disappears in lists** — Fixed list bullet (marker) disappearing for list items containing images due to `display: block` on images.

## [0.195.432] - 2026-03-15

### Fixed
- **Redo after immediate undo** — Fixed redo not working when undoing immediately after typing (before debounce timer fires).

## [0.195.420] - 2026-03-15

### Added
- **Side panel toolbar** — The side panel editor now has a full toolbar (undo/redo, formatting, block elements, insert) matching the main editor.

### Fixed
- **Undo/redo button state in side panel** — Undo/redo buttons in the side panel now correctly reflect the stack state.
- **Dead code cleanup** — Removed obsolete iframe-based side panel code (side-panel-host-bridge.js, getSidePanelHtml, generateSidePanelHtml).

## [0.195.416] - 2026-03-15

### Fixed
- **Side panel image path corruption** — Images inserted via D&D in the side panel no longer save with `vscode-resource` URI prefixes in the markdown.
- **Side panel Cmd+V paste** — Text and image paste now works correctly in the side panel editor.

## [0.195.411] - 2026-03-15

### Added
- **Electron: Welcome screen** — Opening the Electron app without a file now shows a welcome screen with Open File, Create New File, and Recent Files options.

### Fixed
- **Side panel image operations** — Image paste (Cmd+V), drag & drop, and toolbar image insert now work correctly in the side panel editor (both VSCode and Electron).
- **Side panel "Open in new tab" button** — The button now properly closes the side panel after opening the file in a new tab (both VSCode and Electron).
- **Electron: Side panel not opening** — Fixed packaged Electron app (DMG) missing `side-panel-host-bridge.js`, which prevented the side panel from loading.
- **Electron: Action Panel root directory issue** — Opening Electron without a file no longer causes Action Panel to operate on the root directory.

## [0.195.410] - 2026-03-14

### Added
- **Electron: Side Panel support** — Clicking `.md` links in the Electron desktop app now opens them in a Notion-style side panel with full WYSIWYG editing, external change detection, and in-panel navigation.
- **Electron: Action Panel support** — Cmd+N page creation with file search autocomplete now works in the Electron desktop app.
- **Electron: Smart link handling** — `.md` links open in side panel, HTTP links open in browser, anchor links scroll within document.

## [0.195.409] - 2026-03-13

### Added
- **Action Panel (Add Page)** — Cmd+N or command palette "Add Page" to quickly create and link new Markdown pages. Two modes: auto-create in pages/ folder, or specify a path with autocomplete.

### Fixed
- **Action Panel hover/keyboard conflict** — Mouse hover and keyboard arrow keys now share a single active selection instead of showing two highlights.
- **Action Panel click support** — Menu items, path input confirm, and link name confirm now work with mouse click (not just Enter).
- **Action Panel IME support** — IME composition Enter no longer prematurely confirms link name input.
- **New page h1** — New files use the link name as h1 heading (not the filename). Existing files are not modified.
- **Japanese localization** — Action panel menu items properly localized.

## [0.195.402] - 2026-03-13

### Fixed
- **Side panel overwrites external changes** — Fixed a bug where the side panel would overwrite external file modifications (e.g., from Claude Code) with stale content, even when the user hadn't edited in the side panel.

## [0.195.401] - 2026-03-13

### Fixed
- **Side panel external change detection** — Files opened in the side panel now reflect external changes in real-time, matching the main editor's behavior.

## [0.195.396] - 2026-03-06

### Added
- **Notion-style side panel** — Clicking a `.md` link opens a fully functional side panel with complete WYSIWYG editing (undo/redo, code blocks, Mermaid, Math, all keyboard shortcuts). Powered by iframe-based architecture for full editor isolation.
- **Link open mode setting** — `any-markdown.linkOpenMode`: `"sidePanel"` (default) for Notion-style peek, `"tab"` for new editor tab.
- **Cmd+Click always opens in new tab** — Hold Cmd (Mac) or Ctrl (Windows/Linux) while clicking a link to always open in a new tab, regardless of settings.
- **Side panel link navigation** — Links clicked inside the side panel navigate within the same panel.

## [0.195.393] - 2026-03-05

### Changed
- **Shared editor body HTML** — Sidebar, toolbar, editor, and search box HTML generation is now shared between VSCode and Electron via a single source module (`editor-body-html.js`). This ensures Electron always stays in sync with VSCode UI changes.

### Fixed
- **Electron sidebar** — Image directory settings UI (gear button, path display) now appears in the Electron sidebar, matching the VSCode version.

## [0.195.392] - 2026-03-05

### Changed
- **Toolbar fixed left/right layout** — Outline, undo, redo buttons are now fixed on the left; open-in-text-editor and source-mode buttons are fixed on the right. Only the markdown formatting buttons (inline, block, insert) scroll when the toolbar overflows.

## [0.195.388] - 2026-03-05

### Fixed
- **Perplexity/Things theme font size** — User font size setting now applies correctly to Perplexity and Things themes (previously hardcoded to 16px/15px). All element sizes (headings, code, tables, etc.) scale proportionally.

## [0.195.387] - 2026-03-04

### Added
- **Electron auto-update notification** — The desktop app now checks for new versions via GitHub Releases API (every 24 hours) and shows a notification dialog with a link to download.
- **"Check for Updates..." menu item** — Added to the Help menu for manual update checks.
- **GitHub Actions release automation** — Pushing an `electron-v*` tag automatically builds and publishes for macOS (arm64 + x64), Windows, and Linux.

### Changed
- **Unified versioning** — VSCode extension and Electron app now share the same version number.

## [0.195.386] - 2026-03-04

### Changed
- **Default theme** — Changed default theme from "GitHub" to "Things" for both VSCode and Electron.

## [0.195.385] - 2026-03-04

### Changed
- **Things theme** — Made sidebar border color subtler to better match outline background.

## [0.195.382] - 2026-03-04

### Changed
- **Outline panel design** — Refined border colors, removed header underline, increased padding for better readability.

### Fixed
- **Outline scroll stuck after click** — Clicking an outline heading no longer causes the editor to become unscrollable.

## [0.195.376] - 2026-03-04

### Added
- **Mermaid/Math toolbar & palette buttons** — Added dedicated toolbar buttons and command palette items for inserting Mermaid diagrams and Math blocks directly, without needing to type `` ```mermaid `` or `` ```math ``.

## [0.195.375] - 2026-03-04

### Fixed
- **Code block language change to mermaid/math** — Selecting "mermaid" or "math" from the code block language selector now correctly creates a clickable special wrapper that enters edit mode on click.

## [0.195.374] - 2026-03-04

### Changed
- **Toolbar default mode is now `simple`** — With the Action Palette (`Cmd+/`) available, the toolbar defaults to simple mode. Set `"any-markdown.toolbarMode": "full"` to restore the full toolbar.
- **Open in Text Editor shortcut changed** — `Cmd+,` / `Ctrl+,` → `Cmd+Shift+.` / `Ctrl+Shift+.` to avoid conflict with VS Code's Settings shortcut. Now paired with `Cmd+.` (Source Mode toggle).
- **README redesigned** — Added Important Changes section, fixed incorrect shortcut documentation, added emoji to section headings, updated screenshots.

## [0.195.368] - 2026-03-03

### Added
- **Simple Toolbar Mode** — New `any-markdown.toolbarMode` setting with `"full"` (default) and `"simple"` options. Simple mode shows only undo/redo and utility buttons (open text editor, source mode toggle) with a transparent background and no dividers. Use Cmd+/ (command palette) for other operations.

## [0.195.367] - 2026-03-03

### Fixed
- **ArrowUp skips wrapped lines in long paragraphs** — Fixed floating-point comparison in cursor line detection that caused wrapped lines to be skipped when pressing ↑
- **ArrowUp from below enters paragraph at first line instead of last line** — Fixed soft-wrapped paragraph navigation to correctly place cursor at the start of the last visual line

## [0.195.359] - 2026-03-03

### Changed
- **Keyboard shortcuts**: Toggle Source Mode changed to `Cmd+.` / `Ctrl+.`, Open in Text Editor changed to `Cmd+,` / `Ctrl+,`
- **Toolbar tooltips**: Shortcut keys now shown on hover for Source Mode and Text Editor buttons

## [0.195.358] - 2026-03-02

### Fixed
- **Nested list items lost or empty bullets remain after range-selecting and pressing Backspace** — Fixed by promoting nested list children to parent list before removing empty items, preserving child content without leaving empty bullets

## [0.195.356] - 2026-03-02

### Fixed
- **Empty bullets remain after range-selecting nested list items and pressing Backspace** — Fixed empty `<li>` elements (bullets) remaining in the DOM when selecting multiple list items and pressing Backspace

## [0.195.353] - 2026-03-01

### Fixed
- **Backspace on nested list item moves child items to wrong position** — Fixed child list items (c) incorrectly appearing below sibling items (d) after merging a nested item into its parent

## [0.195.352] - 2026-03-01

### Fixed
- **Shift+Tab on top-level list item moves item to wrong position** — Fixed paragraph ending up at the bottom of the list when pressing Shift+Tab on a middle list item; the paragraph now stays in its original visual position

## [0.195.351] - 2026-03-01

### Fixed
- **Code block language lost when pasting from Shiki-based sites** — Fixed code blocks losing language tags when pasting from sites using Shiki syntax highlighting (e.g. code.claude.com)

## [0.195.350] - 2026-03-01

### Fixed
- **Broken links when pasting HTML** — Fixed multi-line markdown links produced when pasting HTML containing block elements inside `<a>` tags (e.g. from Claude Code Docs)

## [0.195.349] - 2026-03-01

### Added
- **Keyboard shortcuts** — Toggle Source Mode (`Cmd+/` / `Ctrl+/`) and Open in Text Editor (`Cmd+.` / `Ctrl+.`)

## [0.195.348] - 2026-03-01

### Fixed
- **Placeholder not clearing on paste** — Fixed placeholder text remaining visible after pasting content (CMD+V) into an empty editor

## [0.195.345] - 2026-02-27

### Fixed
- **Perplexity theme syntax highlighting** — Fixed code block keywords (function, const, etc.) being invisible due to highlight colors too similar to base text color

## [0.195.342] - 2026-02-27

### Fixed
- **Empty editor placeholder** — Fixed placeholder text ("Start typing...") not showing when opening a new or empty markdown file

## [0.195.341] - 2026-02-27

### Fixed
- **Blockquote backspace line splitting** — Fixed issue where pressing Backspace at the start of a multi-line blockquote produced a single paragraph with embedded newlines instead of separate paragraphs for each line
- **Code block backspace at start** — Fixed issue where pressing Backspace at the start of a non-empty code block could delete the element above it

## [0.195.340] - 2026-02-27

### Fixed
- **Tab indent with mixed nested lists** — Fixed issue where Tab indent changed visual line order when the previous sibling had multiple nested lists of different types (e.g., `<ul>` + `<ol>`)

## [0.195.336] - 2026-02-27

### Changed
- **Perplexity theme typography** — Optimized font sizes (p/li 16px, code/blockquote/table 14px, headings proportional from h3=18px), reduced margins/line-height for higher content density, added text underline decoration to h2

## [0.195.335] - 2026-02-27

### Added
- **Multi-line Tab/Shift+Tab in code blocks** — Select multiple lines with Shift+Arrow and press Tab/Shift+Tab to indent/dedent all selected lines at once
- **Multi-line Tab/Shift+Tab in blockquotes** — Same multi-line indent/dedent support in blockquote blocks

## [0.195.334] - 2026-02-27

### Added
- **Undo/Redo** — `Cmd+Z` / `Cmd+Shift+Z` with snapshot-based undo system (200-entry stack, toolbar buttons)
- **KaTeX Math blocks** — `\`\`\`math` code blocks render LaTeX equations via KaTeX (each line independent, 500ms debounce re-render, error display)
- **Perplexity theme** — Light theme with Perplexity brand colors
- **Multi-block Tab/Shift+Tab** — Select multiple paragraphs and indent/dedent them all at once
- **Code block Shift+Tab** — Dedent (remove up to 4 leading spaces) inside code blocks
- **List type in-place conversion** — Type a different list pattern at line start (e.g., `1. ` in a `- ` list) to convert between unordered, ordered, and task lists (6-way)
- **Cross-list Tab indent** — Tab at first item of a list indents into the last item of an adjacent list above
- **Smart URL paste** — Select text and paste a URL to create `[selected text](URL)` link
- **Code block expand button** — Open code block content in a separate VS Code editor tab with language support
- **Cmd+L source navigation** — Select text in WYSIWYG editor, press `Cmd+L` to open the source file with exact lines selected
- **External file change sync** — Block-level DOM diff preserves cursor position; toast notification for reload confirmation
- **Toolbar scroll navigation** — `<` `>` buttons for horizontal toolbar scrolling when overflowing
- **Toolbar icon buttons** — Toolbar buttons now use icons instead of text
- **Export to PDF** command

### Changed
- Sync architecture rewritten with block-level DOM diff and edit state machine (idle/user-editing/external-updating)
- Cursor restoration uses text-based block identification for better accuracy
- Arrow key navigation between elements unified via `navigateToAdjacentElement()` function
- Mermaid/Math blocks share common helper functions (`isSpecialWrapper`, `enterSpecialWrapperEditMode`, `exitSpecialWrapperDisplayMode`)

### Fixed
- Windows `\r\n` line endings now handled correctly
- Numerous arrow key navigation fixes across all element types
- Code block trailing empty line display in display mode
- Mixed nested list Backspace merge and Shift+Tab behavior
- Toolbar buttons now correctly apply formatting at cursor position (Selection save/restore)
- Browser `<div>` generation prevented (uses `<p>` separator)
- Shift+Arrow key range selection no longer blocked by navigation code

## [0.195.186] - 2026-02-17

### Fixed
- Inline code conversion order - `**text**` inside backticks now correctly renders as code instead of bold
- Inline code processing now happens before bold/italic/strikethrough to prevent unwanted formatting

## [0.195.176] - 2026-02-16

### Fixed
- Horizontal rule backspace behavior - empty paragraph after HR now deletes correctly
- Pattern conversion list merge - lists created with `- ` + Space now auto-merge with adjacent lists

## [0.195.162] - 2026-02-15

### Fixed
- Tab/Shift+Tab cursor restoration in nested lists
- List merge behavior - lists now merge at the same level instead of nesting
- Triple-click selection in list items

### Changed
- Improved backspace handling for empty list items with nested content

## [0.195.141] - 2026-02-14

### Fixed
- Backspace in nested lists now correctly moves cursor to the visually previous line
- Deep nested list cursor positioning after merge operations

## [0.195.130] - 2026-02-13

### Added
- Mermaid diagram theme support for dark/night themes
- Diagrams now respect editor theme settings

## [0.195.0] - 2026-02-01

### Added
- Initial public release
- WYSIWYG markdown editing with live preview
- Support for headers, lists, tables, code blocks, blockquotes
- Mermaid diagram rendering
- Multiple themes (github, sepia, night, dark, minimal)
- Multi-language support (en, ja, zh-cn, zh-tw, ko, es, fr)
- Image paste and drag-and-drop support
- Configurable image save directory
- Keyboard shortcuts for common formatting
- Table of contents generation
- Source mode toggle
