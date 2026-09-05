import { test, expect } from '@playwright/test';

test.describe('outline visibility state', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('closing the outline reports and reflects the closed state', async ({ page }) => {
        await page.evaluate(() => document.getElementById('closeSidebar')?.click());

        await expect(page.locator('#sidebar')).toHaveClass(/\bhidden\b/);
        await expect(page.locator('#openSidebarBtn')).not.toHaveClass(/\bhidden\b/);

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        expect(messages).toContainEqual({ type: 'outlineStateChanged', open: false });
    });

    test('opening the outline reports the state without editing Markdown', async ({ page }) => {
        await page.evaluate(() => document.getElementById('closeSidebar')?.click());
        await page.evaluate(() => {
            (window as any).__testApi.messages = [];
            document.getElementById('openSidebarBtn')?.click();
            document.getElementById('editor')?.blur();
        });

        await expect(page.locator('#sidebar')).not.toHaveClass(/\bhidden\b/);
        await expect(page.locator('#openSidebarBtn')).toHaveClass(/\bhidden\b/);

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        expect(messages).toContainEqual({ type: 'outlineStateChanged', open: true });
        expect(messages.filter((message: { type: string }) => message.type === 'edit')).toEqual([]);
    });
});
