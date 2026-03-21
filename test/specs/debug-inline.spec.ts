import { test, expect } from '@playwright/test';

test('Debug bold pattern', async ({ page }) => {
    await page.goto('http://localhost:3000/standalone-editor.html');
    await page.waitForSelector('#editor');
    await page.click('#editor');

    const logs: string[] = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.keyboard.type('**bold**');
    await page.waitForTimeout(200);

    const beforeSpace = await page.evaluate(() => {
        const editor = document.getElementById('editor') as HTMLDivElement;
        return { html: editor.innerHTML, text: editor.textContent };
    });

    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    const afterSpace = await page.evaluate(() => {
        const editor = document.getElementById('editor') as HTMLDivElement;
        return { html: editor.innerHTML, text: editor.textContent };
    });

    console.log('BEFORE SPACE:', JSON.stringify(beforeSpace));
    console.log('AFTER SPACE:', JSON.stringify(afterSpace));
    const relevantLogs = logs.filter(l =>
        l.includes('Space') || l.includes('pattern') || l.includes('check') ||
        l.includes('inline') || l.includes('Inline') || l.includes('escape')
    );
    console.log('RELEVANT LOGS:', JSON.stringify(relevantLogs));

    expect(true).toBe(true);
});
