/**
 * ネストされた異種リスト間のBackspace統合テスト
 * 親liの中に異なるタイプのリストが並んでいるとき、
 * 後のリストの先頭でBackspaceを押すと、前のリストの最後のliに統合される
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('ネストされた異種リスト間のBackspace統合', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('数字→バレット: ol>li "b" の後に ul>li "|c" でBackspace → "b"に統合', async ({ page }) => {
        // DOM: <ul><li>a<ol><li>b</li></ol><ul><li>c</li></ul></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ol><li>b</li></ol><ul><li>c</li></ul></li></ul>';
        });

        // cの先頭にカーソルを設定
        await page.evaluate(() => {
            const innerUl = document.querySelector('#editor > ul > li > ul');
            const cLi = innerUl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(cLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // bとcが統合されている
        expect(html).toContain('bc');
        // olの中にbcがある
        expect(html).toMatch(/<ol>.*bc.*<\/ol>/s);
        // aは保持
        expect(html).toContain('a');
    });

    test('バレット→数字: ul>li "b" の後に ol>li "|c" でBackspace → "b"に統合', async ({ page }) => {
        // DOM: <ol><li>a<ul><li>b</li></ul><ol><li>c</li></ol></li></ol>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a<ul><li>b</li></ul><ol><li>c</li></ol></li></ol>';
        });

        await page.evaluate(() => {
            const innerOl = document.querySelector('#editor > ol > li > ol');
            const cLi = innerOl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(cLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('bc');
        expect(html).toMatch(/<ul>.*bc.*<\/ul>/s);
        expect(html).toContain('a');
    });

    test('バレット→タスク: ul>li "b" の後に ul(task)>li "|c" でBackspace → "b"に統合', async ({ page }) => {
        // DOM: <ul><li>a<ul><li>b</li></ul><ul><li><input type="checkbox">c</li></ul></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li></ul><ul><li><input type="checkbox">c</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            // 2番目のulのli（タスク）の先頭にカーソル
            const uls = document.querySelectorAll('#editor > ul > li > ul');
            const taskUl = uls[1]; // 2番目のul
            const cLi = taskUl!.querySelector('li')!;
            // checkboxの後のテキストノード
            const textNode = cLi.lastChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // bの後にcが統合されている（checkboxは除外される）
        expect(html).toContain('bc');
        expect(html).toContain('a');
    });

    test('タスク→バレット: ul(task)>li "b" の後に ul>li "|c" でBackspace → "b"に統合', async ({ page }) => {
        // DOM: <ul><li>a<ul><li><input type="checkbox">b</li></ul><ul><li>c</li></ul></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li><input type="checkbox">b</li></ul><ul><li>c</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const uls = document.querySelectorAll('#editor > ul > li > ul');
            const bulletUl = uls[1]; // 2番目のul（通常のバレット）
            const cLi = bulletUl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(cLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // タスクのbの後にcが統合される
        expect(html).toContain('bc');
        // チェックボックスは保持（タスクリスト側のもの）
        expect(html).toContain('type="checkbox"');
        expect(html).toContain('a');
    });

    test('数字→タスク: ol>li "b" の後に ul(task)>li "|c" でBackspace → "b"に統合', async ({ page }) => {
        // DOM: <ul><li>a<ol><li>b</li></ol><ul><li><input type="checkbox">c</li></ul></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ol><li>b</li></ol><ul><li><input type="checkbox">c</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const taskUl = document.querySelector('#editor > ul > li > ul');
            const cLi = taskUl!.querySelector('li')!;
            // checkboxの後のテキストノード
            const textNode = cLi.lastChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('bc');
        expect(html).toMatch(/<ol>.*bc.*<\/ol>/s);
        expect(html).toContain('a');
    });

    test('タスク→数字: ul(task)>li "b" の後に ol>li "|c" でBackspace → "b"に統合', async ({ page }) => {
        // DOM: <ul><li>a<ul><li><input type="checkbox">b</li></ul><ol><li>c</li></ol></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li><input type="checkbox">b</li></ul><ol><li>c</li></ol></li></ul>';
        });

        await page.evaluate(() => {
            const innerOl = document.querySelector('#editor > ul > li > ol');
            const cLi = innerOl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(cLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('bc');
        // チェックボックスは保持（タスクリスト側のもの）
        expect(html).toContain('type="checkbox"');
        expect(html).toContain('a');
    });

    test('統合後、後続の兄弟liは元のリストに残る', async ({ page }) => {
        // DOM: <ul><li>a<ol><li>b</li></ol><ul><li>c</li><li>d</li></ul></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ol><li>b</li></ol><ul><li>c</li><li>d</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const innerUl = document.querySelector('#editor > ul > li > ul');
            const cLi = innerUl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(cLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // bとcが統合
        expect(html).toContain('bc');
        // dはulに残っている
        expect(html).toContain('d');
        // aは保持
        expect(html).toContain('a');
    });

    test('タスクリスト: チェックボックス前カーソルでBackspace → 兄弟リストの末尾に統合', async ({ page }) => {
        // DOM: <ul><li>a<ul><li>b</li></ul><ul><li><input type="checkbox">c</li></ul></li></ul>
        // カーソルをcheckboxの前（liのoffset 0）に置いてBackspace
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li></ul><ul><li><input type="checkbox">c</li></ul></li></ul>';
        });

        // checkboxの前（liElement offset 0）にカーソルを設定
        await page.evaluate(() => {
            const uls = document.querySelectorAll('#editor > ul > li > ul');
            const taskUl = uls[1]; // 2番目のul（タスク）
            const cLi = taskUl!.querySelector('li')!;
            const range = document.createRange();
            // liElement自体のoffset 0 = checkbox の前
            range.setStart(cLi, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // bとcが統合されている（checkboxは除外される）
        expect(html).toContain('bc');
        expect(html).toContain('a');
    });

    test('タスクリスト: チェックボックス直後カーソルでBackspace → 兄弟リストの末尾に統合', async ({ page }) => {
        // DOM: <ul><li>a<ol><li>b</li></ol><ul><li><input type="checkbox">c</li></ul></li></ul>
        // カーソルをcheckboxの直後（liのoffset 1）に置いてBackspace
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ol><li>b</li></ol><ul><li><input type="checkbox">c</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const taskUl = document.querySelector('#editor > ul > li > ul');
            const cLi = taskUl!.querySelector('li')!;
            const range = document.createRange();
            // liElement のoffset 1 = checkbox の直後
            range.setStart(cLi, 1);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // bとcが統合されている
        expect(html).toContain('bc');
        expect(html).toMatch(/<ol>.*bc.*<\/ol>/s);
        expect(html).toContain('a');
    });

    test('前に兄弟リストがない場合は従来通り親liに統合', async ({ page }) => {
        // DOM: <ul><li>a<ul><li>c</li></ul></li></ul>
        // 前に兄弟リストがないので、従来のCase 1b: 親liの"a"に統合
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><br><ul><li>c</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const innerUl = document.querySelector('#editor > ul > li > ul');
            const cLi = innerUl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(cLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // 親liにcが統合される
        expect(html).toContain('c');
        // ネストされたulは消えている
        const innerUlCount = await page.evaluate(() => {
            return document.querySelectorAll('#editor > ul > li > ul').length;
        });
        expect(innerUlCount).toBe(0);
    });

    // === 深いネストの兄弟リスト: 最深のliに統合されるテスト ===

    test('深いネスト ul→ol: bの子cがある場合、dはcの末尾に統合', async ({ page }) => {
        // - a
        //   - b
        //     - c
        //   1. |d
        // DOM: <ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul><ol><li>d</li></ol></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul><ol><li>d</li></ol></li></ul>';
        });

        await page.evaluate(() => {
            const innerOl = document.querySelector('#editor > ul > li > ol');
            const dLi = innerOl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(dLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // cとdが統合（最深のliに統合）
        expect(html).toContain('cd');
        // bは保持
        expect(html).toContain('b');
        // aは保持
        expect(html).toContain('a');
    });

    test('深いネスト ol→ul: bの子cがある場合、dはcの末尾に統合', async ({ page }) => {
        // 1. a
        //   1. b
        //     1. c
        //   - |d
        // DOM: <ol><li>a<ol><li>b<ol><li>c</li></ol></li></ol><ul><li>d</li></ul></li></ol>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a<ol><li>b<ol><li>c</li></ol></li></ol><ul><li>d</li></ul></li></ol>';
        });

        await page.evaluate(() => {
            const innerUl = document.querySelector('#editor > ol > li > ul');
            const dLi = innerUl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(dLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('cd');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    test('深いネスト ul→task: bの子cがある場合、taskのdはcの末尾に統合', async ({ page }) => {
        // - a
        //   - b
        //     - c
        //   - [x] |d
        // DOM: <ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul><ul><li><input type="checkbox">d</li></ul></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul><ul><li><input type="checkbox">d</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const uls = document.querySelectorAll('#editor > ul > li > ul');
            const taskUl = uls[1]; // 2番目のul（タスク）
            const dLi = taskUl!.querySelector('li')!;
            const textNode = dLi.lastChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('cd');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    test('深いネスト task→ol: bの子cがある場合、olのdはcの末尾に統合', async ({ page }) => {
        // - a
        //   - [x] b
        //     - [x] c
        //   1. |d
        // DOM: <ul><li>a<ul><li><input type="checkbox">b<ul><li><input type="checkbox">c</li></ul></li></ul><ol><li>d</li></ol></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li><input type="checkbox">b<ul><li><input type="checkbox">c</li></ul></li></ul><ol><li>d</li></ol></li></ul>';
        });

        await page.evaluate(() => {
            const innerOl = document.querySelector('#editor > ul > li > ol');
            const dLi = innerOl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(dLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('cd');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    test('深いネスト ol→task: bの子cがある場合、taskのdはcの末尾に統合', async ({ page }) => {
        // 1. a
        //   1. b
        //     1. c
        //   - [x] |d
        // DOM: <ol><li>a<ol><li>b<ol><li>c</li></ol></li></ol><ul><li><input type="checkbox">d</li></ul></li></ol>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a<ol><li>b<ol><li>c</li></ol></li></ol><ul><li><input type="checkbox">d</li></ul></li></ol>';
        });

        await page.evaluate(() => {
            const innerUl = document.querySelector('#editor > ol > li > ul');
            const dLi = innerUl!.querySelector('li')!;
            const textNode = dLi.lastChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('cd');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    test('深いネスト task→ul: bの子cがある場合、ulのdはcの末尾に統合', async ({ page }) => {
        // - a
        //   - [x] b
        //     - [x] c
        //   - |d
        // DOM: <ul><li>a<ul><li><input type="checkbox">b<ul><li><input type="checkbox">c</li></ul></li></ul><ul><li>d</li></ul></li></ul>
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li><input type="checkbox">b<ul><li><input type="checkbox">c</li></ul></li></ul><ul><li>d</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const uls = document.querySelectorAll('#editor > ul > li > ul');
            const bulletUl = uls[1]; // 2番目のul
            const dLi = bulletUl!.querySelector('li')!;
            const range = document.createRange();
            range.setStart(dLi.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('cd');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    // === 複数の兄弟リスト（3つ以上）が並んでいる場合のテスト ===

    test('3つの兄弟リスト: ul+task+ol の後に |f でBackspace → eに統合（最後のolの最後の項目）', async ({ page }) => {
        // 報告されたバグの再現テスト
        // - a
        //   - b
        //     - c
        //     - [ ] d
        //     1. e
        //   - |f
        //     - [ ] g
        // DOM: b の中に <ul>(c,d), <ol>(e) が兄弟として並ぶ
        // f で Backspace → e に統合されるべき（最後の兄弟リストの最後の項目）
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li><li><input type="checkbox">d</li></ul><ol><li>e</li></ol></li><li>f<ul><li><input type="checkbox">g</li></ul></li></ul></li></ul>';
        });

        // f の先頭にカーソルを設定
        await page.evaluate(() => {
            const outerUl = document.querySelector('#editor > ul > li > ul')!;
            const fLi = outerUl.children[1] as HTMLElement; // 2番目のli = f
            const textNode = fLi.firstChild!; // テキスト "f"
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // e と f が統合されているべき（d ではなく e）
        expect(html).toContain('ef');
        // d は保持（checkbox付き）
        expect(html).toContain('d');
        // c, b, a は保持
        expect(html).toContain('c');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    test('3つの兄弟リスト: ul+ol+task の後に |g でBackspace → 最後のtaskリストの最後の項目に統合', async ({ page }) => {
        // b の中に <ul>(c), <ol>(d), <ul-task>(e) が兄弟として並ぶ
        // f で Backspace → e（最後の兄弟リストの最後の項目）に統合
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul><ol><li>d</li></ol><ul><li><input type="checkbox">e</li></ul></li><li>f</li></ul></li></ul>';
        });

        // f の先頭にカーソルを設定
        await page.evaluate(() => {
            const outerUl = document.querySelector('#editor > ul > li > ul')!;
            const fLi = outerUl.children[1] as HTMLElement; // 2番目のli = f
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // e と f が統合されている（c や d ではなく e）
        expect(html).toContain('ef');
        // d は保持
        expect(html).toContain('d');
        // c, b, a は保持
        expect(html).toContain('c');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    test('2つの同種リスト (ul+ul): findDeepestLastLi は最後の ul の最後の li を選ぶ', async ({ page }) => {
        // b の中に 2つの <ul> が兄弟として並ぶ場合
        // b → <ul>(c) → <ul>(d)
        // f で Backspace → d に統合
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul><ul><li>d</li></ul></li><li>f</li></ul></li></ul>';
        });

        await page.evaluate(() => {
            const outerUl = document.querySelector('#editor > ul > li > ul')!;
            const fLi = outerUl.children[1] as HTMLElement;
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // d と f が統合（c ではなく d）
        expect(html).toContain('df');
        expect(html).toContain('c');
        expect(html).toContain('b');
        expect(html).toContain('a');
    });
});
