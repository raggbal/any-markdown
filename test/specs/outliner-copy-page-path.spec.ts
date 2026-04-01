import { test, expect } from '@playwright/test';

test.describe('Outliner Copy Page Path', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // --- ヘルパー ---
    async function initWithPageNodes(page: any) {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2', 'n3', 'n4'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Normal node', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Page node A', tags: [], isPage: true, pageId: 'page-id-aaa' },
                    n3: { id: 'n3', parentId: null, children: [], text: 'Page node B', tags: [], isPage: true, pageId: 'page-id-bbb' },
                    n4: { id: 'n4', parentId: null, children: [], text: 'Another normal', tags: [] }
                }
            });
        });
    }

    function getMessages(page: any) {
        return page.evaluate(() => (window as any).__testApi.messages);
    }

    function getCopyPagePathsMessages(messages: any[]) {
        return messages.filter((m: any) => m.type === 'copyPagePaths');
    }

    // === コンテキストメニュー: 単一ノード ===

    test('ページノードの右クリックメニューに Copy Page Path が表示される', async ({ page }) => {
        await initWithPageNodes(page);
        const pageNode = page.locator('.outliner-node[data-id="n2"] .outliner-text');
        await pageNode.click({ button: 'right' });
        const menuItems = page.locator('.outliner-context-menu-item .context-menu-label');
        const texts = await menuItems.allTextContents();
        expect(texts).toContain('Copy Page Path');
    });

    test('非ページノードの右クリックメニューに Copy Page Path が表示されない', async ({ page }) => {
        await initWithPageNodes(page);
        const normalNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await normalNode.click({ button: 'right' });
        const menuItems = page.locator('.outliner-context-menu-item .context-menu-label');
        const texts = await menuItems.allTextContents();
        expect(texts).not.toContain('Copy Page Path');
    });

    test('Copy Page Path クリックで copyPagePaths メッセージが送信される', async ({ page }) => {
        await initWithPageNodes(page);
        const pageNode = page.locator('.outliner-node[data-id="n2"] .outliner-text');
        await pageNode.click({ button: 'right' });

        // メニュー項目をクリック
        const menuItem = page.locator('.outliner-context-menu-item .context-menu-label', { hasText: 'Copy Page Path' });
        await menuItem.click();

        const messages = await getMessages(page);
        const copyMsgs = getCopyPagePathsMessages(messages);
        expect(copyMsgs).toHaveLength(1);
        expect(copyMsgs[0].pageIds).toEqual(['page-id-aaa']);
    });

    test('Copy Page Path のショートカット表示が正しい', async ({ page }) => {
        await initWithPageNodes(page);
        const pageNode = page.locator('.outliner-node[data-id="n2"] .outliner-text');
        await pageNode.click({ button: 'right' });

        // ショートカット表示を確認
        const menuItems = page.locator('.outliner-context-menu-item');
        const count = await menuItems.count();
        let found = false;
        for (let i = 0; i < count; i++) {
            const label = await menuItems.nth(i).locator('.context-menu-label').textContent();
            if (label === 'Copy Page Path') {
                const shortcut = await menuItems.nth(i).locator('.context-menu-shortcut').textContent();
                // Mac or Windows
                expect(shortcut).toMatch(/Cmd\+Shift\+C|Ctrl\+Shift\+C/);
                found = true;
                break;
            }
        }
        expect(found).toBe(true);
    });

    // === キーボードショートカット: 単一ノード ===

    test('Cmd+Shift+C でページノードの copyPagePaths メッセージが送信される', async ({ page }) => {
        await initWithPageNodes(page);
        const pageNode = page.locator('.outliner-node[data-id="n2"] .outliner-text');
        await pageNode.click();
        await page.waitForTimeout(200);

        // dispatchEvent で直接 keydown を発火（headless Chromiumのキー入力問題回避）
        await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-node[data-id="n2"] .outliner-text');
            if (textEl) {
                textEl.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'C', code: 'KeyC', keyCode: 67,
                    ctrlKey: true, shiftKey: true, metaKey: false,
                    bubbles: true, cancelable: true
                }));
            }
        });
        await page.waitForTimeout(200);

        const messages = await getMessages(page);
        const copyMsgs = getCopyPagePathsMessages(messages);
        expect(copyMsgs).toHaveLength(1);
        expect(copyMsgs[0].pageIds).toEqual(['page-id-aaa']);
    });

    test('Cmd+Shift+C で非ページノードでは何も送信されない', async ({ page }) => {
        await initWithPageNodes(page);
        const normalNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await normalNode.click();
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-node[data-id="n1"] .outliner-text');
            if (textEl) {
                textEl.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'C', code: 'KeyC', keyCode: 67,
                    ctrlKey: true, shiftKey: true, metaKey: false,
                    bubbles: true, cancelable: true
                }));
            }
        });
        await page.waitForTimeout(200);

        const messages = await getMessages(page);
        const copyMsgs = getCopyPagePathsMessages(messages);
        expect(copyMsgs).toHaveLength(0);
    });

    // === 複数選択時: Cmd+Shift+C ===

    test('複数選択時に Cmd+Shift+C で全ページノードの pageId が送信される', async ({ page }) => {
        await initWithPageNodes(page);

        // n1にフォーカスしてCmd+Aで全選択
        const firstNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await firstNode.click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);

        // Cmd+Shift+C
        await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-node[data-id="n1"] .outliner-text');
            if (textEl) {
                textEl.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'C', code: 'KeyC', keyCode: 67,
                    ctrlKey: true, shiftKey: true, metaKey: false,
                    bubbles: true, cancelable: true
                }));
            }
        });
        await page.waitForTimeout(200);

        const messages = await getMessages(page);
        const copyMsgs = getCopyPagePathsMessages(messages);
        expect(copyMsgs).toHaveLength(1);
        // DOM表示順: n2(page-id-aaa), n3(page-id-bbb) のみ
        expect(copyMsgs[0].pageIds).toEqual(['page-id-aaa', 'page-id-bbb']);
    });

    test('複数選択時に非ページノードのみの場合は何も送信されない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Normal A', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Normal B', tags: [] }
                }
            });
        });

        const firstNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await firstNode.click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-node[data-id="n1"] .outliner-text');
            if (textEl) {
                textEl.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'C', code: 'KeyC', keyCode: 67,
                    ctrlKey: true, shiftKey: true, metaKey: false,
                    bubbles: true, cancelable: true
                }));
            }
        });
        await page.waitForTimeout(200);

        const messages = await getMessages(page);
        const copyMsgs = getCopyPagePathsMessages(messages);
        expect(copyMsgs).toHaveLength(0);
    });

    // === 複数選択時: コンテキストメニュー ===

    test('複数選択中にページノードがあれば右クリックメニューに Copy Page Path が表示される', async ({ page }) => {
        await initWithPageNodes(page);

        // 全選択
        const firstNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await firstNode.click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);

        // 右クリック
        const anyNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await anyNode.click({ button: 'right' });

        const menuItems = page.locator('.outliner-context-menu-item .context-menu-label');
        const texts = await menuItems.allTextContents();
        expect(texts).toContain('Copy Page Path');
    });

    test('複数選択中にページノードがなければ Copy Page Path が表示されない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Normal A', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Normal B', tags: [] }
                }
            });
        });

        const firstNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await firstNode.click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);

        await firstNode.click({ button: 'right' });

        const menuItems = page.locator('.outliner-context-menu-item .context-menu-label');
        const texts = await menuItems.allTextContents();
        expect(texts).not.toContain('Copy Page Path');
    });

    test('複数選択中の Copy Page Path クリックで全ページノードの pageId が送信される', async ({ page }) => {
        await initWithPageNodes(page);

        // 全選択
        const firstNode = page.locator('.outliner-node[data-id="n1"] .outliner-text');
        await firstNode.click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);

        // 右クリック
        await firstNode.click({ button: 'right' });

        // Copy Page Path をクリック
        const menuItem = page.locator('.outliner-context-menu-item .context-menu-label', { hasText: 'Copy Page Path' });
        await menuItem.click();

        const messages = await getMessages(page);
        const copyMsgs = getCopyPagePathsMessages(messages);
        expect(copyMsgs).toHaveLength(1);
        expect(copyMsgs[0].pageIds).toEqual(['page-id-aaa', 'page-id-bbb']);
    });
});
