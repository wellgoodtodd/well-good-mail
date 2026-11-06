// Usage: node scripts/bump-version.cjs 0.2.0
// Updates the version in package.json, tauri.conf.json and Cargo.toml.
const fs = require('fs');
const path = require('path');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) {
  console.error('Give a version like 0.2.0');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const pkg = path.join(root, 'package.json');
const conf = path.join(root, 'src-tauri', 'tauri.conf.json');
const cargo = path.join(root, 'src-tauri', 'Cargo.toml');
for (const f of [pkg, conf]) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.version = v;
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}
fs.writeFileSync(cargo, fs.readFileSync(cargo, 'utf8').replace(/^version = ".*"$/m, `version = "${v}"`));
console.log(`Version set to ${v}. Commit, then run the "Build Windows app" workflow.`);
