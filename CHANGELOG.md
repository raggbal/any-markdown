# Changelog

All notable changes to the "Any Markdown Editor" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
