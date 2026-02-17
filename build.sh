#!/bin/bash
cd /Users/imaken/pg_prod/vscode-md
echo "Compiling TypeScript..."
npm run compile
echo "Building VSIX..."
npx @vscode/vsce package
echo "Done! VSIX files:"
ls -la *.vsix
