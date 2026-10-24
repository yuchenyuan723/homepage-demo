const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
for (const file of ['app.js','editor.js','export.js','content.js']) {
  new vm.Script(fs.readFileSync(file,'utf8'), { filename:file });
  console.log('Syntax OK:',file);
}
const result = cp.spawnSync(process.execPath,['--test','export.test.cjs'],{stdio:'inherit'});
if (result.status !== 0) process.exit(result.status || 1);
require('./build-export.cjs').build(process.cwd());
console.log('Export build function completed');
for (const name of ['playwright','@playwright/test','puppeteer']) {
  try {console.log('Browser package:',require.resolve(name,{paths:[process.cwd(),'C:/Users/17123/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/node_modules']}));}catch{}
}
