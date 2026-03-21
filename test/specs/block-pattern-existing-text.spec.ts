import { test, expect } from '@playwright/test';

test.describe('Block pattern conversion with existing text (no space between pattern and text)', () => {

    // ===== Heading変換: 既存テキストあり =====

    test('Heading h1→h2: type ## at beginning of h1 with text, press space → converts to h2', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // # heading と入力してh1を作る
        await page.keyboard.type('# heading');
        await page.waitForTimeout(200);

        // h1が作成されたことを確認
        let html = await page.evaluate(() => (document.getElementById('editor') as HTMLDivElement).innerHTML);
        expect(html).toContain('<h1>');

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // ## を入力（h1のテキスト "heading" の前に ## を追加 → "##heading"）
        await page.keyboard.type('##');
        await page.waitForTimeout(100);

        // spaceを押してh2に変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const h2 = editor.querySelector('h2');
            return {
                html: editor.innerHTML,
                hasH2: !!h2,
                h2Text: h2 ? h2.textContent : '',
                hasH1: !!editor.querySelector('h1')
            };
        });

        expect(result.hasH2).toBe(true);
        expect(result.hasH1).toBe(false);
        expect(result.h2Text).toBe('heading');
    });

    // ===== リスト内型変換: bullet → task =====

    test('List type change: bullet to task - type [ ] at beginning of li with text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // - item と入力してbullet listを作る
        await page.keyboard.type('- item');
        await page.waitForTimeout(200);

        // bullet listが作成されたことを確認
        let html = await page.evaluate(() => (document.getElementById('editor') as HTMLDivElement).innerHTML);
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // [ ] を入力（タスクリストマーカー）
        await page.keyboard.type('[ ]');
        await page.waitForTimeout(100);

        // spaceを押してtask listに変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const checkbox = editor.querySelector('input[type="checkbox"]');
            const li = editor.querySelector('li');
            return {
                html: editor.innerHTML,
                hasCheckbox: !!checkbox,
                liText: li ? li.textContent?.replace(/\s*$/, '') : ''
            };
        });

        expect(result.hasCheckbox).toBe(true);
        // liText should contain "item" (checkbox adds no visible text)
        expect(result.liText).toContain('item');
    });

    // ===== リスト内型変換: task → bullet =====

    test('List type change: task to bullet - type - at beginning of task li with text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // - [ ] task と入力してtask listを作る
        await page.keyboard.type('- [ ] task');
        await page.waitForTimeout(200);

        let html = await page.evaluate(() => (document.getElementById('editor') as HTMLDivElement).innerHTML);
        expect(html).toContain('checkbox');

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // - を入力
        await page.keyboard.type('-');
        await page.waitForTimeout(100);

        // spaceを押してbullet listに変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const checkbox = editor.querySelector('input[type="checkbox"]');
            const li = editor.querySelector('li');
            return {
                html: editor.innerHTML,
                hasCheckbox: !!checkbox,
                hasUl: !!editor.querySelector('ul'),
                liText: li ? li.textContent : ''
            };
        });

        // checkboxが消えてbullet listになる
        expect(result.hasCheckbox).toBe(false);
        expect(result.hasUl).toBe(true);
        expect(result.liText).toContain('task');
    });

    // ===== リスト内型変換: bullet → ordered =====

    test('List type change: bullet to ordered - type 1. at beginning of bullet li with text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // - item と入力してbullet listを作る
        await page.keyboard.type('- item');
        await page.waitForTimeout(200);

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // 1. を入力
        await page.keyboard.type('1.');
        await page.waitForTimeout(100);

        // spaceを押してordered listに変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const ol = editor.querySelector('ol');
            const li = editor.querySelector('li');
            return {
                html: editor.innerHTML,
                hasOl: !!ol,
                hasUl: !!editor.querySelector('ul'),
                liText: li ? li.textContent : ''
            };
        });

        expect(result.hasOl).toBe(true);
        expect(result.hasUl).toBe(false);
        expect(result.liText).toContain('item');
    });

    // ===== 段落レベル: blockquote with existing text =====

    test('Blockquote: type > at beginning of paragraph with text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // some text と入力
        await page.keyboard.type('some text');
        await page.waitForTimeout(200);

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // > を入力
        await page.keyboard.type('>');
        await page.waitForTimeout(100);

        // spaceを押してblockquoteに変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const bq = editor.querySelector('blockquote');
            return {
                html: editor.innerHTML,
                hasBlockquote: !!bq,
                bqText: bq ? bq.textContent : ''
            };
        });

        expect(result.hasBlockquote).toBe(true);
        expect(result.bqText).toBe('some text');
    });

    // ===== 段落レベル: bullet list with existing text =====

    test('Bullet list: type - at beginning of paragraph with text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // hello と入力
        await page.keyboard.type('hello');
        await page.waitForTimeout(200);

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // - を入力
        await page.keyboard.type('-');
        await page.waitForTimeout(100);

        // spaceを押してbullet listに変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const ul = editor.querySelector('ul');
            const li = editor.querySelector('li');
            return {
                html: editor.innerHTML,
                hasUl: !!ul,
                liText: li ? li.textContent : ''
            };
        });

        expect(result.hasUl).toBe(true);
        expect(result.liText).toBe('hello');
    });

    // ===== 段落レベル: ordered list with existing text =====

    test('Ordered list: type 1. at beginning of paragraph with text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // world と入力
        await page.keyboard.type('world');
        await page.waitForTimeout(200);

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // 1. を入力
        await page.keyboard.type('1.');
        await page.waitForTimeout(100);

        // spaceを押してordered listに変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const ol = editor.querySelector('ol');
            const li = editor.querySelector('li');
            return {
                html: editor.innerHTML,
                hasOl: !!ol,
                liText: li ? li.textContent : ''
            };
        });

        expect(result.hasOl).toBe(true);
        expect(result.liText).toBe('world');
    });

    // ===== 段落レベル: task list with existing text =====

    test('Task list: type [ ] at beginning of bullet li with text (via li type conversion)', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.click('#editor');

        // まずbullet listを作る
        await page.keyboard.type('- todo');
        await page.waitForTimeout(200);

        // bullet listが作成されたことを確認
        let html = await page.evaluate(() => (document.getElementById('editor') as HTMLDivElement).innerHTML);
        expect(html).toContain('<ul>');

        // 行頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // [ ] を入力してtask listに変換（リスト内型変換）
        await page.keyboard.type('[ ]');
        await page.waitForTimeout(100);

        // spaceを押してtask listに変換
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const checkbox = editor.querySelector('input[type="checkbox"]');
            const li = editor.querySelector('li');
            return {
                html: editor.innerHTML,
                hasCheckbox: !!checkbox,
                liText: li ? li.textContent?.replace(/\s*$/, '') : ''
            };
        });

        expect(result.hasCheckbox).toBe(true);
        expect(result.liText).toContain('todo');
    });
});
