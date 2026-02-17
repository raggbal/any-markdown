import { test, expect } from '@playwright/test';

test.describe('Mermaid and Source Mode', () => {
    test.beforeEach(async ({ page }) => {
        // Capture all console messages
        page.on('console', msg => {
            console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
        });
        page.on('pageerror', err => {
            console.log(`[BROWSER ERROR] ${err.message}`);
        });
        
        await page.goto('http://localhost:3000/standalone-editor.html');
        // Wait for page to load
        await page.waitForSelector('#editor', { timeout: 5000 });
        await page.waitForTimeout(1000);
    });

    test('setMarkdown should work', async ({ page }) => {
        // First check if __testApi is available
        const apiCheck = await page.evaluate(() => {
            return {
                hasTestApi: !!window.__testApi,
                hasSetMarkdown: typeof window.__testApi?.setMarkdown === 'function',
                ready: window.__testApi?.ready
            };
        });
        console.log('API check:', apiCheck);
        
        // Set markdown
        const setResult = await page.evaluate(() => {
            try {
                window.__testApi.setMarkdown('# Hello World');
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });
        console.log('Set result:', setResult);
        
        await page.waitForTimeout(500);
        
        // Check editor content
        const editorContent = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            return editor?.innerHTML || 'no editor';
        });
        console.log('Editor content:', editorContent);
        
        expect(editorContent).toContain('Hello World');
    });

    test('Mermaid code block should create wrapper structure', async ({ page }) => {
        // Wait for testApi to be ready
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        // Set markdown with mermaid code block
        const mermaidMarkdown = `# Test

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`

Done.`;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(1000);

        // Check if mermaid wrapper exists
        const mermaidState = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const diagram = editor?.querySelector('.mermaid-diagram');
            const pre = editor?.querySelector('pre[data-lang="mermaid"]');
            
            return {
                hasWrapper: !!wrapper,
                hasDiagram: !!diagram,
                hasPre: !!pre,
                diagramContent: diagram?.innerHTML?.substring(0, 200) || 'empty',
                editorHTML: editor?.innerHTML?.substring(0, 1000) || 'no editor'
            };
        });

        console.log('Mermaid state:', mermaidState);

        // Verify mermaid wrapper exists
        expect(mermaidState.hasWrapper).toBe(true);
        expect(mermaidState.hasDiagram).toBe(true);
    });

    test('Mermaid diagram should render SVG', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        const mermaidMarkdown = `\`\`\`mermaid
flowchart LR
    A --> B
\`\`\``;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        // Wait for mermaid to load and render (up to 5 seconds)
        await page.waitForTimeout(5000);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const diagram = editor?.querySelector('.mermaid-diagram');
            const svg = diagram?.querySelector('svg');
            const error = diagram?.querySelector('.mermaid-error');
            
            return {
                hasSvg: !!svg,
                hasError: !!error,
                errorText: error?.textContent || '',
                diagramHTML: diagram?.innerHTML?.substring(0, 500) || 'no diagram',
                mermaidDefined: typeof mermaid !== 'undefined'
            };
        });

        console.log('Render result:', result);

        // Mermaid should be defined (loaded from CDN)
        expect(result.mermaidDefined).toBe(true);
        
        // Should have SVG rendered
        expect(result.hasSvg).toBe(true);
    });

    test('HTML to Markdown conversion preserves mermaid code', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        const mermaidMarkdown = `# Test

\`\`\`mermaid
graph TD
    A --> B
\`\`\`

End.`;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(1000);

        // Get markdown back
        const resultMarkdown = await page.evaluate(() => {
            return window.__testApi?.getMarkdown?.() || '';
        });

        console.log('Original:', mermaidMarkdown);
        console.log('Result:', resultMarkdown);

        // Should preserve mermaid code block
        expect(resultMarkdown).toContain('```mermaid');
        expect(resultMarkdown).toContain('graph TD');
    });

    test('Arrow down from paragraph should enter mermaid editing mode', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        // Use markdown without empty lines between paragraph and mermaid block
        const mermaidMarkdown = `First paragraph
\`\`\`mermaid
graph TD
    A --> B
\`\`\`
Last paragraph`;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(2000);

        // Click on first paragraph to set cursor there
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const firstP = editor?.querySelector('p');
            if (firstP) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(firstP);
                range.collapse(false); // End of paragraph
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });

        await page.waitForTimeout(100);

        // Press ArrowDown to enter mermaid block
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        // Check if mermaid wrapper is in editing mode (using data-mode attribute)
        const state = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const isEditing = wrapper?.getAttribute('data-mode') === 'edit';
            const pre = wrapper?.querySelector('pre[data-lang="mermaid"]');
            const preDisplay = pre ? window.getComputedStyle(pre).display : 'none';
            
            // Check if cursor is inside the pre
            const sel = window.getSelection();
            const cursorInPre = sel?.anchorNode && (
                sel.anchorNode === pre || 
                pre?.contains(sel.anchorNode)
            );
            
            return {
                hasWrapper: !!wrapper,
                isEditing,
                preDisplay,
                cursorInPre
            };
        });

        console.log('State after ArrowDown:', state);

        expect(state.hasWrapper).toBe(true);
        expect(state.isEditing).toBe(true);
        expect(state.cursorInPre).toBe(true);
    });

    test('Arrow up from paragraph should enter mermaid editing mode from below', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        // Use markdown without empty lines
        const mermaidMarkdown = `First paragraph
\`\`\`mermaid
graph TD
    A --> B
\`\`\`
Last paragraph`;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(2000);

        // Debug: Check HTML structure
        const htmlDebug = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const pre = wrapper?.querySelector('pre[data-lang="mermaid"]');
            const code = pre?.querySelector('code');
            return {
                codeHTML: code?.innerHTML,
                codeText: code?.textContent,
                brCount: code?.querySelectorAll('br').length
            };
        });
        console.log('HTML Debug:', htmlDebug);

        // Click on last paragraph to set cursor there
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const paragraphs = editor?.querySelectorAll('p');
            const lastP = paragraphs?.[paragraphs.length - 1];
            if (lastP) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(lastP);
                range.collapse(true); // Start of paragraph
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });

        await page.waitForTimeout(100);

        // Press ArrowUp to enter mermaid block from below
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(300);

        // Check if mermaid wrapper is in editing mode and cursor is at last line
        const state = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const isEditing = wrapper?.getAttribute('data-mode') === 'edit';
            const pre = wrapper?.querySelector('pre[data-lang="mermaid"]');
            const code = pre?.querySelector('code');
            
            // Check if cursor is inside the pre
            const sel = window.getSelection();
            const cursorInPre = sel?.anchorNode && (
                sel.anchorNode === pre || 
                pre?.contains(sel.anchorNode)
            );
            
            // Count <br> elements to determine total lines
            // Check if last <br> is at the end (no text after it)
            const brElements = code?.querySelectorAll('br') || [];
            let totalLines = 1;
            if (brElements.length > 0) {
                const lastBr = brElements[brElements.length - 1];
                let hasTextAfterLastBr = false;
                let nextNode = lastBr.nextSibling;
                while (nextNode) {
                    if (nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent?.trim()) {
                        hasTextAfterLastBr = true;
                        break;
                    }
                    nextNode = nextNode.nextSibling;
                }
                totalLines = hasTextAfterLastBr ? brElements.length + 1 : brElements.length;
            }
            
            // Determine current line by counting <br>s before cursor
            let currentLine = 0;
            if (sel?.anchorNode && code) {
                const walker = document.createTreeWalker(code, NodeFilter.SHOW_ALL);
                let node;
                while ((node = walker.nextNode())) {
                    if (node === sel.anchorNode) break;
                    if (node.nodeName === 'BR') currentLine++;
                }
            }
            
            // Debug: get anchor node info
            const anchorInfo = sel?.anchorNode ? {
                nodeType: sel.anchorNode.nodeType,
                nodeName: sel.anchorNode.nodeName,
                textContent: sel.anchorNode.textContent?.substring(0, 50)
            } : null;
            
            return {
                hasWrapper: !!wrapper,
                isEditing,
                cursorInPre,
                totalLines,
                currentLine,
                isAtLastLine: currentLine === totalLines - 1,
                anchorInfo
            };
        });

        console.log('State after ArrowUp from below:', state);

        expect(state.hasWrapper).toBe(true);
        expect(state.isEditing).toBe(true);
        expect(state.cursorInPre).toBe(true);
        expect(state.isAtLastLine).toBe(true);
    });

    test('Arrow down from last line should exit mermaid block to next paragraph', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        const mermaidMarkdown = `First paragraph
\`\`\`mermaid
graph TD
    A --> B
\`\`\`
Last paragraph`;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(2000);

        // Enter editing mode and set cursor to last line of code
        const setupResult = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            if (wrapper) {
                wrapper.setAttribute('data-mode', 'edit');
                const pre = wrapper.querySelector('pre[data-lang="mermaid"]');
                const code = pre?.querySelector('code');
                if (code) {
                    // Find the last <br> that has text before it (the actual last line)
                    const brElements = code.querySelectorAll('br');
                    if (brElements.length > 1) {
                        // Get the second-to-last <br> and find text after it
                        const targetBr = brElements[brElements.length - 2];
                        let nextNode = targetBr.nextSibling;
                        while (nextNode && nextNode.nodeType !== Node.TEXT_NODE) {
                            nextNode = nextNode.nextSibling;
                        }
                        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
                            const range = document.createRange();
                            const sel = window.getSelection();
                            range.setStart(nextNode, 0);
                            range.collapse(true);
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                            return { success: true, textContent: nextNode.textContent };
                        }
                    } else if (brElements.length === 1) {
                        // Only one <br>, find text after it
                        const targetBr = brElements[0];
                        let nextNode = targetBr.nextSibling;
                        while (nextNode && nextNode.nodeType !== Node.TEXT_NODE) {
                            nextNode = nextNode.nextSibling;
                        }
                        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
                            const range = document.createRange();
                            const sel = window.getSelection();
                            range.setStart(nextNode, 0);
                            range.collapse(true);
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                            return { success: true, textContent: nextNode.textContent };
                        }
                    }
                }
            }
            return { success: false };
        });

        console.log('Setup result:', setupResult);

        await page.waitForTimeout(100);

        // Press ArrowDown to exit mermaid block
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        // Check if cursor moved to last paragraph and editing mode is removed
        const state = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const isEditing = wrapper?.getAttribute('data-mode') === 'edit';
            
            // Check if cursor is in last paragraph
            const sel = window.getSelection();
            const paragraphs = editor?.querySelectorAll('p');
            const lastP = paragraphs?.[paragraphs.length - 1];
            const cursorInLastP = sel?.anchorNode && (
                sel.anchorNode === lastP || 
                lastP?.contains(sel.anchorNode)
            );
            
            // Debug info
            const anchorInfo = sel?.anchorNode ? {
                nodeType: sel.anchorNode.nodeType,
                nodeName: sel.anchorNode.nodeName,
                textContent: sel.anchorNode.textContent?.substring(0, 50)
            } : null;
            
            return {
                isEditing,
                cursorInLastP,
                anchorInfo
            };
        });

        console.log('State after ArrowDown from last line:', state);

        expect(state.isEditing).toBe(false);
        expect(state.cursorInLastP).toBe(true);
    });

    test('Arrow up from first line should exit mermaid block to previous paragraph', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        const mermaidMarkdown = `First paragraph
\`\`\`mermaid
graph TD
    A --> B
\`\`\`
Last paragraph`;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(2000);

        // Enter editing mode and set cursor to first line of code
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            if (wrapper) {
                wrapper.setAttribute('data-mode', 'edit');
                const pre = wrapper.querySelector('pre[data-lang="mermaid"]');
                const code = pre?.querySelector('code');
                if (code) {
                    // Set cursor to start of first text node
                    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT, null, false);
                    const firstText = walker.nextNode();
                    if (firstText) {
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.setStart(firstText, 0);
                        range.collapse(true);
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            }
        });

        await page.waitForTimeout(100);

        // Press ArrowUp to exit mermaid block
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(300);

        // Check if cursor moved to first paragraph and editing mode is removed
        const state = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const isEditing = wrapper?.getAttribute('data-mode') === 'edit';
            
            // Check if cursor is in first paragraph
            const sel = window.getSelection();
            const firstP = editor?.querySelector('p');
            const cursorInFirstP = sel?.anchorNode && (
                sel.anchorNode === firstP || 
                firstP?.contains(sel.anchorNode)
            );
            
            return {
                isEditing,
                cursorInFirstP
            };
        });

        console.log('State after ArrowUp from first line:', state);

        expect(state.isEditing).toBe(false);
        expect(state.cursorInFirstP).toBe(true);
    });

    test('Arrow down should exit mermaid block and remove editing mode', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        const mermaidMarkdown = `First paragraph
\`\`\`mermaid
graph TD
    A --> B
\`\`\`
Last paragraph`;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(2000);

        // Click on mermaid wrapper to enter editing mode
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            if (wrapper) {
                wrapper.setAttribute('data-mode', 'edit');
                const pre = wrapper.querySelector('pre[data-lang="mermaid"]');
                const code = pre?.querySelector('code');
                if (code) {
                    // Set cursor to end of code (last line)
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(code);
                    range.collapse(false);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            }
        });

        await page.waitForTimeout(100);

        // Press ArrowDown to exit mermaid block
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        // Check if mermaid wrapper editing mode is removed
        const state = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const isEditing = wrapper?.getAttribute('data-mode') === 'edit';
            
            // Check if cursor is in last paragraph
            const sel = window.getSelection();
            const paragraphs = editor?.querySelectorAll('p');
            const lastP = paragraphs?.[paragraphs.length - 1];
            const cursorInLastP = sel?.anchorNode && (
                sel.anchorNode === lastP || 
                lastP?.contains(sel.anchorNode)
            );
            
            return {
                isEditing,
                cursorInLastP
            };
        });

        console.log('State after exit:', state);

        expect(state.isEditing).toBe(false);
        expect(state.cursorInLastP).toBe(true);
    });

    test('Paste in mermaid code block should trigger re-render', async ({ page }) => {
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

        const mermaidMarkdown = `\`\`\`mermaid
graph TD
    A --> B
\`\`\``;

        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, mermaidMarkdown);

        await page.waitForTimeout(2000);

        // Enter editing mode and select all code
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            if (wrapper) {
                wrapper.setAttribute('data-mode', 'edit');
                const pre = wrapper.querySelector('pre[data-lang="mermaid"]');
                const code = pre?.querySelector('code');
                if (code) {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(code);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            }
        });

        await page.waitForTimeout(100);

        // Get initial SVG content
        const initialSvg = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const svg = editor?.querySelector('.mermaid-diagram svg');
            return svg?.innerHTML?.substring(0, 100) || '';
        });

        // Simulate paste with new mermaid code
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const wrapper = editor?.querySelector('.mermaid-wrapper');
            const pre = wrapper?.querySelector('pre[data-lang="mermaid"]');
            const code = pre?.querySelector('code');
            if (code) {
                // Clear and set new content
                code.innerHTML = 'flowchart LR<br>    X --> Y --> Z';
                // Dispatch paste event
                const pasteEvent = new Event('paste', { bubbles: true });
                pre?.dispatchEvent(pasteEvent);
            }
        });

        // Wait for re-render
        await page.waitForTimeout(1500);

        // Check if SVG was re-rendered
        const finalState = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const svg = editor?.querySelector('.mermaid-diagram svg');
            const diagramHtml = editor?.querySelector('.mermaid-diagram')?.innerHTML || '';
            
            return {
                hasSvg: !!svg,
                containsNewContent: diagramHtml.includes('X') || diagramHtml.includes('Y'),
                svgContent: svg?.innerHTML?.substring(0, 200) || ''
            };
        });

        console.log('Final state after paste:', finalState);

        expect(finalState.hasSvg).toBe(true);
    });

    test.describe('Mermaidブロック直後の段落でBackspace (v0.195.104)', () => {
        test('Mermaidブロック直後の空の段落でBackspaceを押すとMermaidブロックに入る', async ({ page }) => {
            await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

            // パース済みHTMLを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <div class="mermaid-wrapper" data-mode="display">
                        <div class="mermaid-diagram"><svg></svg></div>
                        <pre data-lang="mermaid" style="display:none"><code>graph TD\n    A --> B</code></pre>
                    </div>
                    <p><br></p>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 空の段落にカーソルを設定
            await page.evaluate(() => {
                const p = document.querySelector('#editor p');
                if (p) {
                    const range = document.createRange();
                    range.selectNodeContents(p);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(100);
            
            // Backspaceを押す
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(200);
            
            // 段落が削除され、Mermaidブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const paragraphs = document.querySelectorAll('#editor p');
                const wrapper = document.querySelector('#editor .mermaid-wrapper');
                
                return {
                    paragraphCount: paragraphs.length,
                    wrapperMode: wrapper?.getAttribute('data-mode')
                };
            });
            
            // 空の段落が削除されている
            expect(result.paragraphCount).toBe(0);
            // Mermaidブロックが編集モードになっている
            expect(result.wrapperMode).toBe('edit');
        });

        test('Mermaidブロック直後の内容がある段落でBackspaceを押すと内容がMermaidコードに追加される', async ({ page }) => {
            await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

            // パース済みHTMLを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <div class="mermaid-wrapper" data-mode="display">
                        <div class="mermaid-diagram"><svg></svg></div>
                        <pre data-lang="mermaid" style="display:none"><code>graph TD<br>    A --> B</code></pre>
                    </div>
                    <p>追加テキスト</p>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 段落の先頭にカーソルを設定
            await page.evaluate(() => {
                const p = document.querySelector('#editor p');
                if (p && p.firstChild) {
                    const range = document.createRange();
                    range.setStart(p.firstChild, 0);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(100);
            
            // Backspaceを押す
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(200);
            
            // 段落の内容がMermaidコードに追加されていることを確認
            const result = await page.evaluate(() => {
                const paragraphs = document.querySelectorAll('#editor p');
                const code = document.querySelector('#editor .mermaid-wrapper pre code');
                
                return {
                    paragraphCount: paragraphs.length,
                    codeContent: code?.textContent || ''
                };
            });
            
            // 段落が削除されている
            expect(result.paragraphCount).toBe(0);
            // Mermaidコードに内容が追加されている
            expect(result.codeContent).toContain('追加テキスト');
        });
    });

    test.describe('連続Mermaid/コードブロック間のナビゲーション (v0.195.104)', () => {
        test('Mermaidブロックから↓キーで次のMermaidブロックに入る', async ({ page }) => {
            await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

            // 連続するMermaidブロックを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <div class="mermaid-wrapper" data-mode="display">
                        <div class="mermaid-diagram"><svg></svg></div>
                        <pre data-lang="mermaid" style="display:none"><code>graph TD<br>    A --> B</code></pre>
                    </div>
                    <div class="mermaid-wrapper" data-mode="display">
                        <div class="mermaid-diagram"><svg></svg></div>
                        <pre data-lang="mermaid" style="display:none"><code>flowchart LR<br>    X --> Y</code></pre>
                    </div>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 上のMermaidブロックを編集モードにしてカーソルを末尾に設定
            await page.evaluate(() => {
                const wrappers = document.querySelectorAll('#editor .mermaid-wrapper');
                const firstWrapper = wrappers[0];
                if (firstWrapper) {
                    firstWrapper.setAttribute('data-mode', 'edit');
                    const code = firstWrapper.querySelector('code');
                    if (code) {
                        const range = document.createRange();
                        range.selectNodeContents(code);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            });
            await page.waitForTimeout(100);
            
            // ↓キーを押す
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(300);
            
            // 下のMermaidブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const wrappers = document.querySelectorAll('#editor .mermaid-wrapper');
                return {
                    firstWrapperMode: wrappers[0]?.getAttribute('data-mode'),
                    secondWrapperMode: wrappers[1]?.getAttribute('data-mode')
                };
            });
            
            // 上のMermaidブロックは描画モードに戻っている
            expect(result.firstWrapperMode).toBe('display');
            // 下のMermaidブロックは編集モードになっている
            expect(result.secondWrapperMode).toBe('edit');
        });

        test('Mermaidブロックから↓キーで次のコードブロックに入る', async ({ page }) => {
            await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

            // Mermaidブロック → コードブロックを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <div class="mermaid-wrapper" data-mode="display">
                        <div class="mermaid-diagram"><svg></svg></div>
                        <pre data-lang="mermaid" style="display:none"><code>graph TD<br>    A --> B</code></pre>
                    </div>
                    <pre data-lang="javascript" data-mode="display"><code>const x = 1;</code></pre>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // Mermaidブロックを編集モードにしてカーソルを末尾に設定
            await page.evaluate(() => {
                const wrapper = document.querySelector('#editor .mermaid-wrapper');
                if (wrapper) {
                    wrapper.setAttribute('data-mode', 'edit');
                    const code = wrapper.querySelector('code');
                    if (code) {
                        const range = document.createRange();
                        range.selectNodeContents(code);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            });
            await page.waitForTimeout(100);
            
            // ↓キーを押す
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(300);
            
            // コードブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const wrapper = document.querySelector('#editor .mermaid-wrapper');
                const pre = document.querySelector('#editor pre[data-lang="javascript"]');
                return {
                    wrapperMode: wrapper?.getAttribute('data-mode'),
                    preMode: pre?.getAttribute('data-mode')
                };
            });
            
            // Mermaidブロックは描画モードに戻っている
            expect(result.wrapperMode).toBe('display');
            // コードブロックは編集モードになっている
            expect(result.preMode).toBe('edit');
        });

        test('コードブロックから↓キーで次のMermaidブロックに入る', async ({ page }) => {
            await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

            // コードブロック → Mermaidブロックを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="display"><code>const x = 1;</code></pre>
                    <div class="mermaid-wrapper" data-mode="display">
                        <div class="mermaid-diagram"><svg></svg></div>
                        <pre data-lang="mermaid" style="display:none"><code>graph TD<br>    A --> B</code></pre>
                    </div>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // コードブロックを編集モードにしてカーソルを末尾に設定
            await page.evaluate(() => {
                const pre = document.querySelector('#editor pre[data-lang="javascript"]');
                if (pre) {
                    pre.setAttribute('data-mode', 'edit');
                    const code = pre.querySelector('code');
                    if (code) {
                        code.setAttribute('contenteditable', 'true');
                        const range = document.createRange();
                        range.selectNodeContents(code);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            });
            await page.waitForTimeout(100);
            
            // ↓キーを押す
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(300);
            
            // Mermaidブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const pre = document.querySelector('#editor pre[data-lang="javascript"]');
                const wrapper = document.querySelector('#editor .mermaid-wrapper');
                return {
                    preMode: pre?.getAttribute('data-mode'),
                    wrapperMode: wrapper?.getAttribute('data-mode')
                };
            });
            
            // コードブロックは描画モードに戻っている
            expect(result.preMode).toBe('display');
            // Mermaidブロックは編集モードになっている
            expect(result.wrapperMode).toBe('edit');
        });

        test('Mermaidブロックから↑キーで前のコードブロックに入る', async ({ page }) => {
            await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

            // コードブロック → Mermaidブロックを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="display"><code>const x = 1;</code></pre>
                    <div class="mermaid-wrapper" data-mode="display">
                        <div class="mermaid-diagram"><svg></svg></div>
                        <pre data-lang="mermaid" style="display:none"><code>graph TD<br>    A --> B</code></pre>
                    </div>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // Mermaidブロックを編集モードにしてカーソルを先頭に設定
            await page.evaluate(() => {
                const wrapper = document.querySelector('#editor .mermaid-wrapper');
                if (wrapper) {
                    wrapper.setAttribute('data-mode', 'edit');
                    const code = wrapper.querySelector('code');
                    if (code) {
                        const range = document.createRange();
                        range.selectNodeContents(code);
                        range.collapse(true);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            });
            await page.waitForTimeout(100);
            
            // ↑キーを押す
            await page.keyboard.press('ArrowUp');
            await page.waitForTimeout(300);
            
            // コードブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const pre = document.querySelector('#editor pre[data-lang="javascript"]');
                const wrapper = document.querySelector('#editor .mermaid-wrapper');
                return {
                    preMode: pre?.getAttribute('data-mode'),
                    wrapperMode: wrapper?.getAttribute('data-mode')
                };
            });
            
            // コードブロックは編集モードになっている
            expect(result.preMode).toBe('edit');
            // Mermaidブロックは描画モードに戻っている
            expect(result.wrapperMode).toBe('display');
        });
    });
});
