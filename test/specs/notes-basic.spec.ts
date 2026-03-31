/**
 * Notes 基本テスト
 * 初期化、左パネル、ファイル切替、undo/redoスタッククリアの基盤テスト
 */

import { test, expect } from '@playwright/test';

test.describe('Notes 基本テスト', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-notes.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // --- 初期化 ---

    test('Notes レイアウトが表示される（左パネル + アウトライナ）', async ({ page }) => {
        const layout = page.locator('.notes-layout');
        expect(await layout.isVisible()).toBe(true);

        const filePanel = page.locator('.notes-file-panel');
        expect(await filePanel.isVisible()).toBe(true);

        const outlinerContainer = page.locator('.outliner-container');
        expect(await outlinerContainer.isVisible()).toBe(true);
    });

    test('ファイルリスト付きで初期化できる', async ({ page }) => {
        await page.evaluate(() => {
            const fileList = [
                { filePath: '/test/file1.out', title: 'ファイル1', id: 'file1' },
                { filePath: '/test/file2.out', title: 'ファイル2', id: 'file2' }
            ];
            const structure = {
                version: 1,
                rootIds: ['file1', 'file2'],
                items: {
                    file1: { type: 'file', id: 'file1', title: 'ファイル1' },
                    file2: { type: 'file', id: 'file2', title: 'ファイル2' }
                }
            };
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        });

        // ファイルリストにアイテムが表示される（.file-panel-item）
        const fileItems = page.locator('.file-panel-item');
        const count = await fileItems.count();
        expect(count).toBe(2);
    });

    // --- Outliner連携 ---

    test('アウトライナにデータを読み込める', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'メモ1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'メモ2', tags: [] }
                }
            });
        });

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(2);
    });

    // --- ファイル切替シミュレーション (N-1: flushSync + fileChangeId) ---

    test('ファイル切替時に flushSync が呼ばれる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'テスト', tags: [] }
                }
            });
        });

        // テキストを編集（未同期のデータを作る）
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type('編集中');
        await page.waitForTimeout(100);

        // ファイル切替（openFile）を呼ぶ → flushSync が呼ばれるはず
        await page.evaluate(() => {
            window.notesHostBridge.openFile('/test/newfile.out');
        });

        // flushSync によって syncData が送信されている
        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const syncMessages = messages.filter((m: any) => m.type === 'syncData');
        expect(syncMessages.length).toBeGreaterThanOrEqual(1);
    });

    // --- N-2: Undo/Redo スタッククリア ---

    test('updateData 受信で undo/redo スタックがクリアされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'テスト', tags: [] }
                }
            });
        });

        // テキスト編集してスナップショットを作る
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type('編集');
        await page.waitForTimeout(600); // デバウンスを待つ

        // updateData メッセージを送信（ファイル切替シミュレーション）
        // msg.data にオブジェクト、msg.fileChangeId でNotesファイル切替を示す
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: '新ファイルのデータ', tags: [] }
                        }
                    },
                    fileChangeId: 1
                });
            }
        });

        await page.waitForTimeout(300);

        // Undo を試みても元のデータには戻らない（スタックがクリアされているため）
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        const currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('新ファイルのデータ');
    });

    // --- 左パネル折りたたみ (N-3) ---

    test('左パネルの折りたたみ/展開が動作する', async ({ page }) => {
        const panel = page.locator('.notes-file-panel');

        // 初期状態: 展開
        expect(await panel.isVisible()).toBe(true);

        // 折りたたみボタンをクリック
        const collapseBtn = page.locator('.notes-panel-collapse-btn');
        if (await collapseBtn.isVisible()) {
            await collapseBtn.click();
            await page.waitForTimeout(200);

            // collapsed クラスが付与される
            const hasCollapsed = await panel.evaluate(el => el.classList.contains('collapsed'));
            expect(hasCollapsed).toBe(true);
        }
    });

    // --- フォルダ操作 ---

    test('フォルダ付き構造を表示できる', async ({ page }) => {
        await page.evaluate(() => {
            const fileList = [
                { filePath: '/test/file1.out', title: 'ファイル1', id: 'file1' },
                { filePath: '/test/file2.out', title: 'ファイル2', id: 'file2' }
            ];
            const structure = {
                version: 1,
                rootIds: ['f1', 'file2'],
                items: {
                    f1: { type: 'folder', id: 'f1', title: 'フォルダA', childIds: ['file1'], collapsed: false },
                    file1: { type: 'file', id: 'file1', title: 'ファイル1' },
                    file2: { type: 'file', id: 'file2', title: 'ファイル2' }
                }
            };
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        });

        // フォルダが表示される（.file-panel-folder）
        const folderItem = page.locator('.file-panel-folder');
        const folderCount = await folderItem.count();
        expect(folderCount).toBeGreaterThanOrEqual(1);
    });

    // --- Daily Notes ナビバー ---

    test('Daily Notes 環境では日付ナビバーが表示される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '2026-03-31', tags: [] }
                }
            });
        });

        // updateData で isDailyNotes フラグを送信（msg.data 形式）
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: '2026-03-31', tags: [] }
                        }
                    },
                    isDailyNotes: true,
                    scopeToNodeId: 'n1',
                    fileChangeId: 1
                });
            }
        });

        await page.waitForTimeout(300);

        // Daily Notesナビバーが表示される
        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isVisible = await dailyNavArea.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(true);
    });
});
