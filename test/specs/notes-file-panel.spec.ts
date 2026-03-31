/**
 * Notes ファイルパネルテスト
 * ファイルリスト表示、ファイル/フォルダ操作、D&D、タブ、パネル開閉
 */

import { test, expect } from '@playwright/test';

// 共通テストデータ
const fileList = [
    { filePath: '/test/file1.out', title: 'File1', id: 'file1' },
    { filePath: '/test/file2.out', title: 'File2', id: 'file2' }
];

const structure = {
    version: 1,
    rootIds: ['file1', 'file2'],
    items: {
        file1: { type: 'file', id: 'file1', title: 'File1' },
        file2: { type: 'file', id: 'file2', title: 'File2' }
    }
};

const threeFileList = [
    { filePath: '/test/file1.out', title: 'File1', id: 'file1' },
    { filePath: '/test/file2.out', title: 'File2', id: 'file2' },
    { filePath: '/test/file3.out', title: 'File3', id: 'file3' }
];

const threeFileStructure = {
    version: 1,
    rootIds: ['file1', 'file2', 'file3'],
    items: {
        file1: { type: 'file', id: 'file1', title: 'File1' },
        file2: { type: 'file', id: 'file2', title: 'File2' },
        file3: { type: 'file', id: 'file3', title: 'File3' }
    }
};

const folderStructure = {
    version: 1,
    rootIds: ['f1', 'file2'],
    items: {
        f1: { type: 'folder', id: 'f1', title: 'FolderA', childIds: ['file1'], collapsed: false },
        file1: { type: 'file', id: 'file1', title: 'File1' },
        file2: { type: 'file', id: 'file2', title: 'File2' }
    }
};

