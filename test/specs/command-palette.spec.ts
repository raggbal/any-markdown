/**
 * コマンドパレット (Cmd+/) テスト
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('コマンドパレット', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('Cmd+/ でパレットが表示され、Esc で閉じる', async ({ page }) => {
        await editor.focus();
        await editor.type('テスト');

        // パレットは最初は非表示
        let palette = page.locator('.command-palette');
        await expect(palette).toHaveCount(0);

        // Cmd+/ でパレットを開く
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        palette = page.locator('.command-palette');
        await expect(palette).toBeVisible();

        // フィルタ入力にフォーカスがある
        const input = page.locator('.command-palette-input');
        await expect(input).toBeFocused();

        // アイテムが表示されている
        const items = page.locator('.command-palette-item');
        expect(await items.count()).toBeGreaterThan(0);

        // Esc で閉じる
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await expect(palette).not.toBeVisible();
    });

    test('Cmd+/ トグル: 開いている時にもう一度押すと閉じる', async ({ page }) => {
        await editor.focus();
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

        // 開く
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);
        const palette = page.locator('.command-palette');
        await expect(palette).toBeVisible();

        // もう一度押すと閉じる
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);
        await expect(palette).not.toBeVisible();
    });

    test('フィルタ入力でアイテムが絞り込まれる', async ({ page }) => {
        await editor.focus();
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        // 全アイテム数を確認
        const allItems = await page.locator('.command-palette-item').count();
        expect(allItems).toBe(22); // 22アイテム (addPage, mermaid, math追加)

        // "heading" でフィルタ
        const input = page.locator('.command-palette-input');
        await input.fill('heading');
        await page.waitForTimeout(100);

        const filteredItems = await page.locator('.command-palette-item').count();
        expect(filteredItems).toBe(6); // heading1-6

        // フィルタクリアで全アイテム復帰
        await input.fill('');
        await page.waitForTimeout(100);
        const restoredItems = await page.locator('.command-palette-item').count();
        expect(restoredItems).toBe(22);
    });

    test('↑↓でアイテム選択が移動する', async ({ page }) => {
        await editor.focus();
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        // 最初のアイテムが選択されている
        const firstItem = page.locator('.command-palette-item').first();
        await expect(firstItem).toHaveClass(/selected/);

        // ↓ で次に移動
        await page.keyboard.press('ArrowDown');
        await expect(firstItem).not.toHaveClass(/selected/);
        const secondItem = page.locator('.command-palette-item').nth(1);
        await expect(secondItem).toHaveClass(/selected/);

        // ↑ で前に戻る
        await page.keyboard.press('ArrowUp');
        await expect(firstItem).toHaveClass(/selected/);
        await expect(secondItem).not.toHaveClass(/selected/);
    });

    test('↑でラップアラウンド: 最初のアイテムから↑で最後に', async ({ page }) => {
        await editor.focus();
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        // ↑ で最後のアイテムへ
        await page.keyboard.press('ArrowUp');
        const lastItem = page.locator('.command-palette-item').last();
        await expect(lastItem).toHaveClass(/selected/);
    });

    test('Enter で選択アイテムのアクションが実行される (heading1)', async ({ page }) => {
        await editor.focus();
        await editor.type('テスト見出し');

        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        // "heading1" にフィルタ
        const input = page.locator('.command-palette-input');
        await input.fill('heading1');
        await page.waitForTimeout(100);

        // Enter で実行
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        // パレットが閉じている
        const palette = page.locator('.command-palette');
        await expect(palette).not.toBeVisible();

        // h1に変換されている
        const html = await editor.getHtml();
        expect(html).toContain('<h1>');
        expect(html).toContain('テスト見出し');
    });

    test('クリックでアイテムのアクションが実行される', async ({ page }) => {
        await editor.focus();
        await editor.type('テスト');

        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        // "hr" にフィルタして水平線を挿入
        const input = page.locator('.command-palette-input');
        await input.fill('hr');
        await page.waitForTimeout(100);

        // クリックで実行
        const hrItem = page.locator('.command-palette-item[data-action="hr"]');
        await hrItem.click();
        await page.waitForTimeout(200);

        // パレットが閉じている
        const palette = page.locator('.command-palette');
        await expect(palette).not.toBeVisible();

        // hrが挿入されている
        const html = await editor.getHtml();
        expect(html).toContain('<hr>');
    });

    test('パレット操作後にカーソル位置が保持される', async ({ page }) => {
        await editor.focus();
        await editor.type('行1');
        await page.keyboard.press('Enter');
        await editor.type('行2');

        // カーソルは「行2」にある
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        // Esc で閉じた後、カーソル位置は「行2」のまま
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);

        // 追加入力して確認
        await page.keyboard.type('追加', { delay: 50 });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('行2追加');
    });

    test('グループラベルが表示される', async ({ page }) => {
        await editor.focus();
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        const groupLabels = page.locator('.command-palette-group-label');
        expect(await groupLabels.count()).toBe(6); // Page, Inline, Headings, Lists, Blocks, Insert
    });

    test('各アイテムにアイコンとラベルが表示される', async ({ page }) => {
        await editor.focus();
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        const firstItem = page.locator('.command-palette-item').first();
        // アイコン
        const icon = firstItem.locator('.command-palette-icon svg');
        await expect(icon).toHaveCount(1);
        // ラベル
        const label = firstItem.locator('.command-palette-label');
        expect(await label.textContent()).toBeTruthy();
    });

    test('外部クリックでパレットが閉じる', async ({ page }) => {
        await editor.focus();
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        const palette = page.locator('.command-palette');
        await expect(palette).toBeVisible();

        // エディタ外をクリック
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(100);

        await expect(palette).not.toBeVisible();
    });

    test('リスト変換: ul が正しく実行される', async ({ page }) => {
        await editor.focus();
        await editor.type('リスト項目');

        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+/`);
        await page.waitForTimeout(100);

        const input = page.locator('.command-palette-input');
        await input.fill('ul');
        await page.waitForTimeout(100);

        // ul アイテムを選択して実行
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
    });
});
