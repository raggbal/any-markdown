/**
 * 異種ネストリストのパース（Markdown → HTML）テスト
 * 同じ親li内にul, ol, taskリストが兄弟として並ぶ場合のDOM構造を検証
 */

import { test, expect } from '@playwright/test';

test.describe('異種ネストリストのパース', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('ul内のolがトップレベルに昇格しない（報告されたバグ）', async ({ page }) => {
        const markdown = '- a\n  - b\n    - c\n    - [ ] d\n    1. e\n  - f\n    - [ ] g';

        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);

        const html = await page.evaluate(() => {
            return (window as any).__testApi.getHtml();
        });

        // "1. e" はトップレベルの<ol>ではなく、b配下のネストされた<ol>であるべき
        // トップレベル要素は<ul>のみであるべき
        const topLevelTags = await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            return Array.from(editor.children).map(c => c.tagName.toLowerCase());
        });
        expect(topLevelTags).toEqual(['ul']);
        expect(topLevelTags).not.toContain('ol');

        // eがol内にあることを確認
        expect(html).toContain('<ol>');
        expect(html).toMatch(/<ol><li>e<\/li><\/ol>/);
    });

    test('ul内のolがネスト構造を保持するround-trip', async ({ page }) => {
        const markdown = '- a\n  - b\n    - c\n    - [ ] d\n    1. e\n  - f\n    - [ ] g';

        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);

        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });

        // round-trip後もネスト構造が保持される
        const lines = result.split('\n');
        // "1. e" は4スペース（またはそれ以上の）インデントを持つべき
        const eLine = lines.find(l => l.includes('e') && l.match(/\d+\./));
        expect(eLine).toBeDefined();
        expect(eLine).toMatch(/^\s{4}/); // 少なくとも4スペースのインデント
    });

    test('同レベルでul→olへの型変更（ネストレベル2）', async ({ page }) => {
        const markdown = '- a\n  - b\n    - c\n    1. d';

        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);

        // トップレベルはulのみ
        const topLevelTags = await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            return Array.from(editor.children).map(c => c.tagName.toLowerCase());
        });
        expect(topLevelTags).toEqual(['ul']);

        // olがネストされている
        const html = await page.evaluate(() => {
            return (window as any).__testApi.getHtml();
        });
        expect(html).toContain('<ol>');
        expect(html).toMatch(/<ol><li>d<\/li><\/ol>/);
    });

    test('ネストレベル1に戻る時のol→ul型変更', async ({ page }) => {
        // - a
        //   1. b
        //   - c    ← ネストレベル1でol→ul
        const markdown = '- a\n  1. b\n  - c';

        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);

        // トップレベルはulのみ
        const topLevelTags = await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            return Array.from(editor.children).map(c => c.tagName.toLowerCase());
        });
        expect(topLevelTags).toEqual(['ul']);

        // bがol内、cがul内
        const html = await page.evaluate(() => {
            return (window as any).__testApi.getHtml();
        });
        expect(html).toContain('<ol>');
        expect(html).toMatch(/<ol><li>b<\/li><\/ol>/);
    });

    test('トップレベルでのul→ol型変更は別リストになる', async ({ page }) => {
        // - a
        // 1. b    ← トップレベルでの型変更は別リストが正しい
        const markdown = '- a\n1. b';

        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);

        // トップレベルにulとolの両方
        const topLevelTags = await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            return Array.from(editor.children).map(c => c.tagName.toLowerCase());
        });
        expect(topLevelTags).toEqual(['ul', 'ol']);
    });

    test('深いネストからの戻りで型が変わる場合', async ({ page }) => {
        // - a
        //   - b
        //     - c
        //   1. d    ← ネストレベル1に戻りつつol
        const markdown = '- a\n  - b\n    - c\n  1. d';

        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);

        // トップレベルはulのみ
        const topLevelTags = await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            return Array.from(editor.children).map(c => c.tagName.toLowerCase());
        });
        expect(topLevelTags).toEqual(['ul']);

        // dがol内にネストされている
        const html = await page.evaluate(() => {
            return (window as any).__testApi.getHtml();
        });
        expect(html).toContain('<ol>');
        expect(html).toMatch(/<ol><li>d<\/li><\/ol>/);
    });
});
