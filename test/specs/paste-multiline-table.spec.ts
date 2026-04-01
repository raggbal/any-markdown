import { test, expect } from '@playwright/test';

// ヘルパー関数: プレーンテキストとしてペーストをシミュレート
async function simulatePlainTextPaste(page: any, text: string) {
    await page.evaluate((pastedText: string) => {
        const editor = document.getElementById('editor')!;

        const clipboardData = {
            _data: {
                'text/plain': pastedText,
                'text/html': ''
            } as Record<string, string>,
            getData: function(type: string) {
                return this._data[type] || '';
            },
            setData: function(type: string, value: string) {
                this._data[type] = value;
            },
            items: []
        };

        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer()
        });

        Object.defineProperty(event, 'clipboardData', {
            value: clipboardData,
            writable: false,
            configurable: true
        });

        editor.dispatchEvent(event);
    }, text);
}

test.describe('Paste markdown table with multi-line cells', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('should paste a simple table with cell content containing newlines', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Table where header row has a newline in the second cell
        const tableText = [
            '| Header1 | Header2',
            'continued | Header3 |',
            '| --- | --- | --- |',
            '| cell1 | cell2 | cell3 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Verify table was created
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // Verify column count (3 columns)
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(3);

        // Verify header content - second header should contain <br>
        const header2Html = await page.locator('#editor table th').nth(1).innerHTML();
        expect(header2Html).toContain('Header2');
        expect(header2Html).toContain('continued');
    });

    test('should paste a table with multiple newlines in data cells', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| Col1 | Col2 | Col3 |',
            '| --- | --- | --- |',
            '| data1',
            'line2 | data2',
            'line2',
            'line3 | data3 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Table should be created
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // 3 columns
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(3);

        // 1 data row (header row has <th>, data rows have <td>)
        const dataRowCount = await page.locator('#editor table tr:has(td)').count();
        expect(dataRowCount).toBe(1);

        // First cell should have multi-line content
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('data1');
        expect(cell1Html).toContain('<br>');
        expect(cell1Html).toContain('line2');

        // Second cell should have multi-line content
        const cell2Html = await page.locator('#editor table td').nth(1).innerHTML();
        expect(cell2Html).toContain('data2');
        expect(cell2Html).toContain('line3');
    });

    test('should paste a complex table (SageMaker-like)', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Simplified version of the user's actual table
        const tableText = [
            '| データセット | 前処理 & 特徴量エンジニアリング',
            ' | 特徴量 | 学習 |',
            '| --- | --- | --- | --- |',
            '| バッチデータ',
            'S3 | バッチ加工',
            '- Processing Job | バッチ',
            '- FeatureStore | 実験管理 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Table should be created
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // 4 columns
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(4);

        // 1 data row with 4 cells
        const tdCount = await page.locator('#editor table td').count();
        expect(tdCount).toBe(4);

        // First data cell should contain multi-line content
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('バッチデータ');
        expect(cell1Html).toContain('S3');
    });

    test('should not affect normal table paste (no newlines in cells)', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| A | B | C |',
            '| --- | --- | --- |',
            '| 1 | 2 | 3 |',
            '| 4 | 5 | 6 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(3);

        const tdCount = await page.locator('#editor table td').count();
        expect(tdCount).toBe(6);
    });

    test('should handle blank lines within cell content', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| H1 | H2 |',
            '| --- | --- |',
            '| line1',
            '',
            'line3 | data |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // First cell should have the multi-line content
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('line1');
        expect(cell1Html).toContain('line3');
    });

    test('should preserve markdown roundtrip after paste', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| A | B |',
            '| --- | --- |',
            '| cell with',
            'newline | normal |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Get markdown output
        const md = await page.evaluate(() => (window as any).__testApi.getMarkdown());

        // Should contain <br> in the cell (HTML→MD preserves <br>)
        expect(md).toContain('<br>');
        expect(md).toContain('cell with');
        expect(md).toContain('newline');
        expect(md).toContain('normal');
    });
});
