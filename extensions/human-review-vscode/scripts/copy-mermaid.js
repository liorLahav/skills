const fs = require('fs'), path = require('path');
const src = require.resolve('mermaid/dist/mermaid.min.js');
fs.mkdirSync(path.join(__dirname, '..', 'media'), { recursive: true });
fs.copyFileSync(src, path.join(__dirname, '..', 'media', 'mermaid.min.js'));
console.log('copied', src);
