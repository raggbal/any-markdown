// Build locale files separately
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src/i18n/locales');
const outDir = path.join(__dirname, 'out/locales');

// Create output directory
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Get all locale files
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.ts'));

console.log(`Building ${files.length} locale files...`);

for (const file of files) {
  const srcPath = path.join(localesDir, file);
  const baseName = file.replace('.ts', '');
  
  // Compile each locale file individually
  try {
    execSync(`npx tsc "${srcPath}" --outDir "${outDir}" --module commonjs --target ES2022 --esModuleInterop --skipLibCheck`, {
      cwd: __dirname,
      stdio: 'pipe'
    });
    console.log(`  ✓ ${file} -> out/locales/${baseName}.js`);
  } catch (err) {
    console.error(`  ✗ ${file}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`\nLocale build complete: ${files.length} files`);
