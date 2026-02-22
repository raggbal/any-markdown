import { test, expect } from '@playwright/test';

test.describe('Math block Enter trailing newline debug', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => {
            console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
        });
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor', { timeout: 5000 });
        await page.waitForTimeout(1000);
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });
    });

    test('Math block: Enter at end adds only ONE newline, not extra', async ({ page }) => {
        // Setup math block
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```math\nE = mc^2\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        // Enter edit mode via click
        await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        // Move cursor to end of code
        await page.evaluate(() => {
            const code = document.querySelector('.math-wrapper code');
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

        // Record DOM before Enter
        const before = await page.evaluate(() => {
            const code = document.querySelector('.math-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                plainText: JSON.stringify(code?.textContent),
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:${JSON.stringify(n.textContent)}` : n.nodeName
                )
            };
        });
        console.log('BEFORE Enter:', JSON.stringify(before));

        // Press Enter once
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const afterEnter1 = await page.evaluate(() => {
            const code = document.querySelector('.math-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                plainText: JSON.stringify(code?.textContent),
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:${JSON.stringify(n.textContent)}` : n.nodeName
                )
            };
        });
        console.log('AFTER 1 Enter:', JSON.stringify(afterEnter1));

        // Press Enter again (adding empty line at end)
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const afterEnter2 = await page.evaluate(() => {
            const code = document.querySelector('.math-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                plainText: JSON.stringify(code?.textContent),
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:${JSON.stringify(n.textContent)}` : n.nodeName
                )
            };
        });
        console.log('AFTER 2 Enters:', JSON.stringify(afterEnter2));

        // Now exit edit mode
        await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            if (wrapper) {
                wrapper.setAttribute('data-mode', 'display');
                // renderMathBlock is called by exitSpecialWrapperDisplayMode
            }
        });
        await page.waitForTimeout(300);

        // Check markdown
        const md = await page.evaluate(() => window.__testApi.getMarkdown());
        console.log('MARKDOWN after exit:', JSON.stringify(md));

        // Re-enter edit mode
        await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        const afterReenter = await page.evaluate(() => {
            const code = document.querySelector('.math-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                plainText: JSON.stringify(code?.textContent),
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:${JSON.stringify(n.textContent)}` : n.nodeName
                )
            };
        });
        console.log('AFTER re-enter edit:', JSON.stringify(afterReenter));
    });

    test('Mermaid block: Enter at end for comparison', async ({ page }) => {
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```mermaid\ngraph TD\n    A --> B\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        await page.evaluate(() => {
            const code = document.querySelector('.mermaid-wrapper code');
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

        const before = await page.evaluate(() => {
            const code = document.querySelector('.mermaid-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                plainText: JSON.stringify(code?.textContent),
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:${JSON.stringify(n.textContent)}` : n.nodeName
                )
            };
        });
        console.log('MERMAID BEFORE Enter:', JSON.stringify(before));

        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const afterEnter2 = await page.evaluate(() => {
            const code = document.querySelector('.mermaid-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                plainText: JSON.stringify(code?.textContent),
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:${JSON.stringify(n.textContent)}` : n.nodeName
                )
            };
        });
        console.log('MERMAID AFTER 2 Enters:', JSON.stringify(afterEnter2));

        // Check markdown
        const md = await page.evaluate(() => window.__testApi.getMarkdown());
        console.log('MERMAID MARKDOWN:', JSON.stringify(md));
    });

    test('Math block: Enter adds text line then empty line', async ({ page }) => {
        // Test adding a text line, then an empty line
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```math\nE = mc^2\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        await page.evaluate(() => {
            const code = document.querySelector('.math-wrapper code');
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

        // Type a new line of content
        await page.keyboard.press('Enter');
        await page.keyboard.type('x^2 + y^2 = r^2');
        await page.waitForTimeout(200);

        const afterText = await page.evaluate(() => {
            const code = document.querySelector('.math-wrapper code');
            return {
                innerHTML: code?.innerHTML,
                plainText: JSON.stringify(code?.textContent),
                childNodes: Array.from(code?.childNodes || []).map(n =>
                    n.nodeType === 3 ? `TEXT:${JSON.stringify(n.textContent)}` : n.nodeName
                )
            };
        });
        console.log('MATH after adding text line:', JSON.stringify(afterText));

        // Check markdown
        const md = await page.evaluate(() => window.__testApi.getMarkdown());
        console.log('MATH MARKDOWN after text:', JSON.stringify(md));
    });
});
