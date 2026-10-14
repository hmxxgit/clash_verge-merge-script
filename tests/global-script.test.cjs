const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const source = fs.readFileSync(path.join(__dirname, '..', 'global-script.js'), 'utf8');
function apply(config) {
  return vm.runInNewContext(source + '\nmain(config, "test");', { config }, { timeout: 1000 });
}
const plain = value => JSON.parse(JSON.stringify(value));
const cidr = 'RULE-SET,hmxx-cn-cidr,DIRECT';
const merge = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'global-merge.yaml'), 'utf8'));

test('prepends domain exceptions without deleting any subscription rule, including duplicates', () => {
  const original = ['MATCH,Airport', 'RULE-SET,hmxx-cn-direct,DIRECT',
    'DOMAIN-SUFFIX,baidu.com,DIRECT', 'DOMAIN-SUFFIX, youtube.com,Airport',
    'DOMAIN-SUFFIX , baidu.com , DIRECT'];
  const result = apply({ rules: original });
  assert.equal(result.rules[0], 'RULE-SET,hmxx-cn-private,DIRECT');
  assert.ok(result.rules.indexOf('DOMAIN-SUFFIX,baidu.com,DIRECT') < result.rules.indexOf('MATCH,Airport'));
  assert.deepEqual(plain(result.rules.slice(123).filter(r => r !== cidr)), original);
});

test('CN IP fallback follows all original specific rules and precedes the first MATCH', () => {
  for (const rules of [
    ['DOMAIN-SUFFIX,google.com,Airport', 'IP-CIDR,1.0.0.0/8,Airport', 'MATCH,Airport'],
    ['IP-CIDR,1.0.0.0/8,Airport', 'DOMAIN-SUFFIX,google.com,Airport', 'MATCH,DIRECT'],
    ['MATCH,Airport', 'DOMAIN-SUFFIX,google.com,Airport', 'MATCH,DIRECT'],
    ['DOMAIN-SUFFIX,google.com,Airport'], []
  ]) {
    const result = plain(apply({ rules }));
    const expected = rules.slice();
    const match = expected.findIndex(r => r.startsWith('MATCH,'));
    expected.splice(match < 0 ? expected.length : match, 0, cidr);
    assert.deepEqual(result.rules.slice(123), expected);
  }
});

test('is idempotent for absent rules, duplicate originals and serialized configs', () => {
  for (const fixture of [{}, { rules: [] }, { rules: ['MATCH,Proxy'] },
    { rules: [cidr, 'MATCH,DIRECT', 'DOMAIN,localhost,DIRECT'] }]) {
    const once = plain(apply(fixture));
    assert.deepEqual(plain(apply(plain(once))), once);
    const snapshot = JSON.stringify(once);
    assert.equal(JSON.stringify(apply(once)), snapshot);
    const providers = Object.values(once['rule-providers']);
    assert.equal(providers.length, 4);
    assert.ok(providers.every(p => p.interval === 604800 && p.format === 'yaml' && p.path.endsWith('.yaml')));
  }
});

test('preserves mode, TUN, ports, nodes, groups, unrelated DNS and existing providers', () => {
  const config = {
    mode: 'rule', tun: { enable: false }, 'mixed-port': 9999,
    dns: { enable: true, nameserver: ['https://example.net/dns-query'], 'nameserver-policy': { '+.custom.test': 'system' } },
    proxies: [{ name: 'AirportNode', type: 'socks5', server: '127.0.0.1', port: 1080 }],
    'proxy-groups': [{ name: 'Airport', type: 'select', proxies: ['AirportNode'] }],
    'rule-providers': { subscription: { type: 'inline', behavior: 'domain', payload: ['+.example.net'] } },
    rules: ['RULE-SET,subscription,Airport', 'MATCH,Airport']
  };
  const original = plain(config), result = plain(apply(config));
  for (const key of ['mode', 'dns', 'tun', 'mixed-port', 'proxies', 'proxy-groups']) assert.deepEqual(result[key], original[key]);
  assert.deepEqual(result['rule-providers'].subscription, original['rule-providers'].subscription);
  assert.deepEqual(result.rules.slice(123).filter(r => r !== cidr), original.rules);
});

test('preserves colliding providers, uses independent cache paths and remains idempotent', () => {
  const input = plain(merge);
  input['rule-providers'] = Object.fromEntries(['private', 'lan', 'direct', 'cidr'].map(n => [
    'hmxx-cn-' + n, { type: 'inline', behavior: 'domain', payload: ['+.subscription.test'] }
  ]));
  input.rules = ['RULE-SET,hmxx-cn-direct,DIRECT', 'MATCH,DIRECT'];
  const existing = plain(input['rule-providers']);
  const result = plain(apply(input));
  for (const [key, value] of Object.entries(existing)) assert.deepEqual(result['rule-providers'][key], value);
  assert.equal(Object.keys(result['rule-providers']).length, 8);
  assert.equal(new Set(Object.values(result['rule-providers']).filter(p => p.path).map(p => p.path)).size, 4);
  assert.ok(result.dns['nameserver-policy']['rule-set:hmxx-cn-direct-2']);
  assert.deepEqual(plain(apply(plain(result))), result);
});

test('Merge then Script synchronizes exact/suffix DNS policies, never KEYWORD semantics', () => {
  const input = plain(merge);
  input.dns['nameserver-policy']['+.custom.test'] = 'system';
  const result = plain(apply(input));
  const policy = result.dns['nameserver-policy'];
  const domestic = policy['rule-set:hmxx-cn-direct'];
  for (const domain of ['doubao.com', 'qq.com', 'bilibili.com', 'wechat.com']) assert.deepEqual(policy['+.' + domain], domestic);
  for (const name of ['doubao', '*doubao*', '+.doubao']) assert.equal(policy[name], undefined);
  assert.equal(policy.localhost, 'system');
  assert.equal(policy['+.local'], 'system');
  assert.equal(policy['+.custom.test'], 'system');
  assert.equal(policy['+.google.com'], undefined);
  assert.ok(result.dns.nameserver.every(r => r.endsWith('#RULES')));
  assert.ok(result.dns['proxy-server-nameserver'].every(r => r.endsWith('#DIRECT')));
  assert.deepEqual(plain(apply(plain(result))), result);
});

test('migrates the old generated IP prefix behind subscription domain rules', () => {
  const original = ['DOMAIN,overseas.validation.hmxxgit.org,Airport', 'MATCH,Airport'];
  const current = plain(apply({ rules: original }));
  const old = plain(current);
  old.rules = [...current.rules.slice(0, 123), cidr, ...original];
  assert.deepEqual(plain(apply(old)), current);
});
