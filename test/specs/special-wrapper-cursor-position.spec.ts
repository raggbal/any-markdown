import { test, expect } from '@playwright/test';

test.describe('Mermaid/Math block cursor position after editing', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => {
            console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
        });
        page.on('pageerror', err => {
            console.log(`[BROWSER ERROR] ${err.message}`);
        });

        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor', { timeout: 5000 });
        await page.waitForTimeout(1000);
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });
    });

    test('setCursorToLastLineStartByDOM handles \\n text nodes correctly', async ({ page }) => {
        // Directly test setCursorToLastLineStartByDOM with \n text nodes (not <br>)
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');

            // Create a code element with \n text nodes (simulating what happens after editing in mermaid/math)
            const pre = document.createElement('pre');
            pre.setAttribute('data-lang', 'test');
            const code = document.createElement('code');
            code.setAttribute('contenteditable', 'true');

            // Simulate: "line1\nline2\nline3\n" with \n text nodes
            code.appendChild(document.createTextNode('line1'));
            code.appendChild(document.createTextNode('\n'));
            code.appendChild(document.createTextNode('line2'));
            code.appendChild(document.createTextNode('\n'));
            code.appendChild(document.createTextNode('line3'));
            code.appendChild(document.createTextNode('\n')); // trailing newline (empty last line)

            pre.appendChild(code);
            editor.appendChild(pre);

            // Call setCursorToLastLineStartByDOM via test API
            window.__testApi.setCursorToLastLineStartByDOM(code);

            // Check cursor position
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return { error: 'no selection' };

            const range = sel.getRangeAt(0);

            // Get text before cursor
            const cursorRange = document.createRange();
            cursorRange.selectNodeContents(code);
            cursorRange.setEnd(range.startContainer, range.startOffset);
            const textBeforeCursor = cursorRange.toString();

            // The last line after "line3\n" is empty, so cursor should be after the last \n
            // textBeforeCursor should be "line1\nline2\nline3\n"
            const lastNewline = textBeforeCursor.lastIndexOf('\n');
            const posInLine = lastNewline === -1 ? textBeforeCursor.length : textBeforeCursor.length - lastNewline - 1;

            // Clean up
            pre.remove();

            return {
                textBeforeCursor,
                positionInLine: posInLine,
                isAtLineStart: posInLine === 0,
                anchorNodeType: range.startContainer.nodeType,
                anchorNodeText: range.startContainer.textContent?.substring(0, 20),
                anchorOffset: range.startOffset,
                codeChildNodes: Array.from(code.childNodes).map(n =>
                    n.nodeType === 3 ? `TEXT:"${n.textContent}"` : n.nodeName
                )
            };
        });
        console.log('setCursorToLastLineStartByDOM with \\n result:', JSON.stringify(result));

        // Cursor should be at the start of the last (empty) line
        expect(result.isAtLineStart).toBe(true);
    });

    test('setCursorToLastLineStartByDOM handles \\n text nodes with content on last line', async ({ page }) => {
        // Test with \n text nodes where the last line has content
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');

            const pre = document.createElement('pre');
            pre.setAttribute('data-lang', 'test');
            const code = document.createElement('code');
            code.setAttribute('contenteditable', 'true');

            // Simulate: "line1\nline2\nline3" (no trailing newline)
            code.appendChild(document.createTextNode('line1'));
            code.appendChild(document.createTextNode('\n'));
            code.appendChild(document.createTextNode('line2'));
            code.appendChild(document.createTextNode('\n'));
            code.appendChild(document.createTextNode('line3'));

            pre.appendChild(code);
            editor.appendChild(pre);

            window.__testApi.setCursorToLastLineStartByDOM(code);

            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return { error: 'no selection' };

            const range = sel.getRangeAt(0);
            const cursorRange = document.createRange();
            cursorRange.selectNodeContents(code);
            cursorRange.setEnd(range.startContainer, range.startOffset);
            const textBeforeCursor = cursorRange.toString();

            const lastNewline = textBeforeCursor.lastIndexOf('\n');
            const posInLine = lastNewline === -1 ? textBeforeCursor.length : textBeforeCursor.length - lastNewline - 1;

            pre.remove();

            return {
                textBeforeCursor,
                positionInLine: posInLine,
                isAtLineStart: posInLine === 0,
                anchorNodeType: range.startContainer.nodeType,
                anchorNodeText: range.startContainer.textContent?.substring(0, 20),
                anchorOffset: range.startOffset
            };
        });
        console.log('setCursorToLastLineStartByDOM with \\n (content on last line) result:', JSON.stringify(result));

        // Cursor should be at start of "line3" (position 0 in the last line)
        expect(result.isAtLineStart).toBe(true);
    });

    test('setCursorToLastLineStartByDOM handles mixed <br> and \\n correctly', async ({ page }) => {
        // Test with mixed <br> and \n (which can happen during editing)
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');

            const pre = document.createElement('pre');
            pre.setAttribute('data-lang', 'test');
            const code = document.createElement('code');
            code.setAttribute('contenteditable', 'true');

            // Simulate: "line1<br>line2\nline3\n"
            code.appendChild(document.createTextNode('line1'));
            code.appendChild(document.createElement('br'));
            code.appendChild(document.createTextNode('line2'));
            code.appendChild(document.createTextNode('\n'));
            code.appendChild(document.createTextNode('line3'));
            code.appendChild(document.createTextNode('\n'));

            pre.appendChild(code);
            editor.appendChild(pre);

            window.__testApi.setCursorToLastLineStartByDOM(code);

            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return { error: 'no selection' };

            const range = sel.getRangeAt(0);
            const cursorRange = document.createRange();
            cursorRange.selectNodeContents(code);
            cursorRange.setEnd(range.startContainer, range.startOffset);
            const textBeforeCursor = cursorRange.toString();

            const lastNewline = textBeforeCursor.lastIndexOf('\n');
            const posInLine = lastNewline === -1 ? textBeforeCursor.length : textBeforeCursor.length - lastNewline - 1;

            pre.remove();

            return {
                textBeforeCursor,
                positionInLine: posInLine,
                isAtLineStart: posInLine === 0,
                anchorNodeType: range.startContainer.nodeType,
                anchorNodeText: range.startContainer.textContent?.substring(0, 20),
                anchorOffset: range.startOffset
            };
        });
        console.log('setCursorToLastLineStartByDOM with mixed result:', JSON.stringify(result));

        expect(result.isAtLineStart).toBe(true);
    });

    test('ArrowUp into mermaid block after adding lines with Enter - realistic', async ({ page }) => {
        // Setup: mermaid block with paragraph below
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```mermaid\ngraph TD\n    A --> B\n```\nParagraph below\n');
        });
        await page.waitForTimeout(500);

        // Step 1: Enter edit mode by clicking on the mermaid wrapper via evaluate
        await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            if (wrapper) {
                // Dispatch click directly
                wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
        });
        await page.waitForTimeout(300);

        // Step 2: Move cursor to end of code content
        await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            const code = wrapper?.querySelector('code');
            if (code) {
                code.focus();
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(code);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        // Step 3: Press Enter twice to add empty lines
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        // Debug: check code content
        const afterEnter = await page.evaluate(() => {
            const code = document.querySelector('.mermaid-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:"${n.textContent}"` : n.nodeName
                )
            };
        });
        console.log('After Enter x2:', JSON.stringify(afterEnter));

        // Step 4: Exit edit mode by clicking on the paragraph below using evaluate
        await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            if (wrapper) {
                // Exit edit mode
                wrapper.setAttribute('data-mode', 'display');
            }
            // Focus on paragraph below
            const children = Array.from(document.getElementById('editor').children);
            for (let i = children.length - 1; i >= 0; i--) {
                if (children[i].tagName === 'P' && children[i].textContent.trim()) {
                    const range = document.createRange();
                    range.selectNodeContents(children[i]);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    break;
                }
            }
        });
        await page.waitForTimeout(300);

        // Debug: check state before ArrowUp
        const beforeArrowUp = await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            const code = wrapper?.querySelector('code');
            const sel = window.getSelection();
            return {
                mode: wrapper?.getAttribute('data-mode'),
                codeHTML: code?.innerHTML,
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:"${n.textContent}"` : n.nodeName
                ),
                cursorIn: sel?.anchorNode?.parentElement?.tagName
            };
        });
        console.log('Before ArrowUp:', JSON.stringify(beforeArrowUp));

        // Step 5: Press ArrowUp to enter the mermaid block from below
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(500);

        // Step 6: Check cursor position
        const cursorInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return { error: 'no selection' };

            const range = sel.getRangeAt(0);
            const anchorNode = sel.anchorNode;

            let codeEl = anchorNode;
            while (codeEl && codeEl.tagName !== 'CODE') {
                codeEl = codeEl.parentElement;
            }

            if (!codeEl) {
                return {
                    error: 'cursor not in code element',
                    anchorNodeName: anchorNode?.nodeName,
                    anchorNodeText: anchorNode?.textContent?.substring(0, 50),
                    anchorOffset: sel.anchorOffset,
                    parentTag: anchorNode?.parentElement?.tagName,
                    parentClass: anchorNode?.parentElement?.className
                };
            }

            const cursorRange = document.createRange();
            cursorRange.selectNodeContents(codeEl);
            cursorRange.setEnd(range.startContainer, range.startOffset);
            const textBeforeCursor = cursorRange.toString();

            const lastNewline = textBeforeCursor.lastIndexOf('\n');
            const posInLine = lastNewline === -1 ? textBeforeCursor.length : textBeforeCursor.length - lastNewline - 1;

            return {
                textBeforeCursor,
                positionInLine: posInLine,
                isAtLineStart: posInLine === 0,
                codeHTML: codeEl.innerHTML,
                childNodes: Array.from(codeEl.childNodes).map(n =>
                    n.nodeType === 3 ? `TEXT:"${n.textContent}"` : n.nodeName
                )
            };
        });
        console.log('Cursor info after ArrowUp:', JSON.stringify(cursorInfo));

        expect(cursorInfo.error).toBeUndefined();
        expect(cursorInfo.isAtLineStart).toBe(true);
    });
});