test.describe('Notes ファイルパネル', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-notes.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // ===== ファイルリスト表示 =====

    test('1. ファイルリスト付き初期化でアイテム数が正しい', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        const items = page.locator('.file-panel-item');
        await expect(items).toHaveCount(2);
    });

    test('2. 現在のファイルに .active クラスが付与される', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file2.out', structure);
        }, { fileList, structure });

        const activeItem = page.locator('.file-panel-item.active');
        await expect(activeItem).toHaveCount(1);

        const title = await activeItem.locator('.file-panel-item-title').textContent();
        expect(title).toBe('File2');
    });

    test('3. ファイルクリックで bridge.openFile が呼ばれる', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        // 2番目のファイル（非アクティブ）をクリック
        const secondFile = page.locator('.file-panel-item').nth(1);
        await secondFile.click();
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const openMsgs = messages.filter((m: any) => m.type === 'openFile');
        expect(openMsgs.length).toBeGreaterThanOrEqual(1);
        expect(openMsgs[0].filePath).toBe('/test/file2.out');
    });

    test('4. 空ファイルリストで空状態メッセージ表示', async ({ page }) => {
        await page.evaluate(() => {
            const emptyStructure = { version: 1, rootIds: [], items: {} };
            (window as any).__testApi.initNotesPanel([], null, emptyStructure);
        });

        const items = page.locator('.file-panel-item');
        await expect(items).toHaveCount(0);

        // 空状態メッセージが表示される
        const emptyMsg = page.locator('.file-panel-empty');
        await expect(emptyMsg).toBeVisible();
    });

    // ===== ファイル作成 =====

    test('5. 「+」ボタンクリックで入力欄が表示される', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        const addBtn = page.locator('#filePanelAdd');
        await addBtn.click();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        await expect(renameInput).toBeVisible();
    });

    test('6. 入力欄でEnterで bridge.createFile が呼ばれる', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        const addBtn = page.locator('#filePanelAdd');
        await addBtn.click();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        await renameInput.fill('New File Title');
        await renameInput.press('Enter');
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const createMsgs = messages.filter((m: any) => m.type === 'createFile');
        expect(createMsgs.length).toBe(1);
        expect(createMsgs[0].title).toBe('New File Title');
    });

    test('7. 入力欄でEscapeで入力欄が消える（キャンセル）', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        const addBtn = page.locator('#filePanelAdd');
        await addBtn.click();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        await expect(renameInput).toBeVisible();

        await renameInput.press('Escape');
        await page.waitForTimeout(200);

        // 入力欄が消えている
        await expect(page.locator('.file-panel-rename-input')).toHaveCount(0);
    });

    test('8. 空文字列入力でEnterで bridge.createFile が呼ばれない', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
            // メッセージクリア
            (window as any).__testApi.notesMessages.length = 0;
        }, { fileList, structure });

        const addBtn = page.locator('#filePanelAdd');
        await addBtn.click();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        // 空のままEnter
        await renameInput.press('Enter');
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const createMsgs = messages.filter((m: any) => m.type === 'createFile');
        expect(createMsgs.length).toBe(0);
    });

    // ===== ファイルリネーム =====

    test('9. ファイルダブルクリックでリネーム入力欄が表示される', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        const firstFile = page.locator('.file-panel-item').first();
        await firstFile.dblclick();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        await expect(renameInput).toBeVisible();
    });

    test('10. リネーム入力でEnterで bridge.renameTitle が呼ばれる', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
            (window as any).__testApi.notesMessages.length = 0;
        }, { fileList, structure });

        const firstFile = page.locator('.file-panel-item').first();
        await firstFile.dblclick();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        await renameInput.fill('Renamed File');
        await renameInput.press('Enter');
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const renameMsgs = messages.filter((m: any) => m.type === 'renameTitle');
        expect(renameMsgs.length).toBe(1);
        expect(renameMsgs[0].filePath).toBe('/test/file1.out');
        expect(renameMsgs[0].newTitle).toBe('Renamed File');
    });

    test('11. 値が変わらない場合 bridge.renameTitle が呼ばれない', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
            (window as any).__testApi.notesMessages.length = 0;
        }, { fileList, structure });

        const firstFile = page.locator('.file-panel-item').first();
        await firstFile.dblclick();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        // 値を変えずにEnter（既存タイトルのまま）
        await renameInput.press('Enter');
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const renameMsgs = messages.filter((m: any) => m.type === 'renameTitle');
        expect(renameMsgs.length).toBe(0);
    });

    // ===== フォルダ操作 =====

    test('12. フォルダ付き構造を表示できる', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure: folderStructure });

        const folders = page.locator('.file-panel-folder');
        await expect(folders).toHaveCount(1);

        const folderTitle = await page.locator('.file-panel-folder-title').first().textContent();
        expect(folderTitle).toBe('FolderA');

        // フォルダ内にファイルが表示される
        const childFiles = page.locator('.file-panel-folder-children .file-panel-item');
        await expect(childFiles).toHaveCount(1);
    });

    test('13. フォルダヘッダークリックで bridge.toggleFolder が呼ばれる', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure: folderStructure });

        const folderHeader = page.locator('.file-panel-folder-header').first();
        await folderHeader.click();
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const toggleMsgs = messages.filter((m: any) => m.type === 'toggleFolder');
        expect(toggleMsgs.length).toBeGreaterThanOrEqual(1);
        expect(toggleMsgs[0].folderId).toBe('f1');
    });

    test('14. フォルダ作成ボタンで入力欄表示、Enterで bridge.createFolder', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
            (window as any).__testApi.notesMessages.length = 0;
        }, { fileList, structure });

        const addFolderBtn = page.locator('#filePanelAddFolder');
        await addFolderBtn.click();
        await page.waitForTimeout(200);

        const renameInput = page.locator('.file-panel-rename-input');
        await expect(renameInput).toBeVisible();

        await renameInput.fill('New Folder');
        await renameInput.press('Enter');
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const createMsgs = messages.filter((m: any) => m.type === 'createFolder');
        expect(createMsgs.length).toBe(1);
        expect(createMsgs[0].title).toBe('New Folder');
    });

    // ===== コンテキストメニュー =====

    test('15. ファイル右クリックでコンテキストメニュー表示', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        const firstFile = page.locator('.file-panel-item').first();
        await firstFile.click({ button: 'right' });
        await page.waitForTimeout(200);

        const contextMenu = page.locator('.file-panel-context-menu');
        await expect(contextMenu).toBeVisible();
    });

    test('16. メニュー外クリックでメニューが閉じる', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        const firstFile = page.locator('.file-panel-item').first();
        await firstFile.click({ button: 'right' });
        await page.waitForTimeout(200);

        const contextMenu = page.locator('.file-panel-context-menu');
        await expect(contextMenu).toBeVisible();

        // メニュー外をクリック
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(200);

        await expect(contextMenu).toHaveCount(0);
    });

    // ===== タブナビゲーション =====

    test('17. Searchタブクリックで検索パネル表示、Notesパネル非表示', async ({ page }) => {
        const searchTab = page.locator('.file-panel-tab[data-tab="search"]');
        await searchTab.click();
        await page.waitForTimeout(200);

        // 検索タブがアクティブ
        expect(await searchTab.evaluate(el => el.classList.contains('active'))).toBe(true);

        // 検索コンテンツが表示される
        const searchContent = page.locator('#filePanelContentSearch');
        const isSearchVisible = await searchContent.evaluate(el => el.style.display !== 'none');
        expect(isSearchVisible).toBe(true);

        // Notesコンテンツが非表示
        const notesContent = page.locator('#filePanelContentNotes');
        const isNotesHidden = await notesContent.evaluate(el => el.style.display === 'none');
        expect(isNotesHidden).toBe(true);
    });

    test('18. Notesタブクリックでファイルリスト表示', async ({ page }) => {
        // まず Search タブに切替
        const searchTab = page.locator('.file-panel-tab[data-tab="search"]');
        await searchTab.click();
        await page.waitForTimeout(200);

        // Notes タブに戻る
        const notesTab = page.locator('.file-panel-tab[data-tab="notes"]');
        await notesTab.click();
        await page.waitForTimeout(200);

        expect(await notesTab.evaluate(el => el.classList.contains('active'))).toBe(true);

        const notesContent = page.locator('#filePanelContentNotes');
        const isVisible = await notesContent.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(true);
    });

    // ===== パネル折りたたみ/展開 =====

    test('19. collapse ボタンクリックで .collapsed クラス付与 + bridge.togglePanel(true)', async ({ page }) => {
        const panel = page.locator('#notesFilePanel');
        const collapseBtn = page.locator('#filePanelCollapse');

        await collapseBtn.click();
        await page.waitForTimeout(200);

        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(true);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const toggleMsgs = messages.filter((m: any) => m.type === 'togglePanel');
        expect(toggleMsgs.length).toBe(1);
        expect(toggleMsgs[0].collapsed).toBe(true);
    });

    test('20. toggle ボタンクリックで .collapsed クラス除去 + bridge.togglePanel(false)', async ({ page }) => {
        const panel = page.locator('#notesFilePanel');
        const collapseBtn = page.locator('#filePanelCollapse');
        const toggleBtn = page.locator('#notesPanelToggleBtn');

        // まず折りたたむ
        await collapseBtn.click();
        await page.waitForTimeout(200);
        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(true);

        // メッセージをクリア
        await page.evaluate(() => {
            (window as any).__testApi.notesMessages.length = 0;
        });

        // トグルボタンで展開
        await toggleBtn.click({ force: true });
        await page.waitForTimeout(200);

        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(false);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const toggleMsgs = messages.filter((m: any) => m.type === 'togglePanel');
        expect(toggleMsgs.length).toBe(1);
        expect(toggleMsgs[0].collapsed).toBe(false);
    });

    // ===== onFileListChanged =====

    test('21. ファイルリスト更新シミュレーションでリスト再描画', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        // 初期状態: 2件
        await expect(page.locator('.file-panel-item')).toHaveCount(2);

        // __notesFileListHandler でファイルリスト更新をシミュレーション
        await page.evaluate(({ threeFileList, threeFileStructure }) => {
            if ((window as any).__notesFileListHandler) {
                (window as any).__notesFileListHandler(
                    threeFileList,
                    '/test/file1.out',
                    threeFileStructure
                );
            }
        }, { threeFileList, threeFileStructure });

        await page.waitForTimeout(200);

        // 更新後: 3件
        await expect(page.locator('.file-panel-item')).toHaveCount(3);
    });

    // ===== パネルリサイズ =====

    test('22. init で panelWidth 指定でパネル幅が復元される', async ({ page }) => {
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure, 300);
        }, { fileList, structure });

        const panelWidth = await page.evaluate(() => {
            const panel = document.getElementById('notesFilePanel');
            return panel ? panel.style.width : '';
        });

        expect(panelWidth).toBe('300px');
    });
});
