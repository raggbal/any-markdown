import { test, expect } from '@playwright/test';

/**
 * Cross-outliner copy/paste tests.
 *
 * Tests that page metadata and image data survive:
 * 1. Copy within same outliner (existing behavior regression)
 * 2. Copy across outliners via HTML clipboard metadata
 * 3. Single node copy with page/image metadata
 */

test.describe('Cross-outliner copy/paste', () => {

    // ── Outliner standalone tests ──

    test.describe('Standalone outliner', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/standalone-outliner.html');
            await page.waitForFunction(() => (window as any).__testApi?.ready);
        });

        test('copy sends saveOutlinerClipboard message to host', async ({ page }) => {
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1', 'n2'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'Page node', tags: [], isPage: true, pageId: 'page-abc' },
                        n2: { id: 'n2', parentId: null, children: [], text: 'Normal node', tags: [] }
                    }
                });
            });

            // Select both nodes with Cmd+A then Cmd+C
            const firstText = page.locator('.outliner-text').first();
            await firstText.click();
            await page.keyboard.press('Meta+a');
            await page.waitForTimeout(100);
            await page.keyboard.press('Meta+c');
            await page.waitForTimeout(200);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            const saveClipMsg = messages.find((m: any) => m.type === 'saveOutlinerClipboard');
            expect(saveClipMsg).toBeTruthy();
            expect(saveClipMsg.isCut).toBe(false);
            expect(saveClipMsg.nodes).toHaveLength(2);
            expect(saveClipMsg.nodes[0].isPage).toBe(true);
            expect(saveClipMsg.nodes[0].pageId).toBe('page-abc');
        });

        test('cut sends saveOutlinerClipboard with isCut=true', async ({ page }) => {
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1', 'n2'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'Page node', tags: [], isPage: true, pageId: 'page-xyz' },
                        n2: { id: 'n2', parentId: null, children: [], text: 'Other', tags: [] }
                    }
                });
            });

            const firstText = page.locator('.outliner-text').first();
            await firstText.click();
            await page.keyboard.press('Meta+a');
            await page.waitForTimeout(100);
            await page.keyboard.press('Meta+x');
            await page.waitForTimeout(200);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            const saveClipMsg = messages.find((m: any) => m.type === 'saveOutlinerClipboard');
            expect(saveClipMsg).toBeTruthy();
            expect(saveClipMsg.isCut).toBe(true);
            expect(saveClipMsg.nodes[0].pageId).toBe('page-xyz');
        });

        test('single node copy preserves page metadata in internalClipboard', async ({ page }) => {
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'My page', tags: [], isPage: true, pageId: 'p-single', images: ['./img/a.png'] }
                    }
                });
            });

            // Click to focus, then Cmd+C (no text selection = full node copy)
            const textEl = page.locator('.outliner-text').first();
            await textEl.click();
            await page.waitForTimeout(100);
            await page.keyboard.press('Meta+c');
            await page.waitForTimeout(200);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            const saveClipMsg = messages.find((m: any) => m.type === 'saveOutlinerClipboard');
            expect(saveClipMsg).toBeTruthy();
            expect(saveClipMsg.nodes).toHaveLength(1);
            expect(saveClipMsg.nodes[0].isPage).toBe(true);
            expect(saveClipMsg.nodes[0].pageId).toBe('p-single');
            expect(saveClipMsg.nodes[0].images).toEqual(['./img/a.png']);
        });

        test('same-outliner paste uses copyPageFile (not cross)', async ({ page }) => {
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1', 'n2'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'Page node', tags: [], isPage: true, pageId: 'p-same' },
                        n2: { id: 'n2', parentId: null, children: [], text: 'Target', tags: [] }
                    }
                });
            });

            // Select n1, copy, then paste on n2
            const firstText = page.locator('.outliner-text').first();
            await firstText.click();
            await page.waitForTimeout(50);

            // Use Shift+Down to select n1 only
            await page.keyboard.press('Shift+ArrowDown');
            await page.waitForTimeout(100);
            await page.keyboard.press('Meta+c');
            await page.waitForTimeout(200);

            // Focus n2 and paste
            const secondText = page.locator('.outliner-text').nth(1);
            await secondText.click();
            await page.waitForTimeout(50);

            // Simulate paste with clipboardData
            await page.evaluate(() => {
                const textEl = document.querySelector('.outliner-text[data-node-id]') as HTMLElement;
                const allTexts = document.querySelectorAll('.outliner-text');
                const targetEl = allTexts[1] as HTMLElement;
                if (targetEl) {
                    targetEl.focus();
                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData: new DataTransfer(),
                        bubbles: true,
                        cancelable: true
                    });
                    pasteEvent.clipboardData!.setData('text/plain', 'Page node');
                    targetEl.dispatchEvent(pasteEvent);
                }
            });
            await page.waitForTimeout(500);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            // Should use copyPageFile (same-file), not copyPageFileCross
            const copyPageMsg = messages.find((m: any) => m.type === 'copyPageFile');
            const crossMsg = messages.find((m: any) => m.type === 'copyPageFileCross');
            expect(copyPageMsg).toBeTruthy();
            expect(crossMsg).toBeFalsy();
        });

        test('HTML metadata extraction: paste from cross-webview uses data-outliner-clipboard', async ({ page }) => {
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'Target', tags: [] }
                    }
                });
            });

            const textEl = page.locator('.outliner-text').first();
            await textEl.click();
            await page.waitForTimeout(100);

            // Simulate cross-webview paste with HTML metadata
            const metaJson = JSON.stringify({
                nodes: [
                    { text: 'Cross page', level: 0, isPage: true, pageId: 'cross-p1', images: ['./cross/images/img1.png'] }
                ],
                sourcePageDir: './other-file/'
            });
            const htmlData = `<ul data-outliner-clipboard="${encodeURIComponent(metaJson)}"><li>Cross page</li></ul>`;

            await page.evaluate((html) => {
                const targetEl = document.querySelector('.outliner-text') as HTMLElement;
                if (targetEl) {
                    targetEl.focus();
                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData: new DataTransfer(),
                        bubbles: true,
                        cancelable: true
                    });
                    pasteEvent.clipboardData!.setData('text/plain', 'Cross page');
                    pasteEvent.clipboardData!.setData('text/html', html);
                    targetEl.dispatchEvent(pasteEvent);
                }
            }, htmlData);
            await page.waitForTimeout(500);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            // Should use copyPageFileCross because sourcePageDir !== pageDir
            const crossPageMsg = messages.find((m: any) => m.type === 'copyPageFileCross');
            expect(crossPageMsg).toBeTruthy();
            expect(crossPageMsg.sourcePageId).toBe('cross-p1');

            // Should send copyImagesCross
            const crossImgMsg = messages.find((m: any) => m.type === 'copyImagesCross');
            expect(crossImgMsg).toBeTruthy();
            expect(crossImgMsg.images).toEqual(['./cross/images/img1.png']);
        });

        test('external text paste (no metadata) still works normally', async ({ page }) => {
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: '', tags: [] }
                    }
                });
            });

            const textEl = page.locator('.outliner-text').first();
            await textEl.click();
            await page.waitForTimeout(100);

            // Simulate external plain text paste (no metadata)
            await page.evaluate(() => {
                const targetEl = document.querySelector('.outliner-text') as HTMLElement;
                if (targetEl) {
                    targetEl.focus();
                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData: new DataTransfer(),
                        bubbles: true,
                        cancelable: true
                    });
                    pasteEvent.clipboardData!.setData('text/plain', 'Line A\nLine B\nLine C');
                    targetEl.dispatchEvent(pasteEvent);
                }
            });
            await page.waitForTimeout(500);

            // Should create 3 nodes, no cross messages
            const nodeCount = await page.locator('.outliner-node').count();
            expect(nodeCount).toBe(3);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            const crossMsgs = messages.filter((m: any) =>
                m.type === 'copyPageFileCross' || m.type === 'movePageFileCross' || m.type === 'copyImagesCross'
            );
            expect(crossMsgs).toHaveLength(0);
        });

        test('single node cut preserves page/image metadata and removes from source', async ({ page }) => {
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'Cut me', tags: [], isPage: true, pageId: 'p-cut', images: ['./img/cut.png'] }
                    }
                });
            });

            const textEl = page.locator('.outliner-text').first();
            await textEl.click();
            await page.waitForTimeout(100);
            await page.keyboard.press('Meta+x');
            await page.waitForTimeout(200);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            const saveClipMsg = messages.find((m: any) => m.type === 'saveOutlinerClipboard');
            expect(saveClipMsg).toBeTruthy();
            expect(saveClipMsg.isCut).toBe(true);
            expect(saveClipMsg.nodes[0].pageId).toBe('p-cut');
            expect(saveClipMsg.nodes[0].images).toEqual(['./img/cut.png']);

            // Verify source node was cleared
            await page.waitForTimeout(1500);
            const syncData = await page.evaluate(() => {
                const s = (window as any).__testApi.lastSyncData;
                return s ? JSON.parse(s) : null;
            });
            const n1 = syncData?.nodes?.n1;
            expect(n1).toBeTruthy();
            expect(n1.text).toBe('');
            expect(n1.isPage).toBeFalsy();
        });
    });

    // ── Notes mode tests ──

    test.describe('Notes mode (cross-file within same webview)', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/standalone-notes.html');
            await page.waitForFunction(() => (window as any).__testApi?.ready);
        });

        test('copy in file A, switch to file B, paste triggers cross-file messages', async ({ page }) => {
            // Init with fileA data
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'FileA page', tags: [], isPage: true, pageId: 'pA1' }
                    },
                    pageDir: './fileA/'
                });
                (window as any).__testApi.initNotesPanel(
                    [
                        { filePath: '/test/fileA.out', title: 'FileA', id: 'fileA' },
                        { filePath: '/test/fileB.out', title: 'FileB', id: 'fileB' }
                    ],
                    '/test/fileA.out',
                    { version: 1, rootIds: ['fileA', 'fileB'], items: {
                        fileA: { type: 'file', id: 'fileA', title: 'FileA' },
                        fileB: { type: 'file', id: 'fileB', title: 'FileB' }
                    }}
                );
            });

            // Select and copy the page node
            const textEl = page.locator('.outliner-text').first();
            await textEl.click();
            await page.keyboard.press('Meta+a');
            await page.waitForTimeout(100);
            await page.keyboard.press('Meta+c');
            await page.waitForTimeout(200);

            // Clear messages for clean tracking
            await page.evaluate(() => { (window as any).__testApi.messages.length = 0; });

            // Simulate file switch: send updateData with fileB's data
            await page.evaluate(() => {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['nB1'],
                        nodes: {
                            nB1: { id: 'nB1', parentId: null, children: [], text: 'FileB node', tags: [] }
                        },
                        pageDir: './fileB/'
                    },
                    fileChangeId: 1
                });
            });
            await page.waitForTimeout(300);

            // Now paste on fileB's node
            const targetText = page.locator('.outliner-text').first();
            await targetText.click();
            await page.waitForTimeout(100);

            await page.evaluate(() => {
                const targetEl = document.querySelector('.outliner-text') as HTMLElement;
                if (targetEl) {
                    targetEl.focus();
                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData: new DataTransfer(),
                        bubbles: true,
                        cancelable: true
                    });
                    pasteEvent.clipboardData!.setData('text/plain', 'FileA page');
                    targetEl.dispatchEvent(pasteEvent);
                }
            });
            await page.waitForTimeout(500);

            const messages = await page.evaluate(() => (window as any).__testApi.messages);
            // Should use copyPageFileCross because sourcePageDir (./fileA/) !== current pageDir (./fileB/)
            const crossPageMsg = messages.find((m: any) => m.type === 'copyPageFileCross');
            expect(crossPageMsg).toBeTruthy();
            expect(crossPageMsg.sourcePageId).toBe('pA1');
        });
    });
});
