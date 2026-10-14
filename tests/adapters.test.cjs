const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const os = require('node:os');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = yaml.load(read('core/dns.yaml'));
const artifacts = ['adapters/flclash.js', 'adapters/clashmi.js', 'adapters/portable.js'];
const apply = (file, config) => plain(vm.runInNewContext(read(file)+'\nmain(config);', { config }, { timeout: 1000 }));
const fixture = {
  mode: 'rule', tun: { enable: false, 'dns-hijack': ['any:53'] }, 'mixed-port': 17899,
  'bind-address': '127.0.0.1', ipv6: true,
  dns: { listen: '127.0.0.1:17888', hosts: { test: '127.0.0.1' },
    'fake-ip-filter': ['+.my-device.lan'], 'nameserver-policy': { '+.user-defined.org': 'system' } },
  proxies: [{ name: 'Fixture-only', type: 'socks5', server: '127.0.0.1', port: 1080 }],
  'proxy-providers': { original: { type: 'inline', payload: [{ name: 'Fixture-provider', type: 'socks5', server: '127.0.0.1', port: 1081 }] } },
  'proxy-groups': [ { name: 'Main', type: 'select', proxies: ['Fixture-only'] },
    { name: 'Media', type: 'select', proxies: ['Main', 'DIRECT'] } ],
  rules: ['DOMAIN-SUFFIX,youtube.com,Media', 'DOMAIN-SUFFIX,google.com,Main',
    'IP-CIDR,8.8.8.0/24,Main', 'MATCH,Main']
};

test('all YAML sources parse; shared and legacy defaults have no client ports/TUN/mode', () => {
  for (const name of ['core/dns.yaml','global-merge.yaml']) {
    const value = yaml.load(read(name));
    assert.ok(!('listen' in value.dns));
    for (const key of ['tun','port','mixed-port','mode','proxies','proxy-groups','proxy-providers']) assert.equal(value[key], undefined);
  }
  assert.deepEqual(yaml.load(read('global-merge.yaml')), defaults);
});

test('manual rules are unchanged from the audited 120-rule baseline', () => {
  const rules = JSON.parse(read('core/direct-rules.json'));
  assert.equal(rules.length, 120);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(rules)).digest('hex'), '4e515da7c8905ac8b1d50038816875adc8fda44613b137a76342019f9c763f33');
});

