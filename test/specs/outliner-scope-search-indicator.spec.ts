/**
 * Outliner Scope 検索インジケーターテスト
 * scope in 時に検索ボックスの placeholder が変わり、scope out 時に元に戻ることを検証
 */

import { test, expect } from '@playwright/test';

test.describe('Scope 検索インジケーター (placeholder)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('初期状態では通常の placeholder', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2'], text: '親ノード', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: '子ノード', tags: [] }
                }
            });
        });

        const searchInput = page.locator('.outliner-search-input');
        const placeholder = await searchInput.getAttribute('placeholder');
        // デフォルト placeholder は "Search in scope" ではない
        expect(placeholder).not.toContain('scope');
        expect(placeholder).not.toContain('スコープ');
    });

    test('scope in すると placeholder が "Search in scope" に変わる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2'], text: '親ノード', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: '子ノード', tags: [] }
                }
            });
        });

        // scope in（Cmd+]）
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('Meta+]');
        await page.waitForTimeout(200);

        const searchInput = page.locator('.outliner-search-input');
        const placeholder = await searchInput.getAttribute('placeholder');
        // scope 関連の placeholder に変わっている
        expect(placeholder).toBeTruthy();
        expect(placeholder!.toLowerCase()).toContain('scope');
    });

    test('scope out すると placeholder が元に戻る', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2'], text: '親ノード', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: '子ノード', tags: [] }
                }
            });
        });

        // 元の placeholder を保存
        const searchInput = page.locator('.outliner-search-input');
        const originalPlaceholder = await searchInput.getAttribute('placeholder');

        // scope in
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('Meta+]');
        await page.waitForTimeout(200);

        // placeholder が変わったことを確認
        const scopedPlaceholder = await searchInput.getAttribute('placeholder');
        expect(scopedPlaceholder).not.toBe(originalPlaceholder);

        // scope out（Cmd+Shift+]）
        await page.keyboard.press('Meta+Shift+]');
        await page.waitForTimeout(200);

        // placeholder が元に戻ったことを確認
        const restoredPlaceholder = await searchInput.getAttribute('placeholder');
        expect(restoredPlaceholder).toBe(originalPlaceholder);
    });
});
