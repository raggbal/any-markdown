/**
 * スタンドアロンテスト用HTMLを生成するスクリプト
 * webviewContent.tsからスタイルとスクリプトを抽出してtest/html/に出力
 */

const fs = require('fs');
const path = require('path');

// webviewContent.tsを読み込み
const webviewContentPath = path.join(__dirname, '../src/webviewContent.ts');
const webviewContent = fs.readFileSync(webviewContentPath, 'utf-8');

// getStyles関数の内容を抽出
function extractStyles() {
    const styleMatch = webviewContent.match(/function getStyles\(config: EditorConfig\): string \{[\s\S]*?return `([\s\S]*?)`;[\s\S]*?\n\}/);
    if (!styleMatch) {
        console.error('Could not extract styles');
        return '';
    }
    // テンプレートリテラル内の変数を固定値に置換
    let styles = styleMatch[1];
    styles = styles.replace(/\$\{config\.fontSize\}/g, '16');
    return styles;
}

// getEditorScript関数の内容を抽出
function extractEditorScript() {
    const scriptMatch = webviewContent.match(/function getEditorScript\(content: string, config: EditorConfig\): string \{[\s\S]*?return `[\s\S]*?\(function\(\) \{([\s\S]*?)\}\)\(\);[\s\S]*?`;[\s\S]*?\n\}/);
    if (!scriptMatch) {
        console.error('Could not extract editor script');
        return '';
    }
    
    let script = scriptMatch[1];
    // テンプレートリテラル内の変数を置換
    script = script.replace(/\$\{content\}/g, '');
    script = script.replace(/\$\{escapedContent\}/g, '');
    script = script.replace(/\$\{config\.documentBaseUri \|\| ''\}/g, '');
    
    return script;
}

// メイン処理
const styles = extractStyles();
const editorScript = extractEditorScript();

// standalone-editor.htmlを更新
const htmlPath = path.join(__dirname, 'html/standalone-editor.html');
let html = fs.readFileSync(htmlPath, 'utf-8');

// スタイルを挿入
html = html.replace(/<style id="editor-styles"><\/style>/, `<style id="editor-styles">${styles}</style>`);

// スクリプトを挿入
html = html.replace(/<script id="editor-script"><\/script>/, `<script id="editor-script">
(function() {
    const editor = document.getElementById('editor');
    let markdown = '';
    ${editorScript}
})();
</script>`);

fs.writeFileSync(htmlPath, html);
console.log('Generated standalone-editor.html');