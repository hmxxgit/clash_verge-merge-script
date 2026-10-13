const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'global-script.js'), 'utf8');
function apply(config) {
  const sandbox = { config };
  return vm.runInNewContext(source + '\nmain(config, "test");', sandbox, { timeout: 1000 });
}

test('moves existing direct rules ahead of an early MATCH without duplicating them', () => {
  const result = apply({ rules: [
    'MATCH,Airport',
    'RULE-SET,hmxx-cn-direct,DIRECT',
    'DOMAIN-SUFFIX,baidu.com,DIRECT',
    'DOMAIN-SUFFIX, youtube.com,Airport',
    'DOMAIN-SUFFIX , baidu.com , DIRECT'
  ] });
  assert.equal(result.rules[0], 'RULE-SET,hmxx-cn-private,DIRECT');
  const match = result.rules.indexOf('MATCH,Airport');
  assert.ok(result.rules.indexOf('RULE-SET,hmxx-cn-direct,DIRECT') < match);
  assert.ok(result.rules.indexOf('DOMAIN-SUFFIX,baidu.com,DIRECT') < match);
  assert.equal(result.rules.filter(r => r === 'RULE-SET,hmxx-cn-direct,DIRECT').length, 1);
  assert.equal(result.rules.filter(r => r.includes('baidu.com')).length, 1);
  assert.deepEqual(Array.from(result.rules.slice(match)), ['MATCH,Airport', 'DOMAIN-SUFFIX, youtube.com,Airport']);
});

test('works for newly imported configs and is idempotent on repeated activation', () => {
  for (const fixture of [{}, { rules: [] }, { rules: ['MATCH,Proxy'] }]) {
    const once = apply(fixture);
    const snapshot = JSON.stringify(once);
    const twice = apply(once);
    assert.equal(JSON.stringify(twice), snapshot);
    const providers = Object.values(twice['rule-providers']);
    assert.equal(providers.length, 4);
    assert.ok(providers.every(p => p.interval === 604800));
    assert.ok(providers.every(p => p.format === 'yaml'));
  }
});

test('preserves DNS, mode, nodes, groups, and unrelated subscription rule providers', () => {
  const config = {
    mode: 'rule',
    dns: { enable: true, nameserver: ['https://example.net/dns-query'] },
    proxies: [{ name: 'AirportNode', type: 'socks5', server: '127.0.0.1', port: 1080 }],
    'proxy-groups': [{ name: 'Airport', type: 'select', proxies: ['AirportNode'] }],
    'rule-providers': { subscription: { type: 'inline', behavior: 'domain', payload: ['+.example.net'] } },
    rules: ['RULE-SET,subscription,Airport', 'MATCH,Airport']
  };
  const original = JSON.parse(JSON.stringify(config));
  const result = apply(config);
  for (const key of ['mode', 'dns', 'proxies', 'proxy-groups']) assert.deepEqual(result[key], original[key]);
  assert.deepEqual(result['rule-providers'].subscription, original['rule-providers'].subscription);
  assert.deepEqual(Array.from(result.rules.slice(-2)), original.rules);
  assert.ok(!result.rules.some(rule => /YouTube-DMIT|Dmit-Hysteria2-YouTube/.test(rule)));
});
