'use strict';

/**
 * VSCode / Electron 共通のエディタボディHTML生成
 *
 * @param {Record<string, string>} messages - i18n メッセージ
 * @param {string} platform - process.platform ('darwin' | 'win32' | 'linux')
 * @returns {string} <div class="container">...</div> の HTML文字列
 */
function generateEditorBodyHtml(messages, platform) {
    const msg = messages || {};
    const m = (key) => msg[key] || '';
    const mod = platform === 'darwin' ? 'Cmd' : 'Ctrl';

    return `<div class="container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h3>Outline</h3>
                <button class="sidebar-toggle" id="closeSidebar" title="${m('closeOutline')}">&#9776;</button>
            </div>
            <nav class="outline" id="outline"></nav>
            <div class="sidebar-footer">
                <div class="word-count" id="wordCount"></div>
                <div class="sidebar-status-imagedir" id="statusImageDir">
                    <div class="imagedir-header">
                        <span class="imagedir-label">${m('imageDirLabel')}</span>
                        <span class="imagedir-source" id="imageDirSource"></span>
                        <button class="imagedir-settings-btn" id="imageDirSettingsBtn" title="${m('setImageDir')}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </div>
                    <div class="imagedir-info">
                        <span class="imagedir-path" id="imageDirPath"></span>
                    </div>
                </div>
            </div>
            <div class="sidebar-resizer" id="sidebarResizer"></div>
        </aside>
        <main class="editor-container">
            <div class="toolbar" id="toolbar">
                <div class="toolbar-fixed toolbar-fixed--left">
                    <button data-action="openOutline" class="menu-btn hidden" id="openSidebarBtn" title="${m('openOutline')}"></button>
                    <div class="toolbar-group" data-group="history">
                        <button data-action="undo" title="${m('undo')}"></button>
                        <button data-action="redo" title="${m('redo')}"></button>
                    </div>
                </div>
                <button class="toolbar-scroll-btn toolbar-scroll-btn--left hidden" id="toolbarScrollLeft">&#x276E;</button>
                <div class="toolbar-inner" id="toolbarInner">
                    <div class="toolbar-group" data-group="inline">
                        <button data-action="bold" title="${m('bold')}"></button>
                        <button data-action="italic" title="${m('italic')}"></button>
                        <button data-action="strikethrough" title="${m('strikethrough')}"></button>
                        <button data-action="code" title="${m('inlineCode')}"></button>
                    </div>
                    <div class="toolbar-group" data-group="block">
                        <button data-action="heading1" title="${m('heading1')}"></button>
                        <button data-action="heading2" title="${m('heading2')}"></button>
                        <button data-action="heading3" title="${m('heading3')}"></button>
                        <button data-action="heading4" title="${m('heading4')}"></button>
                        <button data-action="heading5" title="${m('heading5')}"></button>
                        <button data-action="heading6" title="${m('heading6')}"></button>
                        <button data-action="ul" title="${m('unorderedList')}"></button>
                        <button data-action="ol" title="${m('orderedList')}"></button>
                        <button data-action="task" title="${m('taskList')}"></button>
                        <button data-action="quote" title="${m('blockquote')}"></button>
                        <button data-action="codeblock" title="${m('codeBlock')}"></button>
                        <button data-action="mermaid" title="${m('mermaidBlock')}"></button>
                        <button data-action="math" title="${m('mathBlock')}"></button>
                        <button data-action="hr" title="${m('horizontalRule')}"></button>
                    </div>
                    <div class="toolbar-group" data-group="insert">
                        <button data-action="link" title="${m('insertLink')}"></button>
                        <button data-action="image" title="${m('insertImage')}"></button>
                        <button data-action="table" title="${m('insertTable')}"></button>
                    </div>
                </div>
                <button class="toolbar-scroll-btn toolbar-scroll-btn--right hidden" id="toolbarScrollRight">&#x276F;</button>
                <div class="toolbar-fixed toolbar-fixed--right">
                    <div class="toolbar-group" data-group="utility">
                        <button data-action="openInTextEditor" title="${m('openInTextEditor')} (${mod}+Shift+.)"></button>
                        <button data-action="source" title="${m('toggleSourceMode')} (${mod}+.)"></button>
                    </div>
                </div>
            </div>
            <div class="editor-wrapper" id="editorWrapper">
                <div class="search-replace-box" id="searchReplaceBox" style="display: none;">
                    <div class="search-row">
                        <input type="text" class="search-input" id="searchInput" placeholder="${m('searchPlaceholder')}" />
                        <span class="search-count" id="searchCount">0/0</span>
                        <button class="search-prev" id="searchPrev" title="${m('searchPrev')}">&#9650;</button>
                        <button class="search-next" id="searchNext" title="${m('searchNext')}">&#9660;</button>
                        <button class="toggle-replace" id="toggleReplace" title="${m('toggleReplace')}">&#8693;</button>
                        <button class="close-search" id="closeSearch" title="${m('closeSearch')}">&#10005;</button>
                    </div>
                    <div class="replace-row" id="replaceRow" style="display: none;">
                        <input type="text" class="replace-input" id="replaceInput" placeholder="${m('replacePlaceholder')}" />
                        <button class="replace-one" id="replaceOne" title="${m('replace')}">${m('replace')}</button>
                        <button class="replace-all" id="replaceAll" title="${m('replaceAll')}">${m('replaceAll')}</button>
                    </div>
                    <div class="search-options">
                        <label><input type="checkbox" class="search-case-sensitive" id="searchCaseSensitive" /> ${m('caseSensitive')}</label>
                        <label><input type="checkbox" class="search-whole-word" id="searchWholeWord" /> ${m('wholeWord')}</label>
                        <label><input type="checkbox" class="search-regex" id="searchRegex" /> ${m('regex')}</label>
                    </div>
                </div>
                <div class="editor" id="editor" contenteditable="true" spellcheck="true"></div>
                <textarea class="source-editor" id="sourceEditor" style="display: none;"></textarea>
            </div>
            <div class="side-panel" id="sidePanel">
                <div class="side-panel-resize-handle" id="sidePanelResizeHandle"></div>
                <aside class="side-panel-sidebar" id="sidePanelSidebar">
                    <div class="sidebar-header">
                        <h3>Outline</h3>
                        <button class="sidebar-toggle" id="sidePanelSidebarClose" title="${m('closeOutline')}">&#9776;</button>
                    </div>
                    <nav class="side-panel-toc" id="sidePanelToc"></nav>
                    <div class="side-panel-toc-footer">
                        <div class="side-panel-imagedir" id="sidePanelImageDir">
                            <div class="imagedir-header">
                                <span class="imagedir-label">${m('imageDirLabel')}</span>
                                <span class="imagedir-source" id="sidePanelImageDirSource"></span>
                                <button class="imagedir-settings-btn" id="sidePanelImageDirBtn" title="${m('setImageDir')}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                            </div>
                            <div class="imagedir-info">
                                <span class="imagedir-path" id="sidePanelImageDirPath"></span>
                            </div>
                        </div>
                    </div>
                </aside>
                <div class="side-panel-editor-container">
                    <div class="side-panel-header">
                        <button class="menu-btn side-panel-outline-btn" id="sidePanelOpenOutline" title="${m('openOutline')}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
                        </button>
                        <span class="side-panel-filename" id="sidePanelFilename"></span>
                        <div class="side-panel-header-actions">
                            <button class="side-panel-header-btn" data-action="undo" title="Undo"></button>
                            <button class="side-panel-header-btn" data-action="redo" title="Redo"></button>
                            <button class="side-panel-header-btn" data-action="source" title="Source mode"></button>
                        </div>
                        <button class="side-panel-copy-path" id="sidePanelCopyPath" title="Copy file path">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="side-panel-open-tab" id="sidePanelOpenTab" title="Open in new tab">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </button>
                        <button class="side-panel-expand" id="sidePanelExpand" title="Expand">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                        </button>
                        <button class="side-panel-close" id="sidePanelClose" title="Close">&times;</button>
                    </div>
                    <div class="side-panel-iframe-container" id="sidePanelIframeContainer"></div>
                </div>
            </div>
            <div class="side-panel-overlay" id="sidePanelOverlay"></div>
        </main>
    </div>`;
}

module.exports = { generateEditorBodyHtml };
