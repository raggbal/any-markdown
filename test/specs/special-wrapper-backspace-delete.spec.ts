import { test, expect } from '@playwright/test';

test.describe('Empty Mermaid/Math block deletion with Backspace', () => {
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

    test('Backspace in empty mermaid block should convert to paragraph', async ({ page }) => {
        // Set markdown with a mermaid block
        await page.evaluate(() => {
            window.__testApi.setMarkdown('# Test\n\n```mermaid\ngraph TD\n    A --> B\n```\n');
        });
        await page.waitForTimeout(500);

        // Verify mermaid wrapper exists
        const hasMermaidWrapper = await page.evaluate(() => {
            return !!document.querySelector('.mermaid-wrapper');
        });
        expect(hasMermaidWrapper).toBe(true);

        // Enter edit mode by clicking on the mermaid wrapper
        const result = await page.evaluate(async () => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            if (!wrapper) return { error: 'no wrapper' };

            // Enter edit mode
            const pre = wrapper.querySelector('pre[data-lang="mermaid"]');
            const code = pre?.querySelector('code');
            if (!code) return { error: 'no code element' };

            // Simulate entering edit mode
            wrapper.setAttribute('data-mode', 'edit');
            if (pre) pre.style.display = 'block';
            const diagram = wrapper.querySelector('.mermaid-diagram');
            if (diagram) diagram.style.display = 'none';
            pre.setAttribute('data-mode', 'edit');
            code.setAttribute('contenteditable', 'true');

            // Clear all content to make it empty
            code.innerHTML = '<br>';

            // Set cursor inside the empty code element
            const range = document.createRange();
            range.setStart(code, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            await new Promise(r => setTimeout(r, 100));

            return {
                mode: wrapper.getAttribute('data-mode'),
                codeContent: code.textContent,
                codeHTML: code.innerHTML
            };
        });
        console.log('After clearing content:', result);

        // Press Backspace
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);

        // The mermaid wrapper should be replaced with a paragraph
        const afterBackspace = await page.evaluate(() => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            const editor = document.getElementById('editor');
            const children = Array.from(editor.children).map(c => ({
                tag: c.tagName.toLowerCase(),
                className: c.className || '',
                text: c.textContent?.substring(0, 50)
            }));
            return {
                hasMermaidWrapper: !!wrapper,
                children: children
            };
        });
        console.log('After backspace:', JSON.stringify(afterBackspace));

        // Mermaid wrapper should be gone
        expect(afterBackspace.hasMermaidWrapper).toBe(false);
        // Should have a paragraph instead
        const lastChild = afterBackspace.children[afterBackspace.children.length - 1];
        expect(lastChild.tag).toBe('p');
    });

    test('Backspace in empty math block should convert to paragraph', async ({ page }) => {
        // Set markdown with a math block
        await page.evaluate(() => {
            window.__testApi.setMarkdown('# Test\n\n```math\nE = mc^2\n```\n');
        });
        await page.waitForTimeout(1000);

        // Verify math wrapper exists
        const hasMathWrapper = await page.evaluate(() => {
            return !!document.querySelector('.math-wrapper');
        });
        expect(hasMathWrapper).toBe(true);

        // Enter edit mode and clear content
        const result = await page.evaluate(async () => {
            const wrapper = document.querySelector('.math-wrapper');
            if (!wrapper) return { error: 'no wrapper' };

            const pre = wrapper.querySelector('pre[data-lang="math"]');
            const code = pre?.querySelector('code');
            if (!code) return { error: 'no code element' };

            // Enter edit mode
            wrapper.setAttribute('data-mode', 'edit');
            if (pre) pre.style.display = 'block';
            const display = wrapper.querySelector('.math-display');
            if (display) display.style.display = 'none';
            pre.setAttribute('data-mode', 'edit');
            code.setAttribute('contenteditable', 'true');

            // Clear all content
            code.innerHTML = '<br>';

            // Set cursor
            const range = document.createRange();
            range.setStart(code, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            await new Promise(r => setTimeout(r, 100));

            return {
                mode: wrapper.getAttribute('data-mode'),
                codeContent: code.textContent,
                codeHTML: code.innerHTML
            };
        });
        console.log('After clearing math content:', result);

        // Press Backspace
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);

        // The math wrapper should be replaced with a paragraph
        const afterBackspace = await page.evaluate(() => {
            const wrapper = document.querySelector('.math-wrapper');
            const editor = document.getElementById('editor');
            const children = Array.from(editor.children).map(c => ({
                tag: c.tagName.toLowerCase(),
                className: c.className || '',
                text: c.textContent?.substring(0, 50)
            }));
            return {
                hasMathWrapper: !!wrapper,
                children: children
            };
        });
        console.log('After backspace on math:', JSON.stringify(afterBackspace));

        expect(afterBackspace.hasMathWrapper).toBe(false);
        const lastChild = afterBackspace.children[afterBackspace.children.length - 1];
        expect(lastChild.tag).toBe('p');
    });

    test('Backspace in non-empty mermaid block should NOT delete the block', async ({ page }) => {
        // Set markdown with a mermaid block
        await page.evaluate(() => {
            window.__testApi.setMarkdown('# Test\n\n```mermaid\ngraph TD\n    A --> B\n```\n');
        });
        await page.waitForTimeout(500);

        // Enter edit mode but keep content
        await page.evaluate(async () => {
            const wrapper = document.querySelector('.mermaid-wrapper');
            if (!wrapper) return;

            const pre = wrapper.querySelector('pre[data-lang="mermaid"]');
            const code = pre?.querySelector('code');
            if (!code) return;

            // Enter edit mode
            wrapper.setAttribute('data-mode', 'edit');
            if (pre) pre.style.display = 'block';
            const diagram = wrapper.querySelector('.mermaid-diagram');
            if (diagram) diagram.style.display = 'none';
            pre.setAttribute('data-mode', 'edit');
            code.setAttribute('contenteditable', 'true');

            // Set cursor at beginning (don't clear content)
            const range = document.createRange();
            range.setStart(code, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            await new Promise(r => setTimeout(r, 100));
        });

        // Press Backspace at beginning of non-empty block
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);

        // The mermaid wrapper should still exist
        const afterBackspace = await page.evaluate(() => {
            return !!document.querySelector('.mermaid-wrapper');
        });
        expect(afterBackspace).toBe(true);
    });
});
