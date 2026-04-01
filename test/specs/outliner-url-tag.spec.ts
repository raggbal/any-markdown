import { test, expect } from '@playwright/test';

test.describe('Outliner: URL内の@をタグ化しない', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('URL内の@はタグとして抽出されない (parseTags)', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'https://github.com/@user some text', tags: [] }
                }
            });
        });
        await page.waitForTimeout(1500);
        const syncData = await page.evaluate(() => {
            return (window as any).__testApi.lastSyncData
                ? JSON.parse((window as any).__testApi.lastSyncData)
                : null;
        });
        // URL内の@userはタグとして抽出されないこと
        const node = syncData?.nodes?.n1;
        expect(node?.tags || []).toEqual([]);
    });

    test('URL外の@tagはタグとして抽出される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '@mytag some text', tags: ['@mytag'] }
                }
            });
        });
        // テキストを編集してparseTags発火
        const textEl = page.locator('.outliner-text[data-node-id="n1"]');
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' ');
        await page.waitForTimeout(1500);
        const syncData = await page.evaluate(() => {
            return (window as any).__testApi.lastSyncData
                ? JSON.parse((window as any).__testApi.lastSyncData)
                : null;
        });
        const node = syncData?.nodes?.n1;
        expect(node?.tags).toContain('@mytag');
    });

    test('URL内の@はblur時にタグハイライトされない (renderInlineText)', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'check https://example.com/@user here', tags: [] }
                }
            });
        });
        // blur状態（renderInlineText）のDOMを確認
        const tagSpans = await page.locator('.outliner-text[data-node-id="n1"] .outliner-tag').count();
        expect(tagSpans).toBe(0);
    });

    test('URL外の@tagはblur時にタグハイライトされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '@hello world', tags: [] }
                }
            });
        });
        const tagSpans = await page.locator('.outliner-text[data-node-id="n1"] .outliner-tag').count();
        expect(tagSpans).toBe(1);
    });

    test('URL内の@はfocus時にもタグハイライトされない (renderEditingText)', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'see https://x.com/@name for details', tags: [] }
                }
            });
        });
        // focus状態にする（renderEditingText）
        const textEl = page.locator('.outliner-text[data-node-id="n1"]');
        await textEl.click();
        await page.waitForTimeout(200);
        const tagSpans = await page.locator('.outliner-text[data-node-id="n1"] .outliner-tag').count();
        expect(tagSpans).toBe(0);
    });

    test('Markdownリンク内のURL中の@はタグ化しない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '[profile](https://example.com/@user)', tags: [] }
                }
            });
        });
        const tagSpans = await page.locator('.outliner-text[data-node-id="n1"] .outliner-tag').count();
        expect(tagSpans).toBe(0);
    });

    test('URLと@tagが共存する場合、URL外のtagのみタグ化される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '@real https://x.com/@fake @also', tags: [] }
                }
            });
        });
        // blur状態で確認
        const tagTexts = await page.evaluate(() => {
            const tags = document.querySelectorAll('.outliner-text[data-node-id="n1"] .outliner-tag');
            return Array.from(tags).map(el => el.textContent);
        });
        expect(tagTexts).toEqual(['@real', '@also']);
    });
});
