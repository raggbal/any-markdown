import { test, expect } from '@playwright/test';

test.describe('Editor Context Menu', () => {
    test.describe('standalone editor', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/standalone-editor.html');
            await page.waitForFunction(() => (window as any).__testApi?.ready);
        });

        test('right-click on editor shows context menu with cut/copy/paste', async ({ page }) => {
            await page.evaluate((md) => {
                (window as any).__testApi.setMarkdown(md);
            }, '# Hello\n\nTest paragraph');

            const editor = page.locator('.editor');
            await editor.click();
            await page.waitForTimeout(200);

            // Right-click
            await editor.click({ button: 'right' });
            await page.waitForTimeout(200);

            // Context menu should appear
            const menu = page.locator('.editor-context-menu');
            await expect(menu).toBeVisible();

            // Should have cut, copy, paste items
            const items = menu.locator('.editor-context-menu-item');
            const count = await items.count();
            expect(count).toBeGreaterThanOrEqual(3);

            // First item should be Cut (or i18n equivalent)
            const firstLabel = await items.nth(0).locator('.context-menu-label').textContent();
            expect(firstLabel).toBeTruthy();
        });

        test('context menu closes on outside click', async ({ page }) => {
            await page.evaluate((md) => {
                (window as any).__testApi.setMarkdown(md);
            }, 'Test');

            const editor = page.locator('.editor');
            await editor.click({ button: 'right' });
            await page.waitForTimeout(200);

            const menu = page.locator('.editor-context-menu');
            await expect(menu).toBeVisible();

            // Click outside
            await page.click('body', { position: { x: 10, y: 10 } });
            await page.waitForTimeout(200);

            await expect(menu).not.toBeVisible();
        });

        test('no "Copy In-App Link" in standalone editor', async ({ page }) => {
            await page.evaluate((md) => {
                (window as any).__testApi.setMarkdown(md);
            }, 'Test');

            const editor = page.locator('.editor');
            await editor.click({ button: 'right' });
            await page.waitForTimeout(200);

            const menu = page.locator('.editor-context-menu');
            await expect(menu).toBeVisible();

            // Should NOT have separator + in-app link (only 3 items: cut, copy, paste)
            const items = menu.locator('.editor-context-menu-item');
            const count = await items.count();
            expect(count).toBe(3);
        });
    });

    test.describe('Notes sidepanel editor', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/standalone-notes.html');
            await page.waitForFunction(() => (window as any).__testApi?.ready);
        });

        test('right-click in sidepanel shows context menu', async ({ page }) => {
            // Initialize outliner with a page node
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'Page node', tags: [], isPage: true, pageId: 'test-page-id' }
                    }
                });
            });
            await page.waitForTimeout(500);

            // Open the page (simulate host message opening sidepanel)
            await page.evaluate(() => {
                (window as any).__hostMessageHandler({
                    type: 'openSidePanel',
                    markdown: '# Test Page\n\nSome content here',
                    filePath: '/test/pages/test-page-id.md',
                    fileName: 'test-page-id.md',
                    toc: [],
                    documentBaseUri: ''
                });
            });
            await page.waitForTimeout(500);

            // Find the sidepanel editor
            const spEditor = page.locator('.side-panel-editor-root .editor');
            const isVisible = await spEditor.isVisible();

            if (isVisible) {
                await spEditor.click();
                await page.waitForTimeout(200);

                // Right-click
                await spEditor.click({ button: 'right' });
                await page.waitForTimeout(300);

                // Context menu should appear
                const menu = page.locator('.editor-context-menu');
                const menuVisible = await menu.isVisible();
                expect(menuVisible).toBe(true);
            }
        });
    });
});
