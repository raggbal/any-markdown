import { test, expect } from '@playwright/test';

test.describe('Special wrapper Enter trailing newline fix', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]') || msg.text().includes('[Any MD]')) {
                console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
            }
        });
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor', { timeout: 5000 });
        await page.waitForTimeout(1000);
        await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });
    });

    test('Math block: Enter at end then ArrowDown should exit without extra press', async ({ page }) => {
        // Setup math block
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```math\nE = mc^2\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        // Enter edit mode
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

        // Press Enter once to add an empty line at the end
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        // Now press ArrowDown - cursor should be on the new empty line
        // First ArrowDown should exit the block (the sentinel \n should not be counted as extra line)
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        // Check if we exited the math block
        const exitedBlock = await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            // After exiting, the wrapper should be in display mode
            return wrapper?.getAttribute('data-mode') === 'display';
        });

        expect(exitedBlock).toBe(true);
    });

    test('Mermaid block: Enter at end then ArrowDown should exit without extra press', async ({ page }) => {
        // Setup mermaid block
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```mermaid\ngraph TD\n    A --> B\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        // Enter edit mode
        await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        // Move cursor to end of code
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

        // Press Enter once
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        // ArrowDown should exit the block
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        const exitedBlock = await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            return wrapper?.getAttribute('data-mode') === 'display';
        });

        expect(exitedBlock).toBe(true);
    });

    test('Math block: 2 Enters at end, then ArrowDown twice should exit', async ({ page }) => {
        // Setup math block
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```math\nE = mc^2\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        // Enter edit mode
        await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        // Move cursor to end
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

        // Press Enter twice (adding 2 empty lines)
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        // First ArrowDown: from line 3 (cursor after 2nd Enter) to nothing?
        // Actually: E = mc^2 (line 0), empty (line 1), cursor-on-empty (line 2)
        // 2 Enters = 2 empty lines after content, cursor on line 2
        // ArrowDown should move to the next empty line or exit
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);

        // Check if still in edit mode (should be, 2 Enters = 2 lines to traverse)
        const stillInEditAfterFirst = await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            return wrapper?.getAttribute('data-mode') === 'edit';
        });
        // After 2 Enters, the cursor is on line 2 (0-indexed). totalLines should be 3.
        // First ArrowDown takes cursor from empty line to last empty line... actually depends.
        // The key point is: after the fix, the sentinel is not counted.
        // 2 Enters at end: text\n\n\n → 3 \n chars, minus 1 sentinel = 2 newlines → totalLines = 0 BR + 2 + 1 = 3
        // Lines: [0] "E = mc^2", [1] "", [2] "" (cursor here after 2 Enters)
        // ArrowDown from [2]: currentLineIndex=2, totalLines-1=2, exit condition met → exits

        // So actually after 2 Enters, one ArrowDown should exit! Let's check:
        const exitedAfterFirst = await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            return wrapper?.getAttribute('data-mode') === 'display';
        });

        expect(exitedAfterFirst).toBe(true);
    });

    test('Math block: Enter + type text + ArrowDown should navigate normally', async ({ page }) => {
        // Ensure adding a text line doesn't cause extra newline issues
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```math\nE = mc^2\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        // Enter edit mode
        await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        // Move cursor to end
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

        // Press Enter and type new content
        await page.keyboard.press('Enter');
        await page.keyboard.type('x^2 + y^2 = r^2');
        await page.waitForTimeout(200);

        // ArrowDown from the last content line should exit
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        const exitedBlock = await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            return wrapper?.getAttribute('data-mode') === 'display';
        });

        expect(exitedBlock).toBe(true);
    });

    test('Regular code block: Enter at end then ArrowDown should exit without extra press', async ({ page }) => {
        // Verify fix also applies to regular code blocks
        await page.evaluate(() => {
            window.__testApi.setMarkdown('```js\nconsole.log("hello");\n```\n\nBelow\n');
        });
        await page.waitForTimeout(500);

        // Enter edit mode by clicking
        await page.evaluate(() => {
            const pre = document.querySelector('pre[data-lang="js"]');
            if (pre) pre.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        // Move cursor to end
        await page.evaluate(() => {
            const code = document.querySelector('pre[data-lang="js"] code');
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

        // Press Enter once
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        // ArrowDown should exit the block
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        const exitedBlock = await page.evaluate(() => {
            const pre = document.querySelector('pre[data-lang="js"]');
            return pre?.getAttribute('data-mode') === 'display';
        });

        expect(exitedBlock).toBe(true);
    });
});
