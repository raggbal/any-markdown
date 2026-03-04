/**
 * CDN依存をローカルバンドルにコピーするスクリプト
 * node_modules/ → vendor/ にコピー
 *
 * 使用方法: node scripts/copy-vendor.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const NODE_MODULES = path.join(ROOT, 'node_modules');

// vendor/ ディレクトリ作成
fs.mkdirSync(VENDOR, { recursive: true });
fs.mkdirSync(path.join(VENDOR, 'fonts'), { recursive: true });

// コピーするファイル一覧
const files = [
    { src: 'turndown/dist/turndown.js', dest: 'turndown.js' },
    { src: 'turndown-plugin-gfm/dist/turndown-plugin-gfm.js', dest: 'turndown-plugin-gfm.js' },
    { src: 'mermaid/dist/mermaid.min.js', dest: 'mermaid.min.js' },
    { src: 'katex/dist/katex.min.js', dest: 'katex.min.js' },
    { src: 'katex/dist/katex.min.css', dest: 'katex.min.css' },
];

for (const { src, dest } of files) {
    const srcPath = path.join(NODE_MODULES, src);
    const destPath = path.join(VENDOR, dest);
    fs.copyFileSync(srcPath, destPath);
    const size = (fs.statSync(destPath).size / 1024).toFixed(1);
    console.log(`  ✓ ${dest} (${size} KB)`);
}

// KaTeX WOFF2 フォントのみコピー (woff/ttf は不要 — 全モダンブラウザが woff2 対応)
const katexFontsDir = path.join(NODE_MODULES, 'katex/dist/fonts');
const fontFiles = fs.readdirSync(katexFontsDir).filter(f => f.endsWith('.woff2'));
let totalFontSize = 0;
for (const font of fontFiles) {
    const srcPath = path.join(katexFontsDir, font);
    const destPath = path.join(VENDOR, 'fonts', font);
    fs.copyFileSync(srcPath, destPath);
    totalFontSize += fs.statSync(destPath).size;
}
console.log(`  ✓ fonts/ (${fontFiles.length} woff2 files, ${(totalFontSize / 1024).toFixed(1)} KB)`);

// KaTeX CSS から woff/ttf 参照を除去 (woff2 のみ残す)
const katexCssPath = path.join(VENDOR, 'katex.min.css');
let css = fs.readFileSync(katexCssPath, 'utf8');
// ",url(fonts/xxx.woff) format("woff"),url(fonts/xxx.ttf) format("truetype")" を除去
css = css.replace(/,url\(fonts\/[^)]+\.woff\)\s*format\("woff"\)/g, '');
css = css.replace(/,url\(fonts\/[^)]+\.ttf\)\s*format\("truetype"\)/g, '');
fs.writeFileSync(katexCssPath, css);
console.log('  ✓ katex.min.css (stripped woff/ttf references)');

// LICENSE ファイルをコピー (MIT)
const licenses = [
    { pkg: 'turndown', dest: 'LICENSE-turndown' },
    { pkg: 'turndown-plugin-gfm', dest: 'LICENSE-turndown-plugin-gfm' },
    { pkg: 'mermaid', dest: 'LICENSE-mermaid' },
    { pkg: 'katex', dest: 'LICENSE-katex' },
];
for (const { pkg, dest } of licenses) {
    const srcPath = path.join(NODE_MODULES, pkg, 'LICENSE');
    const destPath = path.join(VENDOR, dest);
    fs.copyFileSync(srcPath, destPath);
}
console.log(`  ✓ LICENSE files (${licenses.length} packages)`);

console.log('\nVendor copy complete.');
