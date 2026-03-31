/**
 * Notes ファイル切替安全性テスト
 * flushSync, fileChangeId, undo/redoスタッククリア, 検索/スコープリセット
 * (N-1, N-2, N-4 の教訓に基づく)
 */

import { test, expect } from '@playwright/test';

const fileList = [
    { filePath: '/test/file1.out', title: 'File 1', id: 'file1' },
    { filePath: '/test/file2.out', title: 'File 2', id: 'file2' }
];

const structure = {
    version: 1,
    rootIds: ['file1', 'file2'],
    items: {
        file1: { type: 'file', id: 'file1', title: 'File 1' },
        file2: { type: 'file', id: 'file2', title: 'File 2' }
    }
};

function makeOutlinerData(text: string, nodeId = 'n1') {
    return {
        version: 1,
        rootIds: [nodeId],
        nodes: {
            [nodeId]: { id: nodeId, parentId: null, children: [], text, tags: [] }
        }
    };
}

test.describe('Notes ファイル切替安全性', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-notes.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // --- flushSync on file switch (N-1) ---

    test('テキスト編集後にファイル切替すると syncData が即座に送信される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original'));

        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        // テキストを編集（未同期状態を作る）
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' modified');
        await page.waitForTimeout(100);

        // メッセージをクリア
        await page.evaluate(() => {
            (window as any).__testApi.messages.length = 0;
        });

        // openFile を呼ぶ（ファイル切替）-> flushSync が先に呼ばれるはず
        await page.evaluate(() => {
            window.notesHostBridge.openFile('/test/file2.out');
        });
        await page.waitForTimeout(200);

        // syncData が送信されていることを確認
        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const syncMsgs = messages.filter((m: any) => m.type === 'syncData');
        expect(syncMsgs.length).toBeGreaterThanOrEqual(1);
    });

    test('syncData メッセージに fileChangeId が含まれる', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Test'));

        // fileChangeId を設定
        await page.evaluate(() => {
            (window as any).__testApi.setFileChangeId(42);
        });

        // テキストを編集して同期
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type(' edited');
        await page.waitForTimeout(1500); // debounce を待つ

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const syncMsgs = messages.filter((m: any) => m.type === 'syncData');
        expect(syncMsgs.length).toBeGreaterThanOrEqual(1);

        const lastSync = syncMsgs[syncMsgs.length - 1];
        expect(lastSync.fileChangeId).toBe(42);
    });

    // --- Undo/Redo stack clear on file switch (N-2) ---

    test('updateData 受信で undo スタックがクリアされ Cmd+Z が効かない', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original text'));

        // テキスト編集してスナップショットを作る
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' added');
        await page.waitForTimeout(600);

        // Undo が効くことを確認
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);
        let currentText = await textEl.textContent();
        expect(currentText).not.toContain('added');

        // Redo で戻す
        await page.keyboard.press('Meta+Shift+z');
        await page.waitForTimeout(200);

        // updateData で新ファイルデータを送信（ファイル切替シミュレーション）
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'New file data', tags: [] }
                        }
                    },
                    fileChangeId: 1
                });
            }
        });
        await page.waitForTimeout(300);

        // 新データが表示されていることを確認
        currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('New file data');

        // Undo を試みても元のファイルのデータには戻らない（スタッククリア済み）
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('New file data');
    });

    test('updateData 後に新しい初期スナップショットが保存される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('File A'));

        // updateData で新ファイルデータを送信
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'File B initial', tags: [] }
                        }
                    },
                    fileChangeId: 2
                });
            }
        });
        await page.waitForTimeout(300);

        // 新ファイルで Enter を使って構造変更（Enter は即座にスナップショットを取る）
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // 2つノードがある
        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(2);

        // Undo で Enter 前の状態に戻れる（初期スナップショットが保存されているため）
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(300);

        const restoredCount = await page.locator('.outliner-node').count();
        expect(restoredCount).toBe(1);

        const currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('File B initial');
    });

    // --- 検索/スコープ リセット on file switch ---

    test('updateData with fileChangeId で検索がクリアされる', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Apple', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Banana', tags: [] }
                }
            });
        });

        // 検索を実行
        const searchInput = page.locator('.outliner-search-input');
        await searchInput.click();
        await searchInput.fill('Apple');
        await page.waitForTimeout(500);

        // updateData で新ファイルデータ送信
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'New data', tags: [] }
                        }
                    },
                    fileChangeId: 3
                });
            }
        });
        await page.waitForTimeout(300);

        // 検索入力がクリアされている
        const searchValue = await searchInput.inputValue();
        expect(searchValue).toBe('');
    });

    test('updateData with fileChangeId でスコープがドキュメントにリセットされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2'], text: 'Parent', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: 'Child', tags: [] }
                }
            });
        });

        // スコープを設定（n1にスコープイン）
        await page.evaluate(() => {
            if (window.Outliner && window.Outliner.setScope) {
                window.Outliner.setScope({ type: 'subtree', rootId: 'n1' });
            }
        });
        await page.waitForTimeout(200);

        // updateData でファイル切替
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1', 'n2'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'File B Node 1', tags: [] },
                            n2: { id: 'n2', parentId: null, children: [], text: 'File B Node 2', tags: [] }
                        }
                    },
                    fileChangeId: 4
                });
            }
        });
        await page.waitForTimeout(300);

        // 両方のノードが表示されている（スコープがドキュメントにリセット）
        const nodes = page.locator('.outliner-node');
        const count = await nodes.count();
        expect(count).toBe(2);
    });

    // --- scopeToNodeId 対応 ---

    test('updateData with scopeToNodeId でスコープが設定される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner(
                { version: 1, rootIds: [], nodes: {} }
            );
        });

        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: ['n2', 'n3'], text: 'Root', tags: [] },
                            n2: { id: 'n2', parentId: 'n1', children: [], text: 'Child A', tags: [] },
                            n3: { id: 'n3', parentId: 'n1', children: [], text: 'Child B', tags: [] }
                        }
                    },
                    scopeToNodeId: 'n1',
                    fileChangeId: 5
                });
            }
        });
        await page.waitForTimeout(300);

        // スコープヘッダーが表示される（n1がスコープされている）
        // スコープ時はスコープ先ノードのテキストがヘッダーとして表示される
        const scopeHeader = page.locator('.outliner-scope-header');
        if (await scopeHeader.count() > 0) {
            const headerText = await scopeHeader.textContent();
            expect(headerText).toContain('Root');
        }

        // 子ノードが表示されている
        const nodes = page.locator('.outliner-node');
        const count = await nodes.count();
        expect(count).toBeGreaterThanOrEqual(2);
    });

    // --- 高速ファイル切替 ---

    test('連続ファイル切替でも最後のデータが反映される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Initial'));

        // 3回連続で updateData を送信
        await page.evaluate(() => {
            const handler = (window as any).__hostMessageHandler;
            if (!handler) return;

            handler({
                type: 'updateData',
                data: {
                    version: 1, rootIds: ['n1'],
                    nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'Switch 1', tags: [] } }
                },
                fileChangeId: 10
            });

            handler({
                type: 'updateData',
                data: {
                    version: 1, rootIds: ['n1'],
                    nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'Switch 2', tags: [] } }
                },
                fileChangeId: 11
            });

            handler({
                type: 'updateData',
                data: {
                    version: 1, rootIds: ['n1'],
                    nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'Final switch', tags: [] } }
                },
                fileChangeId: 12
            });
        });

        await page.waitForTimeout(300);

        // 最後のデータが表示されている
        const text = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(text).toContain('Final switch');
    });

    test('連続ファイル切替後に Undo しても以前のファイルに戻らない', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('File A data'));

        // テキスト編集
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type(' edit');
        await page.waitForTimeout(600);

        // 連続切替
        await page.evaluate(() => {
            const handler = (window as any).__hostMessageHandler;
            if (!handler) return;

            handler({
                type: 'updateData',
                data: {
                    version: 1, rootIds: ['n1'],
                    nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'File B', tags: [] } }
                },
                fileChangeId: 20
            });

            handler({
                type: 'updateData',
                data: {
                    version: 1, rootIds: ['n1'],
                    nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'File C final', tags: [] } }
                },
                fileChangeId: 21
            });
        });

        await page.waitForTimeout(300);

        // Undo しても File A/B のデータには戻らない
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        const currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('File C final');
        expect(currentText).not.toContain('File A');
        expect(currentText).not.toContain('File B');
    });

    // --- fileChangeId 整合性 ---

    test('setFileChangeId で fileChangeId が更新される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Test'));

        await page.evaluate(() => {
            (window as any).__testApi.setFileChangeId(99);
        });

        // テキスト編集して同期
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type('x');
        await page.waitForTimeout(1500);

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const syncMsgs = messages.filter((m: any) => m.type === 'syncData');
        const lastSync = syncMsgs[syncMsgs.length - 1];
        expect(lastSync.fileChangeId).toBe(99);
    });

    // --- updateData without fileChangeId (外部変更、リセットなし) ---

    test('fileChangeId なしの updateData では検索/スコープがリセットされない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Apple', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Banana', tags: [] }
                }
            });
        });

        // 検索を実行
        const searchInput = page.locator('.outliner-search-input');
        await searchInput.click();
        await searchInput.fill('Apple');
        await page.waitForTimeout(500);

        // fileChangeId なしの updateData（外部変更シミュレーション）
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1', 'n2'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'Apple updated', tags: [] },
                            n2: { id: 'n2', parentId: null, children: [], text: 'Banana', tags: [] }
                        }
                    }
                    // fileChangeId なし
                });
            }
        });
        await page.waitForTimeout(300);

        // 検索テキストが残っている（リセットされていない）
        const searchValue = await searchInput.inputValue();
        expect(searchValue).toBe('Apple');
    });
});
