// Optional desktop/automation adapter; mobile users can import its output.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const main = require('../adapters/portable.js');
const code = fs.readFileSync(path.join(__dirname, 'compose-browser.js'), 'utf8');
const compose = vm.runInNewContext(code+'\ncomposeYaml;', { main });
const [source, destination, target = 'generic'] = process.argv.slice(2);
try {
  if (!source || !destination || !['generic', 'cmfa'].includes(target)) throw new Error('Usage: node tools/compose.cjs source.yaml output.private.yaml [generic|cmfa]');
  if (path.resolve(source) === path.resolve(destination)) throw new Error('Output must be a separate file');
  const stat = fs.statSync(source);
  if (stat.size > 5 * 1024 * 1024) throw new Error('Input exceeds 5 MiB');
  const output = compose(fs.readFileSync(source, 'utf8'), target, yaml);
  // Exclusive creation: never overwrite the source, a symlink, or any existing file.
  fs.writeFileSync(destination, output, { flag: 'wx', mode: 0o600 });
  console.log('Created a separate derived config. Keep its credentials private.');
} catch (error) {
  console.error(error.name === 'YAMLException' ? 'YAML parse failed (source omitted to protect credentials)' : error.message);
  process.exitCode = 1;
}
