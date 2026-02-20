<img src="media/icon.png" alt="Any Markdown" width="48" align="absmiddle"> Any Markdown - WYSIWYG Markdown Editor for VS Code
=

A seamless WYSIWYG markdown editor for VS Code inspired by Typora, Notion, and Obsidian. Experience smooth markdown editing with live preview - what you see is what you get!

![VS Code Markdown Editor](https://img.shields.io/badge/VS%20Code-Markdown-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### Seamless Live Preview
- **WYSIWYG Editing** - Edit markdown in a beautifully rendered view
- **No Split Windows** - Everything in one unified editor
- **Source Mode Toggle** - Switch between WYSIWYG and raw markdown with one click

### Rich Markdown Support
- Headers (H1-H6) with outline navigation
- Text formatting (Bold, Italic, Strikethrough)
- Lists (Ordered, Unordered, Task Lists with checkboxes)
- Tables with column resize and alignment
- Code blocks with syntax highlighting
- Blockquotes
- Horizontal rules
- Links and Images (drag & drop, paste support)
- Mermaid diagrams
- YAML Front Matter


---

## Installation

### From VSIX
```bash
code --install-extension any-markdown-{version}.vsix
```

### From Source
```bash
git clone https://github.com/raggbal/any-markdown
cd any-markdown
npm install
npm run compile
# Press F5 to launch in debug mode
```

---

## Usage

1. Open any `.md` or `.markdown` file
2. Right-click and select **"Open with Any Markdown Editor"**
3. Or use Command Palette: `Any Markdown: Open with Any Markdown Editor`

---

## Creating Markdown Elements

### Block Elements

| Element | Pattern Input | Toolbar | Shortcut |
| --- | --- | --- | --- |
| Heading 1 | `# ` + Space | Heading menu → H1 | `Ctrl+1` |
| Heading 2 | `## ` + Space | Heading menu → H2 | `Ctrl+2` |
| Heading 3 | `### ` + Space | Heading menu → H3 | `Ctrl+3` |
| Heading 4 | `#### ` + Space | Heading menu → H4 | `Ctrl+4` |
| Heading 5 | `##### ` + Space | Heading menu → H5 | `Ctrl+5` |
| Heading 6 | `###### ` + Space | Heading menu → H6 | `Ctrl+6` |
| Paragraph | (default)<br> | — | `Ctrl+0` |
| Unordered List | `- ` or `* ` + Space | List button | `Ctrl+Shift+U` |
| Ordered List | `1. ` + Space | Numbered list button | `Ctrl+Shift+O` |
| Task List | `- [ ] ` + Space | Task list button | `Ctrl+Shift+X` |
| Blockquote | `> ` + Space | Quote button | `Ctrl+Shift+Q` |
| Code Block | ````` ``` ````` + Enter | Code button | `Ctrl+Shift+K` |
| Table | `| col1 | col2 |` + Enter | Table button | `Ctrl+T` |
| Horizontal Rule | `---` + Enter | HR button | `Ctrl+Shift+-` |


### Inline Elements

| Element | Pattern Input | Toolbar | Shortcut |
| --- | --- | --- | --- |
| Bold | `**text**` + Space | Bold button | `Ctrl+B` |
| Italic | `*text*` + Space | Italic button | `Ctrl+I` |
| Strikethrough | `~~text~~` + Space | Strikethrough button | `Ctrl+Shift+S` |
| Inline Code | ``` `text` ``` + Space | Code button | ``` Ctrl+` ``` |
| Link | `[text](url)` <br>Space conversion not supported<br> | Link button | `Ctrl+K` |
| Image | `![text](url)` <br>Space conversion not supported<br> | Image button | `Ctrl+Shift+I` |


---

## Special Operations

### General Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + B` | Bold |
| `Ctrl/Cmd + I` | Italic |
| `Ctrl/Cmd + K` | Insert link |
| `Ctrl/Cmd + F` | Find |
| `Ctrl/Cmd + H` | Find and replace |

### Escaping Block Elements

| Element | Key | Action |
| --- | --- | --- |
| Code Block | `Shift+Enter` | Exit code block and create new paragraph |
| Blockquote | `Shift+Enter` | Exit blockquote and create new paragraph |
| Code Block | `↑` at first line | Exit to previous element |
| Code Block | `↓` at last line | Exit to next element |
| Blockquote | `↑` at first line | Exit to previous element |
| Blockquote | `↓` at last line | Exit to next element |

### Escaping Inline Elements

To exit inline formatting, type the closing marker followed by Space:

| Element | Input | Action |
| --- | --- | --- |
| Bold | `**` + Space | Close bold and move cursor outside |
| Italic | `*` + Space | Close italic and move cursor outside |
| Strikethrough | `~~` + Space | Close strikethrough and move cursor outside |
| Inline Code | ``` ` ``` + Space | Close inline code and move cursor outside |

### Table Operations

| Key | Action |
| --- | --- |
| `Tab` | Move to next cell |
| `Shift+Tab` | Move to previous cell |
| `Enter` | Insert new row |
| `Shift+Enter` | Insert line break within cell |
| `↑` / `↓` | Navigate between rows |
| `←` / `→` | Navigate within/between cells |
| `Cmd+A` | Select all text in current cell |

### List Operations

| Key | Action |
| --- | --- |
| `Tab` | Indent list item (increase nesting) |
| `Shift+Tab` | Outdent list item (decrease nesting) |
| `Enter` on empty item | Convert to paragraph or decrease nesting |
| `Backspace` at start | Convert to paragraph |

---

## Code Block Features

### Supported Languages

The editor supports syntax highlighting for the following languages:

`javascript`, `typescript`, `python`, `json`, `bash`, `shell`, `css`, `html`, `xml`, `sql`, `java`, `go`, `rust`, `yaml`, `markdown`, `c`, `cpp`, `csharp`, `php`, `ruby`, `swift`, `kotlin`, `dockerfile`, `plaintext`

**Language Aliases:** `js`→javascript, `ts`→typescript, `py`→python, `sh`→bash, `yml`→yaml, `md`→markdown, `c++`→cpp, `c#`→csharp

### Display Mode / Edit Mode

- **Display Mode**: Shows syntax-highlighted code with language tag and copy button
- **Edit Mode**: Plain text editing (click on code block to enter)
- **Expand Button**: Open code in a separate VS Code editor tab for larger editing

### Mermaid Diagrams

Code blocks with language `mermaid` are rendered as diagrams:

```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]
```

- Click on diagram to edit source
- Diagram re-renders when exiting edit mode

---

## Image Path Configuration

Images can be saved to custom directories when pasting or drag-and-dropping.

### Configuration Levels

| Level | Setting File | Description |
| --- | --- | --- |
| **Global** | `~/Library/Application Support/Code/User/settings.json` (macOS)<br>`%APPDATA%\Code\User\settings.json` (Windows)<br>`~/.config/Code/User/settings.json` (Linux) | VS Code user settings |
| **Project** | `.vscode/settings.json` | Project-level override |
| **File** | Per-file directive | Per-file override in markdown footer |

### VS Code settings.json Setting

```json
{
  "any-markdown.imageDefaultDir": "./images",
  "any-markdown.forceRelativeImagePath": true
}
```

### Per-File Directive

Add at the end of your markdown file:

```markdown
---
IMAGE_DIR: ./assets/images
FORCE_RELATIVE_PATH: true
```

### Path Behavior Matrix

`forceRelativeImagePath` allows you to separate the **image save location** from the **path written in Markdown**.

**Use case**: When you want to save images to a specific absolute path (e.g., `/Users/shared/images/`) but reference them using relative paths from the Markdown file, set this to `true`.

> **Note**: `forceRelativeImagePath` only takes effect when `imageDefaultDir` is an absolute path. When using relative paths, the setting is ignored as paths are always relative.

| imageDefaultDir | forceRelativeImagePath | Image Save Location | Path in Markdown |
| --- | --- | --- | --- |
| Absolute (e.g., `/Users/shared/images`) | `false` (default) | Specified absolute path | Absolute path |
| Absolute (e.g., `/Users/shared/images`) | `true` | Specified absolute path | Relative path from Markdown file |
| Relative (e.g., `./images`) | `false` | Relative to Markdown file | Relative path |
| Relative (e.g., `./images`) | `true` | Relative to Markdown file | Relative path (setting ignored) |

---

## Configuration

### VS Code Settings

| Setting | Description | Default |
| --- | --- | --- |
| `any-markdown.theme` | Editor theme (`github`, `sepia`, `night`, `dark`, `minimal`) | `github` |
| `any-markdown.fontSize` | Base font size (px) | `16` |
| `any-markdown.imageDefaultDir` | Default directory for saved images | `""` (same as markdown file) |
| `any-markdown.forceRelativeImagePath` | Force relative paths for images | `false` |
| `any-markdown.language` | UI language (`auto`, `en`, `ja`, `zh-cn`, `zh-tw`, `ko`, `es`, `fr`) | `auto` |
| `any-markdown.enableDebugLogging` | Enable debug logging in browser console | `false` |

### Themes

| Theme | Description |
| --- | --- |
| `github` | Clean GitHub-style rendering (default) |
| `sepia` | Warm, paper-like appearance for comfortable reading |
| `night` | Dark theme with Tokyo Night inspired colors (blue tint) |
| `dark` | Pure dark theme with neutral black/gray colors |
| `minimal` | Distraction-free black and white design |

---

## Supported Languages (i18n)

The editor UI supports the following languages:

| Language | Code |
| --- | --- |
| English | `en` (default) |
| Japanese | `ja` |
| Simplified Chinese | `zh-cn` |
| Traditional Chinese | `zh-tw` |
| Korean | `ko` |
| Spanish | `es` |
| French | `fr` |

Set via `any-markdown.language` or use `auto` to follow VS Code's display language.

---

## Commands

Available in Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
| --- | --- |
| `Any MD: Open with Any Markdown Editor` | Open markdown file in WYSIWYG editor |
| `Any MD: Insert Table` | Insert a new table |
| `Any MD: Insert TOC` | Insert table of contents |
| `Any MD: Open as Text` | Open in standard text editor |
| `Any MD: Compare as Text` | Compare with text version |

---

## External File Changes

When another tool (e.g., AI coding assistants like Claude Code, Cursor, etc.) modifies the same markdown file while you have it open in Any Markdown:

- **While the editor has focus**: External changes are **not reflected** in the editor. This is by design to prevent cursor jumps and editing disruptions.
- **After losing focus** (clicking outside the editor): External changes are **automatically reloaded** into the editor.
- **Important**: If you are editing in the WYSIWYG editor while an external tool modifies the same file, **your in-progress edits may be lost** when focus is removed, as the editor reloads the externally modified version. To avoid this, save your work before switching to another tool that modifies the same file.

---

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test

# Package extension
vsce package --no-dependencies
```

---

## Support This Project

If you find this extension useful, please consider:

- **Star** this repository on GitHub
- **Report issues** or suggest features
- **Contribute** with pull requests
- **Sponsor** the development

Your support helps keep this project maintained and improved!

---

## License

MIT License - feel free to use this extension in your projects.

---

## Acknowledgments

- Inspired by [Typora](https://typora.io/), [Notion](https://notion.so/), and [Obsidian](https://obsidian.md/)
- Built with love for the VS Code community
