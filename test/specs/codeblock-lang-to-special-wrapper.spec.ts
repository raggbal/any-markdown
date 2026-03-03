import { test, expect } from '@playwright/test';

test.describe('Code block language change to mermaid/math creates clickable special wrapper', () => {
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

    test('mermaid wrapper converted from code block enters edit mode on click', async ({ page }) => {
        // 1. Create a code block
        const editor = page.locator('#editor');
        await editor.click();
        await page.keyboard.type('```');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // 2. Verify code block exists
        const preCount = await page.locator('#editor pre').count();
        expect(preCount).toBeGreaterThan(0);

        // 3. Click the language tag to show language selector
        const langTag = page.locator('#editor .code-lang-tag').first();
        await langTag.click();
        await page.waitForTimeout(300);

        // 4. Select "mermaid" from the language selector
        const mermaidItem = page.locator('.lang-selector-item', { hasText: 'mermaid' });
        await mermaidItem.click();
        await page.waitForTimeout(500);

        // 5. Verify mermaid-wrapper was created
        const wrapperCount = await page.locator('#editor .mermaid-wrapper').count();
        expect(wrapperCount).toBe(1);

        // 6. The wrapper should be in display mode
        const wrapper = page.locator('#editor .mermaid-wrapper');
        const mode = await wrapper.getAttribute('data-mode');
        expect(mode).toBe('display');

        // 7. Click on the wrapper to enter edit mode
        await wrapper.click();
        await page.waitForTimeout(300);

        // 8. Verify it entered edit mode
        const modeAfterClick = await wrapper.getAttribute('data-mode');
        expect(modeAfterClick).toBe('edit');
    });

    test('math wrapper converted from code block enters edit mode on click', async ({ page }) => {
        // 1. Create a code block
        const editor = page.locator('#editor');
        await editor.click();
        await page.keyboard.type('```');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // 2. Click the language tag
        const langTag = page.locator('#editor .code-lang-tag').first();
        await langTag.click();
        await page.waitForTimeout(300);

        // 3. Select "math" from the language selector
        const mathItem = page.locator('.lang-selector-item', { hasText: /^math$/ });
        await mathItem.click();
        await page.waitForTimeout(500);

        // 4. Verify math-wrapper was created
        const wrapperCount = await page.locator('#editor .math-wrapper').count();
        expect(wrapperCount).toBe(1);

        // 5. The wrapper should be in display mode
        const wrapper = page.locator('#editor .math-wrapper');
        const mode = await wrapper.getAttribute('data-mode');
        expect(mode).toBe('display');

        // 6. Click on the wrapper to enter edit mode
        await wrapper.click();
        await page.waitForTimeout(300);

        // 7. Verify it entered edit mode
        const modeAfterClick = await wrapper.getAttribute('data-mode');
        expect(modeAfterClick).toBe('edit');
    });

    test('mermaid wrapper converted from code block exits edit mode on focusout', async ({ page }) => {
        // 1. Create a code block and convert to mermaid
        const editor = page.locator('#editor');
        await editor.click();
        await page.keyboard.type('```');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        const langTag = page.locator('#editor .code-lang-tag').first();
        await langTag.click();
        await page.waitForTimeout(300);

        const mermaidItem = page.locator('.lang-selector-item', { hasText: 'mermaid' });
        await mermaidItem.click();
        await page.waitForTimeout(500);

        // 2. Click wrapper to enter edit mode
        const wrapper = page.locator('#editor .mermaid-wrapper');
        await wrapper.click();
        await page.waitForTimeout(300);
        expect(await wrapper.getAttribute('data-mode')).toBe('edit');

        // 3. Click outside the wrapper (on the paragraph after it)
        // First create a paragraph after it
        const paragraphs = page.locator('#editor > p');
        if (await paragraphs.count() > 0) {
            await paragraphs.first().click();
        } else {
            // Click at end of editor
            await editor.click({ position: { x: 10, y: 500 } });
        }
        await page.waitForTimeout(300);

        // 4. Verify it returned to display mode
        const modeAfterFocusout = await wrapper.getAttribute('data-mode');
        expect(modeAfterFocusout).toBe('display');
    });
});
