/**
 * editor-utils.js — Pure functions and constants shared across EditorInstance(s).
 * No DOM dependencies, no closure state. Loaded before editor.js.
 */
(function() {
    'use strict';

    // ===== Lucide Icons (inline SVG) =====
    const LUCIDE_ICONS = {
        'undo': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
        'redo': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>',
        'bold': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>',
        'italic': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>',
        'strikethrough': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/></svg>',
        'code': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>',
        'heading1': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/></svg>',
        'heading2': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>',
        'heading3': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/></svg>',
        'heading4': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18V6"/><path d="M17 10v3a1 1 0 0 0 1 1h3"/><path d="M21 10v8"/><path d="M4 12h8"/><path d="M4 18V6"/></svg>',
        'heading5': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 13v-3h4"/><path d="M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17"/></svg>',
        'heading6': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><circle cx="19" cy="16" r="2"/><path d="M20 10c-2 2-3 3.5-3 6"/></svg>',
        'ul': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/></svg>',
        'ol': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5h10"/><path d="M11 12h10"/><path d="M11 19h10"/><path d="M4 4h1v5"/><path d="M4 9h2"/><path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/></svg>',
        'task': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/></svg>',
        'quote': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>',
        'codeblock': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 9-3 3 3 3"/><path d="m14 15 3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
        'hr': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
        'mermaid': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="18" r="3"/><path d="M12 2v4"/><path d="M6.8 15.2 12 6l5.2 9.2"/></svg>',
        'math': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 7V4H6l6 8-6 8h12v-3"/></svg>',
        'link': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
        'image': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
        'imageDir': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
        'table': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>',
        'openOutline': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>',
        'openInTextEditor': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/></svg>',
        'source': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/></svg>',
        'add-col-left': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="13" x="3" y="8" rx="1"/><path d="m15 2-3 3-3-3"/><rect width="7" height="13" x="14" y="8" rx="1"/></svg>',
        'add-col-right': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="13" x="3" y="3" rx="1"/><path d="m9 22 3-3 3 3"/><rect width="7" height="13" x="14" y="3" rx="1"/></svg>',
        'del-col': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        'add-row-above': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="7" x="8" y="3" rx="1"/><path d="m2 9 3 3-3 3"/><rect width="13" height="7" x="8" y="14" rx="1"/></svg>',
        'add-row-below': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="7" x="3" y="3" rx="1"/><path d="m22 15-3-3 3-3"/><rect width="13" height="7" x="3" y="14" rx="1"/></svg>',
        'del-row': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        'align-left': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3"/><path d="M15 12H3"/><path d="M17 19H3"/></svg>',
        'align-center': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3"/><path d="M17 12H7"/><path d="M19 19H5"/></svg>',
        'align-right': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3"/><path d="M21 12H9"/><path d="M21 19H7"/></svg>',
    };

    // ===== Language Constants =====
    const SUPPORTED_LANGUAGES = [
        'mermaid', 'math',
        'javascript', 'typescript', 'python', 'json', 'bash', 'shell', 'css', 'html', 'xml',
        'sql', 'java', 'go', 'rust', 'yaml', 'markdown', 'c', 'cpp', 'csharp', 'php',
        'ruby', 'swift', 'kotlin', 'dockerfile', 'plaintext'
    ];

    const LANGUAGE_ALIASES = {
        'js': 'javascript', 'ts': 'typescript', 'py': 'python', 'sh': 'bash', 'zsh': 'bash',
        'htm': 'html', 'yml': 'yaml', 'md': 'markdown', 'c++': 'cpp', 'c#': 'csharp',
        'cs': 'csharp', 'rb': 'ruby', 'docker': 'dockerfile', 'text': 'plaintext', 'txt': 'plaintext'
    };

    // ===== Pre-compiled Regex Patterns =====
    const REGEX = {
        heading: /^(#{1,6}) (.*)$/,
        hr: /^(---|\*\*\*|___)$/,
        task: /^(\s*)[-*+] \[([ xX])\] (.*)$/,
        ul: /^(\s*)[-*+] (.*)$/,
        ol: /^(\s*)(\d+)\. (.*)$/,
        quote: /^> (.*)$/,
        codeBlock: /^(\`{3,}|~{3,})(.*)$/,
        brTag: /&lt;br&gt;/gi,
        image: /!\[([^\]]*)\]\(([^)]+)\)/g,
        link: /\[([^\]]+)\]\(([^)]+)\)/g,
        boldItalicAsterisk: /\*\*\*(.+?)\*\*\*/g,
        boldItalicUnderscore: /(^|[^\w])___([^_]+)___([^\w]|$)/g,
        boldAsterisk: /\*\*(.+?)\*\*/g,
        boldUnderscore: /(^|[^\w])__([^_]+)__([^\w]|$)/g,
        italicAsterisk: /\*(.+?)\*/g,
        italicUnderscore: /(^|[^\w])_([^_]+)_([^\w]|$)/g,
        strikethrough: /~~(.+?)~~/g,
        inlineCode: /\`([^\`]+)\`/g
    };

    // ===== Pure Functions =====

    function escapeHtml(text) {
        const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
        return text.replace(/[&<>]/g, char => escapeMap[char]);
    }

    function normalizeBlockHtml(html) {
        return html
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .replace(/\s*contenteditable="[^"]*"/g, '')
            .trim();
    }

    // Parse inline code spans according to CommonMark spec
    function parseInlineCode(text, placeholders, getNextIndex) {
        var result = '';
        var i = 0;

        while (i < text.length) {
            if (text[i] === '`') {
                var openStart = i;
                while (i < text.length && text[i] === '`') { i++; }
                var openLen = i - openStart;

                var contentStart = i;
                var found = false;

                while (i < text.length) {
                    if (text[i] === '`') {
                        var closeStart = i;
                        while (i < text.length && text[i] === '`') { i++; }
                        var closeLen = i - closeStart;

                        if (closeLen === openLen) {
                            var content = text.substring(contentStart, closeStart);
                            if (content.startsWith(' ') && content.endsWith(' ') && content.length > 1) {
                                content = content.slice(1, -1);
                            }
                            var codeHtml = '<code>' + content + '</code>';
                            var placeholder = '\x00CODE' + getNextIndex() + '\x00';
                            placeholders.push({ placeholder: placeholder, html: codeHtml });
                            result += placeholder;
                            found = true;
                            break;
                        }
                    } else {
                        i++;
                    }
                }

                if (!found) {
                    result += text.substring(openStart, i);
                }
            } else {
                result += text[i];
                i++;
            }
        }

        return result;
    }

    function getCodeFence(content) {
        var backtickMatches = content.match(/\`+/g);
        var maxBackticks = 0;
        if (backtickMatches) {
            for (var k = 0; k < backtickMatches.length; k++) {
                if (backtickMatches[k].length > maxBackticks) {
                    maxBackticks = backtickMatches[k].length;
                }
            }
        }
        var fenceLength = Math.max(3, maxBackticks + 1);
        return '\`'.repeat(fenceLength);
    }

    function wrapInlineCode(content) {
        var backtickMatches = content.match(/`+/g);
        var maxBackticks = 0;
        if (backtickMatches) {
            for (var k = 0; k < backtickMatches.length; k++) {
                if (backtickMatches[k].length > maxBackticks) {
                    maxBackticks = backtickMatches[k].length;
                }
            }
        }

        if (maxBackticks === 0) {
            return '`' + content + '`';
        }

        var fence = '`'.repeat(maxBackticks + 2);
        return fence + ' ' + content + ' ' + fence;
    }

    // Strip vscode-resource URI prefix from image paths
    function cleanImageSrc(src) {
        if (!src) return '';
        src = src.replace(/^https:\/\/file\+\.vscode-resource\.vscode-cdn\.net/, '');
        src = src.replace(/^https:\/\/file%2B\.vscode-resource\.vscode-cdn\.net/, '');
        if (src.startsWith('data:')) return '';
        return src;
    }

    function getHighlightPatterns(lang) {
        var patterns = [];

        var addCommon = function() {
            patterns.push({ regex: /"(?:[^"\\]|\\.)*"/g, className: 'hljs-string' });
            patterns.push({ regex: /'(?:[^'\\]|\\.)*'/g, className: 'hljs-string' });
            patterns.push({ regex: /\b\d+(\.\d+)?\b/g, className: 'hljs-number' });
        };

        switch (lang) {
            case 'javascript':
            case 'typescript':
                patterns.push({ regex: /\/\/.*$/gm, className: 'hljs-comment' });
                patterns.push({ regex: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /`(?:[^`\\]|\\.)*`/g, className: 'hljs-string' });
                patterns.push({ regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false)\b/g, className: 'hljs-keyword' });
                patterns.push({ regex: /\b(console|document|window|Array|Object|String|Number|Boolean|Promise|Map|Set|JSON|Math|Date|RegExp|Error)\b/g, className: 'hljs-built_in' });
                break;
            case 'python':
                patterns.push({ regex: /#.*$/gm, className: 'hljs-comment' });
                patterns.push({ regex: /"""[\s\S]*?"""/g, className: 'hljs-string' });
                patterns.push({ regex: /'''[\s\S]*?'''/g, className: 'hljs-string' });
                addCommon();
                patterns.push({ regex: /\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|True|False|None|and|or|not|in|is)\b/g, className: 'hljs-keyword' });
                patterns.push({ regex: /\b(print|len|range|str|int|float|list|dict|set|tuple|bool|type|isinstance|hasattr|getattr|setattr|open|input|super|self)\b/g, className: 'hljs-built_in' });
                break;
            case 'json':
                addCommon();
                patterns.push({ regex: /"[^"]*"(?=\s*:)/g, className: 'hljs-attr' });
                patterns.push({ regex: /\b(true|false|null)\b/g, className: 'hljs-literal' });
                break;
            case 'bash':
            case 'shell':
                patterns.push({ regex: /#.*$/gm, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|cd|ls|rm|cp|mv|mkdir|chmod|chown|grep|sed|awk|cat|head|tail|find|xargs|export|source|alias)\b/g, className: 'hljs-keyword' });
                patterns.push({ regex: /\$[a-zA-Z_][a-zA-Z0-9_]*/g, className: 'hljs-built_in' });
                patterns.push({ regex: /\$\{[^}]+\}/g, className: 'hljs-built_in' });
                break;
            case 'css':
                patterns.push({ regex: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /[.#][a-zA-Z_][a-zA-Z0-9_-]*/g, className: 'hljs-selector' });
                patterns.push({ regex: /[a-z-]+(?=\s*:)/g, className: 'hljs-property' });
                patterns.push({ regex: /@[a-z-]+/g, className: 'hljs-keyword' });
                break;
            case 'html':
            case 'xml':
                patterns.push({ regex: /<!--[\s\S]*?-->/g, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /&lt;\/?[a-zA-Z][a-zA-Z0-9]*(?=[\s&gt;])/g, className: 'hljs-tag' });
                patterns.push({ regex: /[a-zA-Z-]+(?==)/g, className: 'hljs-attr' });
                break;
            case 'sql':
                patterns.push({ regex: /--.*$/gm, className: 'hljs-comment' });
                patterns.push({ regex: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ORDER|BY|GROUP|HAVING|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|NULL|DEFAULT|UNIQUE|CHECK|CONSTRAINT)\b/gi, className: 'hljs-keyword' });
                patterns.push({ regex: /\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|CONVERT|SUBSTRING|CONCAT|UPPER|LOWER|TRIM|LENGTH)\b/gi, className: 'hljs-built_in' });
                break;
            case 'java':
            case 'csharp':
            case 'cpp':
            case 'c':
                patterns.push({ regex: /\/\/.*$/gm, className: 'hljs-comment' });
                patterns.push({ regex: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|void|int|long|float|double|boolean|char|byte|short|string|var|const|null|true|false|this|super|import|package|using|namespace)\b/g, className: 'hljs-keyword' });
                patterns.push({ regex: /\b(String|Integer|Long|Float|Double|Boolean|Object|List|Map|Set|Array|ArrayList|HashMap|HashSet)\b/g, className: 'hljs-type' });
                break;
            case 'go':
                patterns.push({ regex: /\/\/.*$/gm, className: 'hljs-comment' });
                patterns.push({ regex: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /\b(package|import|func|return|if|else|for|range|switch|case|default|break|continue|go|defer|chan|select|type|struct|interface|map|var|const|nil|true|false|make|new|len|cap|append|copy|delete|panic|recover)\b/g, className: 'hljs-keyword' });
                patterns.push({ regex: /\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|error)\b/g, className: 'hljs-type' });
                break;
            case 'rust':
                patterns.push({ regex: /\/\/.*$/gm, className: 'hljs-comment' });
                patterns.push({ regex: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /\b(fn|let|mut|const|static|if|else|match|loop|while|for|in|break|continue|return|struct|enum|impl|trait|type|pub|mod|use|crate|self|super|where|async|await|move|ref|true|false|Some|None|Ok|Err)\b/g, className: 'hljs-keyword' });
                patterns.push({ regex: /\b(i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64|bool|char|str|String|Vec|Option|Result|Box|Rc|Arc)\b/g, className: 'hljs-type' });
                patterns.push({ regex: /[a-z_]+!/g, className: 'hljs-built_in' });
                break;
            case 'yaml':
                patterns.push({ regex: /#.*$/gm, className: 'hljs-comment' });
                addCommon();
                patterns.push({ regex: /^[a-zA-Z_][a-zA-Z0-9_-]*(?=:)/gm, className: 'hljs-attr' });
                patterns.push({ regex: /\b(true|false|null|yes|no|on|off)\b/gi, className: 'hljs-literal' });
                break;
            default:
                return null;
        }

        return patterns;
    }

    // ===== Export =====
    window.__editorUtils = {
        LUCIDE_ICONS: LUCIDE_ICONS,
        SUPPORTED_LANGUAGES: SUPPORTED_LANGUAGES,
        LANGUAGE_ALIASES: LANGUAGE_ALIASES,
        REGEX: REGEX,
        escapeHtml: escapeHtml,
        normalizeBlockHtml: normalizeBlockHtml,
        parseInlineCode: parseInlineCode,
        getCodeFence: getCodeFence,
        wrapInlineCode: wrapInlineCode,
        cleanImageSrc: cleanImageSrc,
        getHighlightPatterns: getHighlightPatterns
    };
})();
