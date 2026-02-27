import { test, expect } from '@playwright/test';

test.describe('Perplexity theme syntax highlighting', () => {
    test('JavaScript keywords should have colored highlight spans', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');

        // Set perplexity theme
        await page.evaluate(() => {
            document.documentElement.setAttribute('data-theme', 'perplexity');
        });

        // Render code block via normal flow
        const result = await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```javascript\nfunction hello() {\n    const x = 1;\n    return x;\n}\n```');

            const code = document.querySelector('#editor pre code');
            const html = code?.innerHTML || '';
            const keywordSpans = code?.querySelectorAll('.hljs-keyword');

            // Check computed styles
            let keywordComputedColor = '';
            let keywordText = '';
            if (keywordSpans && keywordSpans.length > 0) {
                keywordComputedColor = window.getComputedStyle(keywordSpans[0]).color;
                keywordText = keywordSpans[0].textContent || '';
            }

            const codeComputedColor = code ? window.getComputedStyle(code).color : '';

            return {
                codeInnerHTML: html,
                keywordCount: keywordSpans?.length || 0,
                keywordText,
                keywordComputedColor,
                codeComputedColor,
                theme: document.documentElement.getAttribute('data-theme')
            };
        });

        console.log('Theme:', result.theme);
        console.log('Code innerHTML:', result.codeInnerHTML.substring(0, 300));
        console.log('Keyword spans count:', result.keywordCount);
        console.log('First keyword text:', result.keywordText);
        console.log('Keyword computed color:', result.keywordComputedColor);
        console.log('Code computed color:', result.codeComputedColor);

        expect(result.keywordCount).toBeGreaterThan(0);
        // Keyword color should differ from the code base color
        expect(result.keywordComputedColor).not.toBe(result.codeComputedColor);
    });
});