test('every adapter has valid JS syntax and contains no runtime imports/network calls', () => {
  for (const file of ['global-script.js', 'core/transform.js', ...artifacts]) {
    new vm.Script(read(file));
    assert.ok(!/\brequire\(|\bimport\s|\bfetch\(|\bsetInterval\(/.test(read(file)));
  }
});

for (const file of artifacts) {
  test(file+': standalone transform preserves original config, nodes, groups, ports and proxy providers', () => {
    const input = plain(fixture), before = plain(input);
    const result = apply(file, input);
    assert.deepEqual(input, before);
    for (const key of ['proxies','proxy-groups','proxy-providers','mode','tun','mixed-port','bind-address','ipv6']) assert.deepEqual(result[key], before[key]);
    assert.equal(result.dns.listen, before.dns.listen);
    assert.equal(result.dns.ipv6, false);
    assert.ok(result.dns['fake-ip-filter'].includes('+.my-device.lan'));
    assert.equal(result.dns['nameserver-policy']['+.user-defined.org'], 'system');
    assert.equal(result.rules.indexOf('RULE-SET,hmxx-cn-cidr,DIRECT'), result.rules.indexOf('MATCH,Main')-1);
    assert.deepEqual(result.rules.filter(r => before.rules.includes(r)), before.rules);
    assert.deepEqual(result.dns['nameserver-policy']['+.doubao.com'], defaults.dns['direct-nameserver']);
    assert.equal(result.dns['nameserver-policy']['+.doubao'], undefined);
    assert.equal(result.dns['nameserver-policy']['+.youtube.com'], undefined);
    assert.equal(result.dns['proxy-server-nameserver'][0].endsWith('#DIRECT'), true);
    assert.deepEqual(apply(file, result), result);
  });
  test(file+': empty, partial, no MATCH, duplicate original rules and collision cases remain idempotent', () => {
    for (const input of [{}, { dns: {} }, { rules: ['DOMAIN,google.com,DIRECT'] },
        { rules: ['MATCH,DIRECT','MATCH,DIRECT'], 'rule-providers': {
          'hmxx-cn-direct': { type:'inline', behavior:'domain',payload:['+.custom.org'] } } }]) {
      const before = plain(input), result = apply(file, input);
      assert.deepEqual(input, before);
      assert.deepEqual(apply(file, result), result);
      assert.equal('listen' in result.dns, false);
      assert.equal('proxies' in result, false);
      if (input['rule-providers']) {
        assert.deepEqual(result['rule-providers']['hmxx-cn-direct'], input['rule-providers']['hmxx-cn-direct']);
        assert.ok(result.dns['nameserver-policy']['rule-set:hmxx-cn-direct-2']);
      }
    }
  });
}

test('portable and FlClash/Clash Mi output equal the legacy Merge then Script pipeline', () => {
  const input = { ...plain(fixture), ...plain(defaults) };
  const expected = apply('global-script.js', input);
  for (const file of artifacts) {
    // Compare shared semantics with the same DNS input, not client listen overrides.
    assert.deepEqual(apply(file, input), expected);
  }
});

const main = require('../adapters/portable.js');
const compose = vm.runInNewContext(read('tools/compose-browser.js')+'\ncomposeYaml;', { main });
test('YAML composer supports anchors/quoted scalars, preserves unknown fields and never embeds JS into output', () => {
  const text = 'base: &base\n  marker: 2026-10-14\n  secret-code: "01234"\nmetadata:\n  <<: *base\nrules: ["MATCH,DIRECT"]\n';
  const result = yaml.load(compose(text,'generic',yaml));
  assert.equal(result.metadata.marker, '2026-10-14');
  assert.equal(result.metadata['secret-code'], '01234');
  assert.equal(result.script, undefined);
  assert.ok(!('listen' in result.dns));
  assert.deepEqual(yaml.load(compose(yaml.dump(result),'generic',yaml)),result);
});

test('mobile composer rejects malformed input, URI lists, oversized input and CMFA without nodes', () => {
  for (const text of ['a: [', '- vless://example', 'vless://example']) assert.throws(() => compose(text,'generic',yaml));
  assert.throws(() => compose('x'.repeat(5*1024*1024+1),'generic',yaml));
  assert.throws(() => compose('{}','cmfa',yaml), /CMFA/);
  assert.ok(yaml.load(compose(yaml.dump(fixture),'cmfa',yaml)).proxies.length);
});

test('CLI creates a private derived file, never overwrites source/output and hides YAML error excerpts', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(),'hmxx-compose-test-'));
  try {
    const source=path.join(home,'source.yaml'),output=path.join(home,'derived.yaml');
    const text=yaml.dump(fixture);fs.writeFileSync(source,text);
    execFileSync(process.execPath,[path.join(root,'tools/compose.cjs'),source,output,'cmfa']);
    assert.equal(fs.readFileSync(source,'utf8'),text);
    const originalOutput=fs.readFileSync(output,'utf8');
    if (process.platform !== "win32") assert.equal(fs.statSync(output).mode & 0o777,0o600);
    for (const destination of [source,output]) {
      const result=spawnSync(process.execPath,[path.join(root,'tools/compose.cjs'),source,destination]);
      assert.notEqual(result.status,0);
    }
    assert.equal(fs.readFileSync(output,'utf8'),originalOutput);
    fs.writeFileSync(source,'secret-marker: [FIXTURE-DO-NOT-PRINT');
    const failure=spawnSync(process.execPath,[path.join(root,'tools/compose.cjs'),source,path.join(home,'bad.yaml')],{encoding:'utf8'});
    assert.notEqual(failure.status,0);
    assert.ok(!failure.stderr.includes('FIXTURE-DO-NOT-PRINT'));
  } finally {fs.rmSync(home,{recursive:true,force:true});}
});

test('offline HTML is self-contained, has network-blocking CSP, no analytics or subscription fetch', () => {
  const html=read('tools/portable.html');
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(html));
  assert.ok(!/localStorage|sessionStorage|sendBeacon/.test(read('tools/compose-browser.js')));
  const scripts=Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g),m=>m[1]);
  assert.equal(scripts.length,3);
  const context=vm.createContext({});
  for (const script of scripts) vm.runInContext(script,context);
  const output=vm.runInContext('composeYaml("rules: [MATCH,DIRECT]", "generic", jsyaml)',context);
  assert.ok(yaml.load(output).dns);
});

test('client-rewritten cache paths are reused without rule duplication or provider modification', () => {
  for (const file of artifacts) {
    const generated = apply(file, fixture);
    for (const [name, provider] of Object.entries(generated['rule-providers'])) {
      provider.path = './app-managed-cache/' + name + '.yaml';
    }
    const before = plain(generated);
    const result = apply(file, generated);
    assert.deepEqual(generated, before);
    assert.deepEqual(result, before);
  }
});
