# Changelog

All notable changes to the "Any Markdown Editor" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
