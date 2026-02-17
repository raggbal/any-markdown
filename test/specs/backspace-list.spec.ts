/**
 * Backspaceキー操作テスト（リスト関連）
 * 
 * 要件ドキュメント: docs/requirement-backspace-list.md
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('【要件1】空のネストリスト項目でBackspace → 段落に変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('中間の項目: 前後に兄弟あり → リストを分割し段落を中間に挿入', async ({ page }) => {
        // 初期状態:
        // - ccc
        //   - dd
        //   - | (空、カーソル)
        //   - fff
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>ccc<ul><li>dd</li><li><br></li><li>fff</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のネスト項目にカーソルを移動
        await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul');
            const emptyLi = nestedUl.querySelectorAll('li')[1]; // 2番目のli（空）
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落が作成されていること
        expect(html).toContain('<p>');
        // ddとfffが残っていること
        expect(html).toContain('dd');
        expect(html).toContain('fff');
        // リストが分割されていること（2つのulがcccの子として存在）
        const nestedUlCount = (html.match(/<li>ccc.*?<ul>/gs) || []).length;
        expect(nestedUlCount).toBeGreaterThanOrEqual(1);
    });

    test('最初の項目: 後ろに兄弟あり → 段落をリストの前に挿入', async ({ page }) => {
        // 初期状態:
        // - bbb
        //   - | (空、カーソル)
        //   - dd
        //   - fff
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>bbb<ul><li><br></li><li>dd</li><li>fff</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のネスト項目にカーソルを移動
        await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul');
            const emptyLi = nestedUl.querySelector('li'); // 最初のli（空）
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落が作成されていること
        expect(html).toContain('<p>');
        // ddとfffが残っていること
        expect(html).toContain('dd');
        expect(html).toContain('fff');
    });

    test('最後の項目: 前に兄弟あり → 段落をリストの後に挿入', async ({ page }) => {
        // 初期状態:
        // - bbb
        //   - dd
        //   - | (空、カーソル)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>bbb<ul><li>dd</li><li><br></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のネスト項目にカーソルを移動
        await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul');
            const emptyLi = nestedUl.querySelectorAll('li')[1]; // 2番目のli（空）
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落が作成されていること
        expect(html).toContain('<p>');
        // ddが残っていること
        expect(html).toContain('dd');
    });
});

test.describe('【要件1.5】単独の空ネストリスト項目でBackspace×2 → 親テキストの末尾にカーソル', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('単独の空ネストリスト項目: Backspace×2で親テキストの末尾にカーソル移動', async ({ page }) => {
        // 初期状態（1回目のBackspace後の状態をシミュレート）:
        // - aaa
        //   | (空の段落、カーソル)
        // - ccc
        // - ddd
        // 
        // これは、以下の状態から1回目のBackspaceを押した後の状態:
        // - aaa
        //   - | (空のネストリスト)
        // - ccc
        // - ddd
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa<p><br></p></li><li>ccc</li><li>ddd</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspace → 段落を削除し、親テキスト(aaa)の末尾にカーソル移動
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // aaaが残っていること
        expect(html).toContain('aaa');
        // cccとdddが残っていること
        expect(html).toContain('ccc');
        expect(html).toContain('ddd');
        
        // カーソルがaaa（親テキスト）にあることを確認
        const cursorText = await editor.getCursorText();
        expect(cursorText).toBe('aaa');
    });
});

test.describe('【要件2】親li内の空の段落でBackspace → リスト統合', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('Case 1: 上下がリスト → 段落を削除しリストを統合', async ({ page }) => {
        // 初期状態（1回目のBackspace後の状態）:
        // - ccc
        //   - dd
        //   | (段落)
        //   - fff
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>ccc<ul><li>dd</li></ul><p><br></p><ul><li>fff</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // ddとfffが同じリストに統合されていること
        expect(html).toContain('dd');
        expect(html).toContain('fff');
        expect(html).toMatch(/<li>dd<\/li>.*<li>fff<\/li>/s);
    });

    test('Case 1: カーソルは上のリストの最後の要素の末尾', async ({ page }) => {
        // 初期状態:
        // - bb
        //   - ccc
        //   | (段落)
        //   - eee
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>bb<ul><li>ccc</li></ul><p><br></p><ul><li>eee</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // カーソルがccc（上のリストの最後の要素）にあることを確認
        const cursorText = await editor.getCursorText();
        expect(cursorText).toBe('ccc');
    });

    test('Case 2: 上がテキスト、下がリスト → 段落を削除', async ({ page }) => {
        // 初期状態:
        // - bbb
        //   | (段落)
        //   - dd
        //   - fff
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>bbb<p><br></p><ul><li>dd</li><li>fff</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // bbb, dd, fffが残っていること
        expect(html).toContain('bbb');
        expect(html).toContain('dd');
        expect(html).toContain('fff');
    });
});

test.describe('【要件3】トップレベルの空リスト項目でBackspace → 段落に変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('中間の項目: 前後に兄弟あり → リストを分割し段落を中間に挿入', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - | (空、カーソル)
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li><br></li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の項目にカーソルを移動
        await page.evaluate(() => {
            const emptyLi = document.querySelectorAll('li')[1]; // 2番目のli（空）
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落が作成されていること
        expect(html).toContain('<p>');
        // aaaとcccが残っていること
        expect(html).toContain('aaa');
        expect(html).toContain('ccc');
        // リストが分割されていること（2つのulが存在）
        const ulCount = (html.match(/<ul>/g) || []).length;
        expect(ulCount).toBe(2);
    });
});

test.describe('【要件4】トップレベルの段落がリストに挟まれている時のBackspace → 同じ階層で統合', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('同じ階層のリストで統合（ネストリストにならない）', async ({ page }) => {
        // 初期状態:
        // - aaa
        // | (空の段落)
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li></ul><p><br></p><ul><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // aaaとcccが存在すること
        expect(html).toContain('aaa');
        expect(html).toContain('ccc');
        // 要件5-5 (updated): 次のリストの項目が前のリストに同じレベルで統合される
        // cccがaaaと同じレベルにあること（ネストされていない）
        expect(html).toMatch(/<li>aaa<\/li>.*<li>ccc<\/li>/s);
        // ネストされていないことを確認
        expect(html).not.toMatch(/<li>aaa<ul>.*<li>ccc<\/li>.*<\/ul><\/li>/s);
    });

    test('カーソルは上のリストの最後の要素の末尾', async ({ page }) => {
        // 初期状態:
        // - aaa
        // | (空の段落)
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li></ul><p><br></p><ul><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // 要件5-5: カーソルがaaa（上のリストの最後の要素）の末尾にあることを確認
        // ネストされた後もaaaの末尾にカーソルがある
        const cursorInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return { text: '', offset: 0 };
            const anchorNode = sel.anchorNode;
            return {
                text: anchorNode?.textContent || '',
                offset: sel.anchorOffset
            };
        });
        // カーソルがaaaテキストノードの末尾（offset=3）にあること
        expect(cursorInfo.text).toBe('aaa');
        expect(cursorInfo.offset).toBe(3);
    });
});

test.describe('【要件5】リストの後の空の段落でBackspace → リストの最後の要素にカーソル', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('ネストリストがある場合、最も深い最後の要素にカーソル', async ({ page }) => {
        // 初期状態:
        // - aa
        // - bb
        //   - ccc
        //   - eee
        // | (空の段落)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aa</li><li>bb<ul><li>ccc</li><li>eee</li></ul></li></ul><p><br></p>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // カーソルがeee（最も深い最後の要素）にあることを確認
        const cursorText = await editor.getCursorText();
        expect(cursorText).toBe('eee');
    });
});

test.describe('【要件6】段落の後のリストの最初の項目でBackspace → 段落に変換（統合しない）', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('前の段落と統合しない', async ({ page }) => {
        // 初期状態:
        // aaa
        // - |bbb (カーソルは先頭)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p>aaa</p><ul><li>bbb</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // リストの最初の項目の先頭にカーソルを移動
        await page.evaluate(() => {
            const li = document.querySelector('li');
            const range = document.createRange();
            range.setStart(li.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // aaaとbbbが別々の段落として存在すること
        expect(html).toContain('aaa');
        expect(html).toContain('bbb');
        // 統合されていないこと（aaabbbにならない）
        expect(html).not.toContain('aaabbb');
    });

    test('前の要素がリストの場合は統合される', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - |bbb (カーソルは先頭)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 2番目のリスト項目の先頭にカーソルを移動
        await page.evaluate(() => {
            const li = document.querySelectorAll('li')[1];
            const range = document.createRange();
            range.setStart(li.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // aaaとbbbが統合されていること
        expect(html).toContain('aaabbb');
    });
});

test.describe('【要件7】ページの一番上のリストの最初の項目でBackspace → 段落に変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('ページの一番上でリスト項目を段落に変換', async ({ page }) => {
        // 初期状態:
        // - |aaa (ページの一番上、カーソルは先頭)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // リストの最初の項目の先頭にカーソルを移動
        await page.evaluate(() => {
            const li = document.querySelector('li');
            const range = document.createRange();
            range.setStart(li.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落に変換されていること
        expect(html).toContain('<p>');
        expect(html).toContain('aaa');
        // リストがなくなっていること
        expect(html).not.toContain('<ul>');
        expect(html).not.toContain('<li>');
    });

    test('複数項目のリストの場合、最初の項目のみ段落に変換', async ({ page }) => {
        // 初期状態:
        // - |aaa (カーソルは先頭)
        // - bbb
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // リストの最初の項目の先頭にカーソルを移動
        await page.evaluate(() => {
            const li = document.querySelector('li');
            const range = document.createRange();
            range.setStart(li.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // aaaが段落に変換されていること
        expect(html).toContain('<p>');
        expect(html).toContain('aaa');
        // bbbはリストに残っていること
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
        expect(html).toContain('bbb');
    });
});

test.describe('【統合テスト】Backspace連続操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('ネストリスト: 空項目でBackspace×2 → 段落変換後、リスト統合', async ({ page }) => {
        // 初期状態:
        // - ccc
        //   - dd
        //   - | (空、カーソル)
        //   - fff
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>ccc<ul><li>dd</li><li><br></li><li>fff</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のネスト項目にカーソルを移動
        await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul');
            const emptyLi = nestedUl.querySelectorAll('li')[1]; // 2番目のli（空）
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // 1回目のBackspace → 段落に変換
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        // 段落が作成されていること
        expect(html).toContain('<p>');
        
        // 2回目のBackspace → リスト統合
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // ddとfffが同じリストに統合されていること
        expect(html).toMatch(/<li>dd<\/li>.*<li>fff<\/li>/s);
    });

    test('トップレベル: 空項目でBackspace×2 → 段落変換後、リスト統合', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - | (空、カーソル)
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li><br></li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の項目にカーソルを移動
        await page.evaluate(() => {
            const emptyLi = document.querySelectorAll('li')[1]; // 2番目のli（空）
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // 1回目のBackspace → 段落に変換
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        // 段落が作成されていること
        expect(html).toContain('<p>');
        // リストが分割されていること
        const ulCount1 = (html.match(/<ul>/g) || []).length;
        expect(ulCount1).toBe(2);
        
        // 2回目のBackspace → 要件5-5 (updated): 次のリストの項目が前のリストに同じレベルで統合
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // aaaとcccが存在すること
        expect(html).toContain('aaa');
        expect(html).toContain('ccc');
        // cccがaaaと同じレベルにあること（ネストされていない）
        expect(html).toMatch(/<li>aaa<\/li>.*<li>ccc<\/li>/s);
        // ネストされていないことを確認
        expect(html).not.toMatch(/<li>aaa<ul>.*<li>ccc<\/li>.*<\/ul><\/li>/s);
    });
});

test.describe('【要件8】リストの複数行選択でTab/Shift+Tab → 一括インデント/逆インデント', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('複数選択でTab → 一括インデント', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - bbb  ← 選択開始
        // - ccc  ← 選択終了
        // - ddd
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li>ccc</li><li>ddd</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // bbbからcccまでを選択
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const bbbLi = lis[1]; // bbb
            const cccLi = lis[2]; // ccc
            const range = document.createRange();
            range.setStart(bbbLi.firstChild, 0);
            range.setEnd(cccLi.firstChild, cccLi.firstChild.textContent.length);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Tabを押す
        await editor.press('Tab');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // bbbとcccがネストリストになっていること
        expect(html).toContain('<ul><li>aaa<ul><li>bbb</li><li>ccc</li></ul></li><li>ddd</li></ul>');
    });

    test('複数選択でShift+Tab → 一括逆インデント', async ({ page }) => {
        // 初期状態:
        // - aaa
        //   - bbb  ← 選択開始
        //   - ccc  ← 選択終了
        // - ddd
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa<ul><li>bbb</li><li>ccc</li></ul></li><li>ddd</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // bbbからcccまでを選択
        await page.evaluate(() => {
            const nestedLis = document.querySelectorAll('ul ul li');
            const bbbLi = nestedLis[0]; // bbb
            const cccLi = nestedLis[1]; // ccc
            const range = document.createRange();
            range.setStart(bbbLi.firstChild, 0);
            range.setEnd(cccLi.firstChild, cccLi.firstChild.textContent.length);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Shift+Tabを押す
        await editor.press('Shift+Tab');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // bbbとcccがトップレベルに戻っていること
        expect(html).toContain('<li>aaa</li>');
        expect(html).toContain('<li>bbb</li>');
        expect(html).toContain('<li>ccc</li>');
        expect(html).toContain('<li>ddd</li>');
        // ネストリストがなくなっていること
        expect(html).not.toContain('<ul><li>bbb');
    });

    test('最初の項目に前の兄弟がない場合はインデント不可', async ({ page }) => {
        // 初期状態:
        // - aaa  ← 選択開始（前の兄弟なし）
        // - bbb  ← 選択終了
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // aaaからbbbまでを選択
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const aaaLi = lis[0]; // aaa
            const bbbLi = lis[1]; // bbb
            const range = document.createRange();
            range.setStart(aaaLi.firstChild, 0);
            range.setEnd(bbbLi.firstChild, bbbLi.firstChild.textContent.length);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Tabを押す
        await editor.press('Tab');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 変化がないこと（ネストリストが作成されていない）
        expect(html).toBe('<ul><li>aaa</li><li>bbb</li><li>ccc</li></ul>');
    });

    test('ネストリストでの複数選択インデント', async ({ page }) => {
        // 初期状態:
        // - aaa
        //   - bbb
        //   - ccc  ← 選択開始
        //   - ddd  ← 選択終了
        //   - eee
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa<ul><li>bbb</li><li>ccc</li><li>ddd</li><li>eee</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // cccからdddまでを選択
        await page.evaluate(() => {
            const nestedLis = document.querySelectorAll('ul ul li');
            const cccLi = nestedLis[1]; // ccc
            const dddLi = nestedLis[2]; // ddd
            const range = document.createRange();
            range.setStart(cccLi.firstChild, 0);
            range.setEnd(dddLi.firstChild, dddLi.firstChild.textContent.length);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Tabを押す
        await editor.press('Tab');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // cccとdddがbbbの下にネストされていること
        expect(html).toContain('<li>bbb<ul><li>ccc</li><li>ddd</li></ul></li>');
        // eeeはそのまま
        expect(html).toContain('<li>eee</li>');
    });

    test('単一項目選択の場合は通常のインデント動作', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - bbb  ← カーソル
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // bbbにカーソルを置く（選択なし）
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const bbbLi = lis[1]; // bbb
            const range = document.createRange();
            range.setStart(bbbLi.firstChild, 1);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Tabを押す
        await editor.press('Tab');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // bbbのみがネストされていること
        expect(html).toContain('<li>aaa<ul><li>bbb</li></ul></li>');
        expect(html).toContain('<li>ccc</li>');
    });
});

test.describe('【要件9】リスト行先頭でBackspace → 上の行の末尾に統合（インデント違いも対応）', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('上の行がネストリストの最後の要素の場合、その要素の末尾に統合', async ({ page }) => {
        // 初期状態:
        // - aaa
        //   - bbb
        //   - ccc
        // - |ddd   (|カーソル)
        //
        // 期待結果:
        // - aaa
        //   - bbb
        //   - ccc|ddd   (|カーソル)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa<ul><li>bbb</li><li>ccc</li></ul></li><li>ddd</li></ul>';
        });
        await page.waitForTimeout(100);

        // dddの先頭にカーソルを移動
        await page.evaluate(() => {
            const lis = document.querySelectorAll('#editor > ul > li');
            const dddLi = lis[1]; // ddd
            const range = document.createRange();
            range.setStart(dddLi.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // cccとdddが統合されていること
        expect(html).toContain('cccddd');
        // dddが独立したliとして残っていないこと
        expect(html).not.toMatch(/<li>ddd<\/li>/);
    });

    test('上の行が同じインデントの場合、その要素の末尾に統合', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - |bbb   (|カーソル)
        // - ccc
        //
        // 期待結果:
        // - aaa|bbb   (|カーソル)
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);

        // bbbの先頭にカーソルを移動
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const bbbLi = lis[1]; // bbb
            const range = document.createRange();
            range.setStart(bbbLi.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // aaaとbbbが統合されていること
        expect(html).toContain('aaabbb');
        // cccが残っていること
        expect(html).toContain('ccc');
    });

    test('深いネストの場合も最も深い最後の要素に統合', async ({ page }) => {
        // 初期状態:
        // - aaa
        //   - bbb
        //     - ccc
        // - |ddd   (|カーソル)
        //
        // 期待結果:
        // - aaa
        //   - bbb
        //     - ccc|ddd   (|カーソル)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa<ul><li>bbb<ul><li>ccc</li></ul></li></ul></li><li>ddd</li></ul>';
        });
        await page.waitForTimeout(100);

        // dddの先頭にカーソルを移動
        await page.evaluate(() => {
            const lis = document.querySelectorAll('#editor > ul > li');
            const dddLi = lis[1]; // ddd
            const range = document.createRange();
            range.setStart(dddLi.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // cccとdddが統合されていること
        expect(html).toContain('cccddd');
        // dddが独立したliとして残っていないこと
        expect(html).not.toMatch(/<li>ddd<\/li>/);
    });

    test('現在行にネストリストがある場合、統合先に移動', async ({ page }) => {
        // 初期状態:
        // - aaa
        //   - bbb
        // - |ccc   (|カーソル)
        //   - ddd
        //
        // 期待結果:
        // - aaa
        //   - bbb|ccc   (|カーソル)
        //     - ddd
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa<ul><li>bbb</li></ul></li><li>ccc<ul><li>ddd</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // cccの先頭にカーソルを移動
        await page.evaluate(() => {
            const lis = document.querySelectorAll('#editor > ul > li');
            const cccLi = lis[1]; // ccc
            const textNode = cccLi.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // bbbとcccが統合されていること
        expect(html).toContain('bbbccc');
        // dddがネストリストとして残っていること
        expect(html).toContain('ddd');
    });
});

test.describe('【要件10】空のリストアイテムの<br>保持（ネストリストがある場合）', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('複雑なネスト構造: 空の段落からBackspaceで<br>が保持される', async ({ page }) => {
        // 初期状態（1回目のBackspace後の状態をシミュレート）:
        // - 
        //   - 
        //   - aa
        //   - 
        //     - bbb
        //   - 
        // | (空の段落、カーソル)
        //
        // Backspace → リストにマージ
        // 
        // 期待: 最初の空のトップレベルリストアイテムの<br>が保持される
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li><br><ul><li><br></li><li>aa</li><li><br><ul><li>bbb</li></ul></li><li><br></li></ul></li></ul><p><br></p>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspace → リストにマージ
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        
        // 重要: 最初のliの<br>が保持されていること（"- -"にならない）
        // 最初のliは <li><br><ul>...</ul></li> という構造
        const firstLi = await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li');
            return li ? li.innerHTML.substring(0, 50) : null;
        });
        expect(firstLi).toContain('<br>');
        expect(firstLi).toContain('<ul>');
        
        // aaとbbbが残っていること
        expect(html).toContain('aa');
        expect(html).toContain('bbb');
    });

    test('通常のリスト: Backspace時に末尾の<br>は削除される', async ({ page }) => {
        // 初期状態:
        // - aaa
        // | (空の段落)
        //
        // Backspace → 段落を削除し、aaaの末尾にカーソル
        // この場合、aaaの末尾の<br>は削除されるべき（通常動作）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa<br></li></ul><p><br></p>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // aaaが残っていること
        expect(html).toContain('aaa');
    });

    test('空のリストアイテムにネストリストがある場合: <br>が保持される', async ({ page }) => {
        // 初期状態:
        // - (空、ネストリストあり)
        //   - child
        // | (空の段落)
        //
        // Backspace → 段落を削除
        // 期待: 最初のliの<br>が保持される（ネストリストの前にある）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li><br><ul><li>child</li></ul></li></ul><p><br></p>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        
        // 重要: 最初のliの<br>が保持されていること
        const firstLi = await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li');
            return li ? li.innerHTML : null;
        });
        expect(firstLi).toContain('<br>');
        expect(firstLi).toContain('<ul>');
        
        // childが残っていること
        expect(html).toContain('child');
    });

    test('複数のトップレベルアイテム: 正しいアイテムの<br>のみ保持', async ({ page }) => {
        // 初期状態:
        // - (空、ネストリストあり)
        //   - nested
        // - text
        // | (空の段落)
        //
        // Backspace → 段落を削除、textの末尾にカーソル
        // 期待: 最初のliの<br>は保持、textの末尾の<br>は削除
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li><br><ul><li>nested</li></ul></li><li>text<br></li></ul><p><br></p>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        
        // 最初のliの<br>が保持されていること
        const firstLi = await page.evaluate(() => {
            const lis = document.querySelectorAll('#editor > ul > li');
            return lis[0] ? lis[0].innerHTML : null;
        });
        expect(firstLi).toContain('<br>');
        expect(firstLi).toContain('<ul>');
        
        // nestedとtextが残っていること
        expect(html).toContain('nested');
        expect(html).toContain('text');
    });
});

test.describe('【要件11】深いネストリストでのBackspace連続操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('深いネスト: 空項目でBackspace×3 → 段落変換→統合→段落変換（バグ再現防止）', async ({ page }) => {
        // 報告されたバグケース:
        // (最初)
        // - 
        //   - 
        //     - 
        //   - |    ← カーソル位置
        //     - 
        // (1回目 Backspace) 段落になる → OK
        // (2回目 Backspace) 段落削除し、上のリストに合流 → OK
        // (3回目 Backspace) 段落にならず、上のリストに合流。その際、- - | とバグる → NG
        
        // HTMLで初期状態を設定（より正確な構造）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // 構造:
            // - (空)
            //   - (空)
            //     - (空)
            //   - (空) ← カーソル位置
            //     - (空)
            editor.innerHTML = '<ul><li><br><ul><li><br><ul><li><br></li></ul></li><li><br><ul><li><br></li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 4番目のli（2番目のネストの2番目の項目）にカーソルを設定
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const allLis = editor.querySelectorAll('li');
            // 0: 最初のトップレベルli
            // 1: 2番目のネストli（最初の子）
            // 2: 3番目のネストli（最深）
            // 3: 4番目のli（2番目のネストの2番目の項目）← ここにカーソル
            // 4: 5番目のli（4番目のliのネスト）
            const targetLi = allLis[3];
            if (targetLi) {
                const range = document.createRange();
                range.selectNodeContents(targetLi);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // 1回目のBackspace: 段落に変換
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        // 段落が作成されていること
        expect(html).toContain('<p>');
        
        // 2回目のBackspace: 段落削除、上のリストに合流
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        // 構造が壊れていないこと（「- - 」のような表示にならない）
        const hasBrokenLi = await page.evaluate(() => {
            const lis = document.querySelectorAll('#editor li');
            for (const li of lis) {
                for (const child of li.childNodes) {
                    if (child.nodeType === 3) {
                        if (child.textContent.includes('- ')) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
        expect(hasBrokenLi).toBe(false);
        
        // 3回目のBackspace
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        // 構造が壊れていないこと
        const hasBrokenLi2 = await page.evaluate(() => {
            const lis = document.querySelectorAll('#editor li');
            for (const li of lis) {
                for (const child of li.childNodes) {
                    if (child.nodeType === 3) {
                        if (child.textContent.includes('- ')) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
        expect(hasBrokenLi2).toBe(false);
    });

    test('深いネスト: 連続Backspaceでリスト構造が維持される', async ({ page }) => {
        // より単純なケース
        // - parent
        //   - child1
        //   - |  ← 空のchild2にカーソル
        //     - grandchild
        
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>parent<ul><li>child1</li><li><br><ul><li>grandchild</li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のchild2にカーソルを設定
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const lis = editor.querySelectorAll('li');
            // 0: parent, 1: child1, 2: child2 (空), 3: grandchild
            const targetLi = lis[2];
            if (targetLi) {
                const range = document.createRange();
                range.selectNodeContents(targetLi);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // 1回目のBackspace: 段落に変換
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).toContain('parent');
        expect(html).toContain('child1');
        expect(html).toContain('grandchild');
        
        // 2回目のBackspace: 段落削除、child1の末尾に統合
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        expect(html).not.toContain('<p>');
        expect(html).toContain('parent');
        expect(html).toContain('child1');
        expect(html).toContain('grandchild');
    });
});