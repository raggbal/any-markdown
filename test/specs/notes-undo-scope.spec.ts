/**
 * Notes Undo/Redo スコープ分離テスト
 * sidepanel markdown が開いている時は markdown のみ undo/redo が効くことを検証
 */

import { test, expect } from '@playwright/test';

test.describe('Notes Undo/Redo スコープ分離', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-notes.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('sidepanel markdown 編集中に Cmd+Z を押しても outliner の undo は発火しない', async ({ page }) => {
        // 1. Outliner にデータを初期化
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'ノード1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'ノード2', tags: [] }
                }
            });
        });

        // 2. Outliner でテキストを編集してスナップショット生成
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('X');
        await page.waitForTimeout(600); // デバウンス待ち

        // 3. 編集後のテキストを確認
        const textAfterEdit = await page.locator('.outliner-text').first().textContent();
        expect(textAfterEdit).toContain('X');

        // 4. sidepanel を開く（ホストからのメッセージをシミュレート）
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'openSidePanel',
                markdown: '# Test Page\n\nHello world',
                filePath: '/test/pages/test.md',
                fileName: 'test.md',
                toc: [],
                documentBaseUri: ''
            });
        });
        await page.waitForTimeout(300);

        // 5. sidepanel の editor にフォーカス
        const sidePanelEditor = page.locator('.side-panel .editor');
        await sidePanelEditor.click();
        await page.waitForTimeout(100);

        // 6. sidepanel で何か編集
        await page.keyboard.type('sidepanel edit');
        await page.waitForTimeout(200);

        // 7. Cmd+Z を押す（sidepanel に focus がある状態）
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        // 8. outliner のテキストは変わっていないことを確認
        //    （outliner の undo が発火していなければ、テキストは編集後のまま）
        const textAfterUndo = await page.locator('.outliner-text').first().textContent();
        expect(textAfterUndo).toContain('X');
    });

    test('sidepanel が閉じている時は outliner の Cmd+Z が動作する', async ({ page }) => {
        // 1. Outliner にデータを初期化
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '元テキスト', tags: [] }
                }
            });
        });

        // 2. テキストを編集
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('追加');
        await page.waitForTimeout(200);

        const textAfterEdit = await page.locator('.outliner-text').first().textContent();
        expect(textAfterEdit).toContain('元テキスト追加');

        // 3. 検索バーにフォーカスを移す（outliner-text 外だが sidepanel も閉じている状態）
        const searchInput = page.locator('.outliner-search-input');
        await searchInput.click();
        await page.waitForTimeout(100);

        // 4. Cmd+Z → outliner の undo が動作するはず
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        // 5. テキストが元に戻っていることを確認
        const textAfterUndo = await page.locator('.outliner-text').first().textContent();
        expect(textAfterUndo).toBe('元テキスト');
    });

    test('sidepanel を閉じた後は outliner の Cmd+Z が正常に動作する', async ({ page }) => {
        // 1. Outliner にデータを初期化
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '元テキスト', tags: [] }
                }
            });
        });

        // 2. テキストを編集
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('追加');
        await page.waitForTimeout(200);

        // 3. sidepanel を開く
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'openSidePanel',
                markdown: '# Test',
                filePath: '/test/pages/test.md',
                fileName: 'test.md',
                toc: [],
                documentBaseUri: ''
            });
        });
        await page.waitForTimeout(300);

        // 4. sidepanel を閉じる（Escape）
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // 5. 検索バーにフォーカス
        const searchInput = page.locator('.outliner-search-input');
        await searchInput.click();
        await page.waitForTimeout(100);

        // 6. Cmd+Z → sidepanel が閉じているので outliner undo が動作するはず
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        // 7. テキストが元に戻っていることを確認
        const textAfterUndo = await page.locator('.outliner-text').first().textContent();
        expect(textAfterUndo).toBe('元テキスト');
    });
});
