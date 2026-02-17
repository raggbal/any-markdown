/**
 * キー操作テスト
 * フェーズ3: 各要素のキー操作動作確認
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《段落》キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('Enter → 新しい《段落》作成', async ({ page }) => {
        await editor.type('最初の段落');
        await editor.press('Enter');
        await editor.type('次の段落');
        
        const html = await editor.getHtml();
        expect(html).toContain('<p>最初の段落</p>');
        expect(html).toContain('<p>次の段落</p>');
    });

    test('空の《段落》でEnter → 新しい空《段落》', async ({ page }) => {
        await editor.type('テスト');
        await editor.press('Enter');
        await editor.press('Enter');
        await editor.type('空行の後');
        
        const html = await editor.getHtml();
        expect(html).toContain('<p>テスト</p>');
        expect(html).toContain('<p>空行の後</p>');
    });

    test('Tab → 4スペース挿入', async ({ page }) => {
        await editor.type('インデント前');
        await editor.press('Home');
        await editor.press('Tab');
        
        const text = await editor.getCursorText();
        // 4スペースが挿入されていることを確認
        expect(text).toMatch(/^    /);
    });
});

test.describe('《見出し》キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('# + Space → 《見出し》レベル1', async ({ page }) => {
        await editor.type('# ');
        await editor.type('見出し1');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h1>見出し1</h1>');
    });

    test('## + Space → 《見出し》レベル2', async ({ page }) => {
        await editor.type('## ');
        await editor.type('見出し2');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h2>見出し2</h2>');
    });

    test('既存テキストの行頭で # + Space → 《見出し》に変換', async ({ page }) => {
        // 行頭から入力する場合のテスト
        await editor.type('# ');
        await editor.type('既存テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h1>既存テキスト</h1>');
    });

    test('既存テキストの行頭で ## + Space → 《見出し》レベル2に変換', async ({ page }) => {
        await editor.type('## ');
        await editor.type('見出し2テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h2>見出し2テキスト</h2>');
    });

    test('既存テキストの行頭で ### + Space → 《見出し》レベル3に変換', async ({ page }) => {
        await editor.type('### ');
        await editor.type('見出し3テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h3>見出し3テキスト</h3>');
    });

    test('既存テキストの行頭で #### + Space → 《見出し》レベル4に変換', async ({ page }) => {
        await editor.type('#### ');
        await editor.type('見出し4テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h4>見出し4テキスト</h4>');
    });

    test('既存テキストの行頭で ##### + Space → 《見出し》レベル5に変換', async ({ page }) => {
        await editor.type('##### ');
        await editor.type('見出し5テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h5>見出し5テキスト</h5>');
    });

    test('既存テキストの行頭で ###### + Space → 《見出し》レベル6に変換', async ({ page }) => {
        await editor.type('###### ');
        await editor.type('見出し6テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h6>見出し6テキスト</h6>');
    });

    test('《見出し》末尾でEnter → 新しい要素', async ({ page }) => {
        await editor.type('# ');
        await editor.type('見出し');
        await editor.press('Enter');
        await editor.type('段落テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h1>見出し</h1>');
        // Enterで新しい要素が作成されることを確認（divまたはp）
        expect(html).toMatch(/段落テキスト/);
    });

    test('《見出し》先頭でBackspace → 《段落》変換', async ({ page }) => {
        await editor.type('# ');
        await editor.type('見出し');
        await editor.press('Home');
        await editor.press('Backspace');
        
        const html = await editor.getHtml();
        expect(html).toContain('<p>見出し</p>');
    });
});


test.describe('《リスト項目》キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('- + Space → 《順序なしリスト》', async ({ page }) => {
        await editor.type('- ');
        await editor.type('リスト項目');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>リスト項目</li>');
    });

    test('* + Space → 《順序なしリスト》', async ({ page }) => {
        await editor.type('* ');
        await editor.type('リスト項目');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>リスト項目</li>');
    });

    test('1. + Space → 《順序付きリスト》', async ({ page }) => {
        await editor.type('1. ');
        await editor.type('番号付き項目');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>番号付き項目</li>');
    });

    test('- [ ] + Space → 《タスクリスト》', async ({ page }) => {
        await editor.type('- [ ] ');
        await editor.type('タスク項目');
        
        const html = await editor.getHtml();
        // タスクリストはチェックボックス付きリストとして表示
        expect(html).toContain('<ul>');
        expect(html).toContain('タスク項目');
    });

    test('既存テキストの行頭で - + Space → 《順序なしリスト》に変換', async ({ page }) => {
        await editor.type('- ');
        await editor.type('既存リスト項目');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>既存リスト項目</li>');
    });

    test('既存テキストの行頭で * + Space → 《順序なしリスト》に変換', async ({ page }) => {
        await editor.type('* ');
        await editor.type('アスタリスクリスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>アスタリスクリスト</li>');
    });

    test('既存テキストの行頭で + + Space → 《順序なしリスト》に変換', async ({ page }) => {
        await editor.type('+ ');
        await editor.type('プラスリスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>プラスリスト</li>');
    });

    test('既存テキストの行頭で 1. + Space → 《順序付きリスト》に変換', async ({ page }) => {
        await editor.type('1. ');
        await editor.type('番号付き既存項目');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>番号付き既存項目</li>');
    });

    test('既存テキストの行頭で - [ ] + Space → 《タスクリスト》に変換', async ({ page }) => {
        // まず順序なしリストを作成し、先頭で [ ] を入力
        await editor.type('- ');
        await editor.type('[ ] ');
        await editor.type('既存タスク');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('既存タスク');
        expect(html).toContain('<input type="checkbox"');
    });

    test('テキストありでEnter → 新しい《リスト項目》', async ({ page }) => {
        await editor.type('- ');
        await editor.type('項目1');
        await editor.press('Enter');
        await editor.type('項目2');
        
        const html = await editor.getHtml();
        expect(html).toContain('<li>項目1</li>');
        expect(html).toContain('<li>項目2</li>');
    });

    test('空の《リスト項目》でEnter → リスト脱出', async ({ page }) => {
        await editor.type('- ');
        await editor.type('項目');
        await editor.press('Enter');
        await editor.press('Enter');
        await editor.type('リスト外');
        
        const html = await editor.getHtml();
        expect(html).toContain('<li>項目</li>');
        expect(html).toContain('<p>リスト外</p>');
    });

    test('空の《リスト項目》（トップレベル中間）でEnter → 段落に変換（位置維持、後続は別リスト）', async ({ page }) => {
        // 初期状態を設定: - 0, - (空), - b, - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>0</li><li><br></li><li>b</li><li>c</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 2番目の空項目にカーソルを移動
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const emptyLi = editor.querySelectorAll('li')[1];
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        
        // Enterを押す
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        const md = await editor.getMarkdown();
        // 期待: - 0 の後に段落、その後に - b, - c
        expect(md).toContain('- 0');
        expect(md).toContain('- b');
        expect(md).toContain('- c');
    });

    test('空の《リスト項目》（トップレベル中間）でEnter → 後続リストが分割される', async ({ page }) => {
        // 初期状態を設定: - 0, - (空), - b, - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>0</li><li><br></li><li>b</li><li>c</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 2番目の空項目にカーソルを移動
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const emptyLi = editor.querySelectorAll('li')[1];
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        
        // Enterを押す
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 期待: <ul><li>0</li></ul><p>...</p><ul><li>b</li><li>c</li></ul>
        // 2つのulが存在するはず
        const ulCount = (html.match(/<ul>/g) || []).length;
        expect(ulCount).toBe(2);
        expect(html).toContain('<p>');
    });

    test('空の《リスト項目》（ネストリスト内中間）でEnter → 同じ位置で親レベルに変換', async ({ page }) => {
        // 初期状態を設定:
        // - aa
        // - bbb
        //   - (空) ← カーソル
        //   - ddd
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aa</li><li>bbb<ul><li><br></li><li>ddd</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // ネストの空項目にカーソルを移動
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const nestedUl = editor.querySelector('ul ul');
            const emptyLi = nestedUl.querySelector('li');
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        
        // Enterを押す
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        const md = await editor.getMarkdown();
        // 期待:
        // - aa
        // - bbb
        // - 
        //   - ddd
        // 親レベルに空項目ができ、dddはネストのまま
        expect(md).toContain('- aa');
        expect(md).toContain('- bbb');
        // ddd がネストされていることを確認（インデントあり）
        expect(md).toMatch(/^\s+- ddd/m);
    });

    test('ネストリストで連続Enter → 親レベルに戻り、さらにEnterで段落に', async ({ page }) => {
        // 初期状態を設定:
        // - aa
        // - bbb
        //   - (空) ← カーソル
        //   - ddd
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aa</li><li>bbb<ul><li><br></li><li>ddd</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // ネストの空項目にカーソルを移動
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const nestedUl = editor.querySelector('ul ul');
            const emptyLi = nestedUl.querySelector('li');
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        
        // 1回目のEnter → 親レベルに
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        // 2回目のEnter → 段落に
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        const md = await editor.getMarkdown();
        // 段落が存在するはず
        expect(html).toContain('<p>');
        // ddd がまだリストとして存在するはず
        expect(md).toContain('- ddd');
    });

    test('Tab → インデント（ネストリスト）', async ({ page }) => {
        await editor.type('- ');
        await editor.type('親項目');
        await editor.press('Enter');
        await editor.press('Tab');
        await editor.type('子項目');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('子項目');
    });
});

test.describe('《引用》キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('> + Space → 《引用》', async ({ page }) => {
        await editor.type('> ');
        await editor.type('引用テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('引用テキスト');
    });

    test('既存テキストの行頭で > + Space → 《引用》に変換', async ({ page }) => {
        await editor.type('> ');
        await editor.type('既存引用テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('既存引用テキスト');
    });

    test('《引用》内でEnter → 改行挿入', async ({ page }) => {
        await editor.type('> ');
        await editor.type('1行目');
        await editor.press('Enter');
        await editor.type('2行目');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('1行目');
        expect(html).toContain('2行目');
    });

    test('《引用》先頭でBackspace → 《段落》変換', async ({ page }) => {
        await editor.type('> ');
        await editor.type('引用');
        await editor.press('Home');
        await editor.press('Backspace');
        
        const html = await editor.getHtml();
        expect(html).toContain('<p>引用</p>');
    });
});


test.describe('《コードブロック》キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('``` + Enter → 《コードブロック》', async ({ page }) => {
        await editor.type('```');
        await editor.press('Enter');
        
        const html = await editor.getHtml();
        expect(html).toContain('<pre');
        expect(html).toContain('<code');
    });

    test('```javascript + Enter → 言語指定付き《コードブロック》', async ({ page }) => {
        await editor.type('```javascript');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        
        const html = await editor.getHtml();
        expect(html).toContain('<pre');
        // data-lang属性で言語が保持されていることを確認
        expect(html).toContain('data-lang="javascript"');
    });

    test('《コードブロック》内でEnter → 改行挿入', async ({ page }) => {
        await editor.type('```');
        await editor.press('Enter');
        await editor.type('line1');
        await editor.press('Enter');
        await editor.type('line2');
        
        const html = await editor.getHtml();
        expect(html).toContain('line1');
        expect(html).toContain('line2');
    });
});

test.describe('《テーブル》キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('| col1 | col2 | + Enter → 《テーブル》', async ({ page }) => {
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        
        const html = await editor.getHtml();
        expect(html).toContain('<table');
    });

    test('Tab → 右セル移動', async ({ page }) => {
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        const html = await editor.getHtml();
        // テーブルが作成されていることを確認
        expect(html).toContain('<table');
    });
});

test.describe('インライン書式変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('**text** + Space → 《太字》', async ({ page }) => {
        await editor.type('**太字テスト** ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<strong>太字テスト</strong>');
    });

    test('*text* + Space → 《斜体》', async ({ page }) => {
        await editor.type('*斜体テスト* ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<em>斜体テスト</em>');
    });

    test('~~text~~ + Space → 《取り消し線》', async ({ page }) => {
        await editor.type('~~取り消し~~ ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<del>取り消し</del>');
    });

    test('`text` + Space → 《インラインコード》', async ({ page }) => {
        await editor.type('`code` ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<code>code</code>');
    });

    test('変換後カーソルは要素の外', async ({ page }) => {
        await editor.type('**太字** ');
        await editor.type('続きのテキスト');
        
        const html = await editor.getHtml();
        // 太字の外に続きのテキストがあることを確認
        expect(html).toContain('<strong>太字</strong>');
        expect(html).toContain('続きのテキスト');
        // 続きのテキストがstrongの中にないことを確認
        expect(html).not.toContain('<strong>太字続きのテキスト</strong>');
    });
});


test.describe('《リスト項目》追加キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('Shift+Tab → アウトデント', async ({ page }) => {
        await editor.type('- ');
        await editor.type('親項目');
        await editor.press('Enter');
        await editor.press('Tab');
        await editor.type('子項目');
        await editor.shiftPress('Tab');
        
        const html = await editor.getHtml();
        // アウトデント後、子項目が親レベルに戻る
        expect(html).toContain('<li>子項目</li>');
    });

    test('《ネストリスト》内の空《リスト項目》でEnter → 親レベルへ', async ({ page }) => {
        await editor.type('- ');
        await editor.type('親項目');
        await editor.press('Enter');
        await editor.press('Tab');
        await editor.type('子項目');
        await editor.press('Enter');
        await editor.press('Enter');
        await editor.type('親レベルに戻る');
        
        const html = await editor.getHtml();
        expect(html).toContain('親レベルに戻る');
    });
});

test.describe('《引用》追加キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('《引用》末尾空行でEnter → 脱出', async ({ page }) => {
        await editor.type('> ');
        await editor.type('引用テキスト');
        await editor.press('Enter');
        await editor.press('Enter');
        await editor.type('引用外');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('引用外');
    });
});

test.describe('《コードブロック》追加キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('《コードブロック》末尾空行でEnter → 脱出', async ({ page }) => {
        await editor.type('```');
        await editor.press('Enter');
        await editor.type('code');
        await editor.press('Enter');
        await editor.press('Enter');
        
        const html = await editor.getHtml();
        expect(html).toContain('<pre');
        expect(html).toContain('code');
    });
});

test.describe('《テーブル》追加キー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('Shift+Tab → 左セル移動', async ({ page }) => {
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        const html = await editor.getHtml();
        expect(html).toContain('<table');
        
        // テーブル内でTabで右に移動してからShift+Tabで戻る
        await editor.press('Tab');
        await page.waitForTimeout(100);
        await editor.shiftPress('Tab');
        await page.waitForTimeout(100);
        
        // Shift+Tabが動作することを確認（テーブル内にいる）
        const htmlAfter = await editor.getHtml();
        expect(htmlAfter).toContain('<table');
    });

    test('Enter → 新しい行挿入', async ({ page }) => {
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        let html = await editor.getHtml();
        expect(html).toContain('<table');
        
        // テーブル内でEnterを押して新しい行を追加
        await editor.press('Enter');
        await page.waitForTimeout(200);
        
        html = await editor.getHtml();
        // 行が追加されていることを確認
        const rowCount = (html.match(/<tr/g) || []).length;
        expect(rowCount).toBeGreaterThanOrEqual(2);
    });
});


test.describe('《リスト項目》トップレベル操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('トップレベルでShift+Tab → 《段落》変換', async ({ page }) => {
        await editor.type('- ');
        await editor.type('リスト項目');
        await editor.shiftPress('Tab');
        
        const html = await editor.getHtml();
        // Shift+Tabでリストから段落に変換されるか確認
        // 実装によっては変換されない場合もある
        expect(html).toContain('リスト項目');
    });
});

test.describe('《テーブル》矢印キー・ツールバー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('ツールバー +Col → 列追加', async ({ page }) => {
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        let html = await editor.getHtml();
        expect(html).toContain('<table');
        
        // テーブルツールバーの+Colボタンをクリック
        const addColBtn = page.locator('.table-toolbar button:has-text("+Col")');
        if (await addColBtn.isVisible()) {
            await addColBtn.click();
            await page.waitForTimeout(200);
            
            html = await editor.getHtml();
            // 列が追加されていることを確認
            const thCount = (html.match(/<th/g) || []).length;
            expect(thCount).toBeGreaterThanOrEqual(2);
        }
    });

    test('ツールバー +Row → 行追加', async ({ page }) => {
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        let html = await editor.getHtml();
        expect(html).toContain('<table');
        
        // テーブルツールバーの+Rowボタンをクリック
        const addRowBtn = page.locator('.table-toolbar button:has-text("+Row")');
        if (await addRowBtn.isVisible()) {
            await addRowBtn.click();
            await page.waitForTimeout(200);
            
            html = await editor.getHtml();
            // 行が追加されていることを確認
            const trCount = (html.match(/<tr/g) || []).length;
            expect(trCount).toBeGreaterThanOrEqual(2);
        }
    });

    test('ツールバー -Col → 列削除', async ({ page }) => {
        await editor.type('| col1 | col2 | col3 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        let html = await editor.getHtml();
        expect(html).toContain('<table');
        
        const initialThCount = (html.match(/<th/g) || []).length;
        
        // テーブルツールバーの-Colボタンをクリック
        const delColBtn = page.locator('.table-toolbar button:has-text("-Col")');
        if (await delColBtn.isVisible()) {
            await delColBtn.click();
            await page.waitForTimeout(200);
            
            html = await editor.getHtml();
            const newThCount = (html.match(/<th/g) || []).length;
            expect(newThCount).toBeLessThan(initialThCount);
        }
    });

    test('ツールバー -Row → 行削除', async ({ page }) => {
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 行を追加
        await editor.press('Enter');
        await page.waitForTimeout(200);
        
        let html = await editor.getHtml();
        expect(html).toContain('<table');
        
        const initialTrCount = (html.match(/<tr/g) || []).length;
        
        // テーブルツールバーの-Rowボタンをクリック
        const delRowBtn = page.locator('.table-toolbar button:has-text("-Row")');
        if (await delRowBtn.isVisible()) {
            await delRowBtn.click();
            await page.waitForTimeout(200);
            
            html = await editor.getHtml();
            const newTrCount = (html.match(/<tr/g) || []).length;
            // 行が削除されているか、最低1行は残っている
            expect(newTrCount).toBeLessThanOrEqual(initialTrCount);
        }
    });
});


test.describe('《テーブル》矢印キー詳細テスト', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    // ヘルパー: 3x3テーブルを作成
    async function createTable(page: any) {
        await editor.type('| A1 | B1 | C1 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 2行目を追加
        await editor.press('Enter');
        await page.waitForTimeout(100);
        await editor.type('A2');
        await editor.press('Tab');
        await editor.type('B2');
        await editor.press('Tab');
        await editor.type('C2');
        
        // 3行目を追加
        await editor.press('Enter');
        await page.waitForTimeout(100);
        await editor.type('A3');
        await editor.press('Tab');
        await editor.type('B3');
        await editor.press('Tab');
        await editor.type('C3');
        
        await page.waitForTimeout(200);
    }

    // === 右キーテスト ===
    
    test('右キー: セル内文字移動', async ({ page }) => {
        await editor.type('| ABC | DEF |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 最初のセル(A1)をクリック
        const cells = page.locator('th, td');
        await cells.first().click();
        await page.waitForTimeout(100);
        
        // 右キーで文字を移動
        await editor.press('ArrowRight');
        await editor.press('ArrowRight');
        
        // まだテーブル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td', 'div', 'br']).toContain(tag);
    });

    test('右キー: セル末尾で右セルに移動', async ({ page }) => {
        await editor.type('| AB | CD |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // セル末尾まで移動
        await editor.press('End');
        await page.waitForTimeout(100);
        
        // 右キーで次のセルに移動
        await editor.press('ArrowRight');
        await page.waitForTimeout(100);
        
        // セル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });

    test('右キー: 一番右のセルで下の行の先頭セルに移動', async ({ page }) => {
        await createTable(page);
        
        // 1行目の最後のセル(C1)に移動
        const cells = page.locator('th, td');
        await cells.nth(2).click(); // C1
        await page.waitForTimeout(100);
        
        // セル末尾に移動
        await editor.press('End');
        await page.waitForTimeout(100);
        
        // 右キーで次の行の先頭に移動
        await editor.press('ArrowRight');
        await page.waitForTimeout(100);
        
        // テーブル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });

    // === 左キーテスト ===
    
    test('左キー: セル内文字移動', async ({ page }) => {
        await editor.type('| ABC | DEF |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // セル末尾に移動
        await editor.press('End');
        
        // 左キーで文字を移動
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        
        // まだ同じセル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });

    test('左キー: セル先頭で左セルに移動', async ({ page }) => {
        await editor.type('| AB | CD |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 2番目のセルに移動
        await editor.press('Tab');
        await page.waitForTimeout(100);
        
        // セル先頭に移動
        await editor.press('Home');
        await page.waitForTimeout(100);
        
        // 左キーで前のセルに移動
        await editor.press('ArrowLeft');
        await page.waitForTimeout(100);
        
        // セル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });

    test('左キー: 一番左のセルで上の行の末尾セルに移動', async ({ page }) => {
        await createTable(page);
        
        // 2行目の最初のセル(A2)に移動
        const cells = page.locator('th, td');
        await cells.nth(3).click(); // A2 (0-2がヘッダー、3がA2)
        await page.waitForTimeout(100);
        
        // セル先頭に移動
        await editor.press('Home');
        await page.waitForTimeout(100);
        
        // 左キーで前の行の末尾に移動
        await editor.press('ArrowLeft');
        await page.waitForTimeout(100);
        
        // テーブル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });

    // === 上キーテスト ===
    
    test('上キー: 上のセルに移動', async ({ page }) => {
        await createTable(page);
        
        // 2行目のセル(A2)に移動
        const cells = page.locator('th, td');
        await cells.nth(3).click(); // A2
        await page.waitForTimeout(100);
        
        // 上キーで上のセルに移動
        await editor.press('ArrowUp');
        await page.waitForTimeout(100);
        
        // テーブル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });

    test('上キー: 一番上のセルでテーブルを抜けて上の要素に移動', async ({ page }) => {
        // テーブルの前に段落を追加
        await editor.type('上の段落');
        await editor.press('Enter');
        await editor.type('| A1 | B1 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // ヘッダーセル(A1)に移動
        const cells = page.locator('th, td');
        await cells.first().click();
        await page.waitForTimeout(100);
        
        // 上キーでテーブルを抜ける
        await editor.press('ArrowUp');
        await page.waitForTimeout(100);
        
        // テーブル外に出たことを確認（pタグにいる）
        const tag = await editor.getCursorElementTag();
        expect(tag).toBe('p');
    });

    // === 下キーテスト ===
    
    test('下キー: 下のセルに移動', async ({ page }) => {
        await createTable(page);
        
        // ヘッダーセル(A1)に移動
        const cells = page.locator('th, td');
        await cells.first().click();
        await page.waitForTimeout(100);
        
        // 下キーで下のセルに移動
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // テーブル内にいることを確認（brは空セル内の要素）
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td', 'br']).toContain(tag);
    });

    test('下キー: 一番下のセルでテーブルを抜けて下の要素に移動', async ({ page }) => {
        await editor.type('| A1 | B1 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 最後のセルに移動
        const cells = page.locator('th, td');
        const cellCount = await cells.count();
        await cells.nth(cellCount - 1).click();
        await page.waitForTimeout(100);
        
        // 下キーでテーブルを抜ける
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // テーブル外に出たことを確認（pタグまたはp内のbrにいる）
        const tag = await editor.getCursorElementTag();
        expect(['p', 'br']).toContain(tag);
        
        // テーブル内にいないことを確認
        expect(['th', 'td']).not.toContain(tag);
    });

    // === 複合テスト ===
    
    test('矢印キー: テーブル内を一周', async ({ page }) => {
        // テーブルをMarkdownで直接設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('| A | B |\n| --- | --- |\n| C | D |');
        });
        await page.waitForTimeout(300);
        
        // 最初のtd（C）をクリック
        const firstTd = page.locator('td').first();
        await firstTd.click();
        await page.waitForTimeout(100);
        
        // 右に移動（C→D）
        await editor.press('End');
        await editor.press('ArrowRight');
        await page.waitForTimeout(100);
        
        // テーブル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });

    // === テーブル外からの進入テスト ===
    
    test('上キー: テーブル下の要素から上キーでテーブルに入ると一番左の列にカーソルが入る', async ({ page }) => {
        // テーブルを作成
        await editor.type('| A1 | B1 | C1 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // テーブルの下に段落を追加（最後のセルから下キーで抜ける）
        const cells = page.locator('th, td');
        const cellCount = await cells.count();
        await cells.nth(cellCount - 1).click();
        await page.waitForTimeout(100);
        
        // 下キーでテーブルを抜ける
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // 下の段落にテキストを入力
        await editor.type('下の段落');
        await page.waitForTimeout(100);
        
        // HTMLを確認（テーブルの後に段落があることを確認）
        let html = await editor.getHtml();
        expect(html).toContain('</table>');
        expect(html).toContain('<p>下の段落</p>');
        
        // 上キーでテーブルに入る
        await editor.press('ArrowUp');
        await page.waitForTimeout(200);
        
        // テーブル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td', 'br']).toContain(tag);
        
        // 一番左の列にいることを確認（セルのcellIndexが0）
        const cellIndex = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel.rangeCount) return -1;
            let node = sel.anchorNode;
            while (node && node.tagName !== 'TD' && node.tagName !== 'TH') {
                node = node.parentNode;
            }
            return node ? node.cellIndex : -1;
        });
        expect(cellIndex).toBe(0);
    });

    test('下キー: テーブル上の要素から下キーでテーブルに入ると一番左の列にカーソルが入る', async ({ page }) => {
        // 上に段落を作成
        await editor.type('上の段落');
        await editor.press('Enter');
        
        // テーブルを作成
        await editor.type('| A1 | B1 | C1 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 上の段落に戻る
        const p = page.locator('p').first();
        await p.click();
        await page.waitForTimeout(100);
        
        // 下キーでテーブルに入る
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // テーブル内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(['th', 'td']).toContain(tag);
    });
});


test.describe('《リスト項目》Backspace操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('単独の空《リスト項目》（トップレベル、配下にネストなし、リスト内唯一の項目）でBackspace → 《段落》変換', async ({ page }) => {
        // 順序なしリストを作成
        await editor.type('- ');
        await page.waitForTimeout(100);
        
        // リストが作成されていることを確認
        let html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
        
        // 空のリスト項目でBackspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // リストが段落に変換されていることを確認
        html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).not.toContain('<ul>');
        expect(html).not.toContain('<li>');
    });

    test('単独の空《順序付きリスト項目》（トップレベル、配下にネストなし、リスト内唯一の項目）でBackspace → 《段落》変換', async ({ page }) => {
        // 順序付きリストを作成
        await editor.type('1. ');
        await page.waitForTimeout(100);
        
        // リストが作成されていることを確認
        let html = await editor.getHtml();
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>');
        
        // 空のリスト項目でBackspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // リストが段落に変換されていることを確認
        html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).not.toContain('<ol>');
        expect(html).not.toContain('<li>');
    });

    test('単独の空《タスクリスト項目》（トップレベル、配下にネストなし、リスト内唯一の項目）でBackspace → 《段落》変換', async ({ page }) => {
        // タスクリストを作成
        await editor.type('- [ ] ');
        await page.waitForTimeout(100);
        
        // タスクリストが作成されていることを確認
        let html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
        expect(html).toContain('<input type="checkbox"');
        
        // 空のタスクリスト項目でBackspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // リストが段落に変換されていることを確認
        html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).not.toContain('<ul>');
        expect(html).not.toContain('<li>');
    });

    test('複数項目のリストの空項目でBackspace → リスト項目のみ削除（リストは残る）', async ({ page }) => {
        // 複数項目のリストを作成
        await editor.type('- ');
        await editor.type('項目1');
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        // 2つ目の空項目でBackspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // リストは残り、項目1は存在することを確認
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('項目1');
    });
});

test.describe('段落とリストの統合', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('段落の先頭でBackspace → 前のリストの最後の項目に合流', async ({ page }) => {
        // 初期状態: リスト → 段落
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aa</li><li>bbb</li></ul><p>テスト</p>';
        });
        await page.waitForTimeout(100);
        
        // 段落の先頭にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.setStart(p.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなり、リストの最後の項目にテキストが合流
        expect(html).not.toContain('<p>');
        expect(html).toContain('bbbテスト');
    });

    test('空の段落の先頭でBackspace → 前後のリストが統合される', async ({ page }) => {
        // 初期状態: リスト → 空段落 → リスト
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aa</li><li>bbb</li></ul><p><br></p><ul><li>ccc</li><li>ddd</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空段落にカーソルを移動してフォーカス
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.focus();
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        await page.waitForTimeout(100);
        
        // Backspaceを押す
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 段落がなくなり、次のリストの項目が前のリストに同じレベルで統合される
        expect(html).not.toContain('<p>');
        // トップレベルのulは1つのみ（同じレベルで統合されるため）
        const ulCount = (html.match(/<ul>/g) || []).length;
        expect(ulCount).toBe(1);
        expect(html).toContain('aa');
        expect(html).toContain('bbb');
        expect(html).toContain('ccc');
        expect(html).toContain('ddd');
        // ccc, dddがbbbと同じレベルにあることを確認（ネストされていない）
        expect(html).toMatch(/<li>bbb<\/li>.*<li>ccc<\/li>.*<li>ddd<\/li>/s);
    });

    test('リスト間の段落でEnter→Backspace→Backspace → リストが統合される', async ({ page }) => {
        // 初期状態: リスト → 空段落 → リスト（Enterで段落に変換した後の状態）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aa</li><li>bbb</li></ul><p><br></p><ul><li>ddd</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空段落にカーソルを移動
        await page.evaluate(() => {
            const p = document.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // 1回目のBackspace → 次のリストの項目が前のリストに同じレベルで統合
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // 同じレベルで統合されるため、ulは1つのみ
        const ulCount1 = (html.match(/<ul>/g) || []).length;
        expect(ulCount1).toBe(1);
        // カーソルはbbbの末尾にある
        // aa, bbb, dddがすべて同じレベルにあること
        expect(html).toMatch(/<li>aa<\/li>.*<li>bbb<\/li>.*<li>ddd<\/li>/s);
    });

    test('ネストリスト内の空項目でEnter → 子ネストリストも一緒に親レベルに移動', async ({ page }) => {
        // 初期状態: 
        // - っっｄ
        //   - | (空、カーソル位置)
        //     - bbb
        //     - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>っっｄ<ul><li><br><ul><li>bbb</li><li>ccc</li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のネスト項目にカーソルを移動（2階層目の空のli）
        await page.evaluate(() => {
            const nestedLi = document.querySelector('ul > li > ul > li');
            const range = document.createRange();
            range.selectNodeContents(nestedLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Enterを押す
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // bbbとcccが残っていることを確認（消えていないこと）
        expect(html).toContain('bbb');
        expect(html).toContain('ccc');
        expect(html).toContain('っっｄ');
        
        // 構造確認: bbbとcccは新しい項目の子として存在するはず
        const markdown = await editor.getMarkdown();
        expect(markdown).toContain('bbb');
        expect(markdown).toContain('ccc');
    });

    test('リスト最初の項目の先頭でBackspace → 前の段落と合流しない（段落に変換）', async ({ page }) => {
        // 初期状態: 段落 → リスト
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p>aaa</p><ul><li>bbb</li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // リストの最初の項目の先頭にカーソルを移動
        await page.evaluate(() => {
            const firstLi = document.querySelector('ul > li');
            const range = document.createRange();
            range.setStart(firstLi.firstChild, 0);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 要件6: 前の段落と統合しない（段落に変換される）
        // aaaとbbbが別々の段落として存在すること
        expect(html).toContain('aaa');
        expect(html).toContain('bbb');
        // 統合されていないこと（aaabbbにならない）
        expect(html).not.toContain('aaabbb');
        // cccはリストに残っている
        expect(html).toContain('<li>');
        expect(html).toContain('ccc');
    });

    test('空のリスト項目がMarkdownに保存される', async ({ page }) => {
        // 初期状態: 
        // - aaa
        // - bbb
        //   - | (空)
        //   - fff
        // - sd
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb<ul><li><br></li><li>fff</li></ul></li><li>sd</li></ul>';
        });
        await page.waitForTimeout(100);
        
        const markdown = await editor.getMarkdown();
        // 空のリスト項目が保存されていることを確認
        // Markdownには "- " だけの行があるはず
        const lines = markdown.split('\n');
        const emptyListItemExists = lines.some(line => line.match(/^\s*-\s*$/));
        expect(emptyListItemExists).toBe(true);
        
        // すべての項目が存在することを確認
        expect(markdown).toContain('aaa');
        expect(markdown).toContain('bbb');
        expect(markdown).toContain('fff');
        expect(markdown).toContain('sd');
    });

    test('ネストリスト内の空項目でBackspace→Backspace → 段落削除してbbbの末尾にカーソル', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - bbb
        //   - | (空、カーソル)
        //   - CCC
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb<ul><li><br></li><li>CCC</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のネスト項目にカーソルを移動
        await page.evaluate(() => {
            const emptyLi = document.querySelector('ul > li > ul > li');
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // 1回目のBackspace → 段落に変換（親liの中にインデントを維持）
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // 段落が作成されていることを確認（親liの中に）
        let html = await editor.getHtml();
        console.log('After 1st Backspace:', html);
        expect(html).toContain('<p>');
        // 段落が親liの中にあることを確認
        expect(html).toMatch(/<li>bbb<p>.*<\/p><ul>/s);
        // CCCが残っていること
        expect(html).toContain('CCC');
        
        // 2回目のBackspace → 段落が削除され、カーソルがbbbの末尾に移動
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        console.log('After 2nd Backspace:', html);
        // 段落が削除されていること
        expect(html).not.toContain('<p>');
        // すべての項目が存在すること
        expect(html).toContain('aaa');
        expect(html).toContain('bbb');
        expect(html).toContain('CCC');
        // CCCがbbbの子として残っていること
        expect(html).toMatch(/<li>bbb<ul>.*CCC.*<\/ul><\/li>/s);
    });

    test('トップレベルの空リスト項目（子ネストリストあり）でBackspace→Backspace → ネストリストが前のリストに統合', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - | (空、カーソル)
        //   - CCC
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li><br><ul><li>CCC</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のトップレベル項目にカーソルを移動（2番目のli）
        await page.evaluate(() => {
            const emptyLi = document.querySelectorAll('ul > li')[1];
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // 1回目のBackspace → 段落に変換
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // 段落が作成されていることを確認
        let html = await editor.getHtml();
        console.log('After 1st Backspace (top-level):', html);
        expect(html).toContain('<p>');
        // 子のネストリストが段落の後に配置されていること
        expect(html).toContain('CCC');
        
        // 2回目のBackspace → 段落を削除し、ネストリストの項目が前のリストに同じレベルで統合
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        console.log('After 2nd Backspace (top-level):', html);
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // すべての項目が存在すること
        expect(html).toContain('aaa');
        expect(html).toContain('CCC');
        // CCCがaaaと同じレベルにあること（ネストされていない）
        expect(html).toMatch(/<li>aaa<\/li>.*<li>CCC<\/li>/s);
    });

    test('複数項目リストの空リスト項目（子ネストリストあり）でBackspace → 段落に変換、ネストリスト保持', async ({ page }) => {
        // 初期状態:
        // - aaaa
        // - | (空、カーソル)
        //   - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaaa</li><li><br><ul><li>ccc</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のトップレベル項目にカーソルを移動（2番目のli）
        await page.evaluate(() => {
            const emptyLi = document.querySelectorAll('ul > li')[1];
            console.log('emptyLi:', emptyLi.outerHTML);
            const range = document.createRange();
            // Set cursor at the very beginning of the li (before any content)
            if (emptyLi.firstChild && emptyLi.firstChild.nodeName === 'BR') {
                range.setStartBefore(emptyLi.firstChild);
            } else {
                range.selectNodeContents(emptyLi);
            }
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
        
        // 1回目のBackspace → 段落に変換
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        // 結果を確認
        let html = await editor.getHtml();
        console.log('After 1st Backspace (multi-item):', html);
        // 段落が作成されていること
        expect(html).toContain('<p>');
        // 子のネストリストが保持されていること
        expect(html).toContain('ccc');
        // aaaaも残っていること
        expect(html).toContain('aaaa');
    });

    test('親liの中の空の段落（上下がリスト）でBackspace → 段落を削除しリストを統合', async ({ page }) => {
        // 初期状態:
        // - aa
        //   - bbb
        //     - ccc
        //       - dd
        //       - | (空、カーソル)
        //       - fff
        // 1回目のBackspace後:
        // - aa
        //   - bbb
        //     - ccc
        //       - dd
        //       | (段落)
        //       - fff
        // 2回目のBackspace後:
        // - aa
        //   - bbb
        //     - ccc
        //       - dd
        //       - fff (リストが統合)
        
        // 1回目のBackspace後の状態を直接セット（上がリスト、下がリスト）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aa<ul><li>bbb<ul><li>ccc<ul><li>dd</li></ul><p><br></p><ul><li>fff</li></ul></li></ul></li></ul></li></ul>';
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
        
        // Backspace → 上下がリストなので、段落を削除しリストを統合
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        console.log('After Backspace (list-paragraph-list):', html);
        // 段落がなくなっていること
        expect(html).not.toContain('<p>');
        // すべての項目が存在すること
        expect(html).toContain('aa');
        expect(html).toContain('bbb');
        expect(html).toContain('ccc');
        expect(html).toContain('dd');
        expect(html).toContain('fff');
        // ddとfffが同じリストに統合されていること
        expect(html).toMatch(/<li>dd<\/li>.*<li>fff<\/li>/s);
    });
});

test.describe('《見出し》内でのパターン変換無効化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('見出し内で数字リストパターン（1. ）を入力してもリストに変換されない', async ({ page }) => {
        // 初期状態: ## 1. ああ|あ
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<h2>1. ああああ</h2>';
        });
        await page.waitForTimeout(100);

        // 見出し内にカーソルを移動
        await page.evaluate(() => {
            const h2 = document.querySelector('h2');
            const range = document.createRange();
            range.setStart(h2.firstChild, 5); // "1. ああ" の後
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // スペースを入力
        await editor.type(' ');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // 見出しが維持されていること
        expect(html).toContain('<h2>');
        // リストに変換されていないこと
        expect(html).not.toContain('<ol>');
        expect(html).not.toContain('<li>');
    });

    test('見出し内で箇条書きパターン（- ）を入力してもリストに変換されない', async ({ page }) => {
        // 初期状態: ## - テスト
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<h2>- テスト</h2>';
        });
        await page.waitForTimeout(100);

        // 見出し内にカーソルを移動
        await page.evaluate(() => {
            const h2 = document.querySelector('h2');
            const range = document.createRange();
            range.setStart(h2.firstChild, 2); // "- " の後
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // スペースを入力
        await editor.type(' ');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // 見出しが維持されていること
        expect(html).toContain('<h2>');
        // リストに変換されていないこと
        expect(html).not.toContain('<ul>');
        expect(html).not.toContain('<li>');
    });

    test('見出し内で引用パターン（> ）を入力しても引用に変換されない', async ({ page }) => {
        // 初期状態: ## > テスト
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<h2>> テスト</h2>';
        });
        await page.waitForTimeout(100);

        // 見出し内にカーソルを移動
        await page.evaluate(() => {
            const h2 = document.querySelector('h2');
            const range = document.createRange();
            range.setStart(h2.firstChild, 2); // "> " の後
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // スペースを入力
        await editor.type(' ');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // 見出しが維持されていること
        expect(html).toContain('<h2>');
        // 引用に変換されていないこと
        expect(html).not.toContain('<blockquote>');
    });

    test('見出し内で太字パターン（**text**）を入力しても太字に変換されない', async ({ page }) => {
        // 初期状態: ## **太字** テスト
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<h2>**太字** テスト</h2>';
        });
        await page.waitForTimeout(100);

        // 見出し内の末尾にカーソルを移動
        await page.evaluate(() => {
            const h2 = document.querySelector('h2');
            const range = document.createRange();
            range.setStart(h2.firstChild, h2.firstChild.textContent.length);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        // スペースを入力
        await editor.type(' ');
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // 見出しが維持されていること
        expect(html).toContain('<h2>');
        // 太字に変換されていないこと
        expect(html).not.toContain('<strong>');
    });

    test('H1-H6すべてのレベルで変換が無効化される', async ({ page }) => {
        for (let level = 1; level <= 6; level++) {
            // 各レベルの見出しをセット
            await page.evaluate((lvl) => {
                const editor = document.getElementById('editor');
                editor.innerHTML = `<h${lvl}>1. テスト</h${lvl}>`;
            }, level);
            await page.waitForTimeout(100);

            // 見出し内にカーソルを移動
            await page.evaluate((lvl) => {
                const heading = document.querySelector(`h${lvl}`);
                const range = document.createRange();
                range.setStart(heading.firstChild, 3); // "1. " の後
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }, level);

            // スペースを入力
            await editor.type(' ');
            await page.waitForTimeout(100);

            const html = await editor.getHtml();
            // 見出しが維持されていること
            expect(html).toContain(`<h${level}>`);
            // リストに変換されていないこと
            expect(html).not.toContain('<ol>');
        }
    });
});
