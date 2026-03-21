/**
 * Inline pattern変換時にSpaceが挿入されないことを検証
 * preventDefaultでブラウザのspace挿入を止め、パターン変換のみ行う
 */

import { test, expect } from '@playwright/test';

test.describe('Inline pattern conversion - No space after conversion', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');
    });

    test('Bold: **text** + Space → <strong>text</strong> without trailing space', async ({ page }) => {
        await page.keyboard.type('**bold**');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = (editor.textContent || '').replace(/\u200B/g, '');
            return {
                html: editor.innerHTML,
                textContent,
                hasBoldTag: editor.innerHTML.includes('<strong>'),
                hasSpaceAfter: textContent.includes('bold '),
            };
        });

        expect(result.hasBoldTag).toBe(true);
        // Space should NOT be inserted after conversion
        expect(result.hasSpaceAfter).toBe(false);
        expect(result.textContent).toBe('bold');
    });

    test('Italic: *text* + Space → <em>text</em> without trailing space', async ({ page }) => {
        await page.keyboard.type('*italic*');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = (editor.textContent || '').replace(/\u200B/g, '');
            return {
                html: editor.innerHTML,
                hasItalicTag: editor.innerHTML.includes('<em>'),
                hasSpaceAfter: textContent.includes('italic '),
                textContent,
            };
        });

        expect(result.hasItalicTag).toBe(true);
        expect(result.hasSpaceAfter).toBe(false);
        expect(result.textContent).toBe('italic');
    });

    test('Inline code: `text` + Space → <code>text</code> without trailing space', async ({ page }) => {
        await page.keyboard.type('`code`');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = (editor.textContent || '').replace(/\u200B/g, '');
            return {
                html: editor.innerHTML,
                hasCodeTag: editor.innerHTML.includes('<code>'),
                hasSpaceAfter: textContent.includes('code '),
                textContent,
            };
        });

        expect(result.hasCodeTag).toBe(true);
        expect(result.hasSpaceAfter).toBe(false);
        expect(result.textContent).toBe('code');
    });

    test('Strikethrough: ~~text~~ + Space → <del>text</del> without trailing space', async ({ page }) => {
        await page.keyboard.type('~~strike~~');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = (editor.textContent || '').replace(/\u200B/g, '');
            return {
                html: editor.innerHTML,
                hasDelTag: editor.innerHTML.includes('<del>'),
                hasSpaceAfter: textContent.includes('strike '),
                textContent,
            };
        });

        expect(result.hasDelTag).toBe(true);
        expect(result.hasSpaceAfter).toBe(false);
        expect(result.textContent).toBe('strike');
    });

    test('Bold with prefix: hello **bold** + Space → no trailing space', async ({ page }) => {
        await page.keyboard.type('hello **bold**');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = (editor.textContent || '').replace(/\u200B/g, '');
            return {
                html: editor.innerHTML,
                hasBoldTag: editor.innerHTML.includes('<strong>'),
                textContent,
            };
        });

        expect(result.hasBoldTag).toBe(true);
        // Should be "hellobold" without space between (the space before ** was part of the text)
        // Actually "hello bold" - the space before ** is preserved, but no trailing space after bold
        expect(result.textContent).not.toMatch(/bold $/);
    });

    test('No pattern: normal text + Space → space should be inserted normally', async ({ page }) => {
        await page.keyboard.type('hello');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return {
                textContent: editor.textContent || '',
            };
        });

        // Normal space should be inserted when no pattern matches
        expect(result.textContent).toBe('hello ');
    });

    test('Block pattern: # + Space → heading should still work', async ({ page }) => {
        await page.keyboard.type('#');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return {
                html: editor.innerHTML,
                hasH1: editor.innerHTML.includes('<h1>'),
            };
        });

        expect(result.hasH1).toBe(true);
    });

    test('Block pattern: - + Space → list should still work', async ({ page }) => {
        await page.keyboard.type('-');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return {
                html: editor.innerHTML,
                hasUl: editor.innerHTML.includes('<ul>'),
                hasLi: editor.innerHTML.includes('<li>'),
            };
        });

        expect(result.hasUl).toBe(true);
        expect(result.hasLi).toBe(true);
    });

    test('Block pattern: > + Space → blockquote should still work', async ({ page }) => {
        await page.keyboard.type('>');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return {
                html: editor.innerHTML,
                hasBq: editor.innerHTML.includes('<blockquote>'),
            };
        });

        expect(result.hasBq).toBe(true);
    });

    test('Block pattern: 1. + Space → ordered list should still work', async ({ page }) => {
        await page.keyboard.type('1.');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return {
                html: editor.innerHTML,
                hasOl: editor.innerHTML.includes('<ol>'),
                hasLi: editor.innerHTML.includes('<li>'),
            };
        });

        expect(result.hasOl).toBe(true);
        expect(result.hasLi).toBe(true);
    });
});
