const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "global-script.js"), "utf8");
const script = new vm.Script(source + "\nmain(config);");
const plain = value => JSON.parse(JSON.stringify(value));
const managedCount = 13;

function apply(config) {
  return plain(script.runInNewContext({ config }, { timeout: 1000 }));
}

test("脚本语法有效、入口可调用且没有运行时依赖", () => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*(?:\(|[\s{*])/);
  assert.equal(typeof apply({}), "object");
  assert.throws(() => apply(null), /配置必须是对象/);
});

test("无原始规则时只生成国内直连规则，不创建 MATCH", () => {
  for (const fixture of [{}, { rules: null }, { rules: "MATCH,机场" }, { rules: [] }]) {
    const result = apply(fixture);
    assert.equal(result.rules.length, managedCount);
    assert.ok(!result.rules.some(rule => rule.startsWith("MATCH,")));
  }
});

test("国内规则顺序固定在全部机场规则之前", () => {
  const original = [
    "DOMAIN-SUFFIX,baidu.com,任意机场组",
    "RULE-SET,subscription,另一个组",
    "MATCH,最终选择"
  ];
  const result = apply({ rules: original });
  assert.deepEqual(result.rules.slice(0, 10), [
    "DOMAIN,localhost,DIRECT",
    "DOMAIN-SUFFIX,lan,DIRECT",
    "DOMAIN-SUFFIX,local,DIRECT",
    "DOMAIN-SUFFIX,home.arpa,DIRECT",
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,100.64.0.0/10,DIRECT,no-resolve",
    "IP-CIDR,169.254.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve"
  ]);
  assert.deepEqual(result.rules.slice(10, 13), [
    "GEOSITE,private,DIRECT",
    "GEOSITE,cn,DIRECT",
    "GEOIP,CN,DIRECT,no-resolve"
  ]);
  assert.deepEqual(result.rules.slice(managedCount), original);
});

test("机场将国内网站或 GeoSite CN 指向代理时仍由前置 DIRECT 优先", () => {
  const conflicting = [
    "DOMAIN-SUFFIX,baidu.com,机场A",
    "GEOSITE,cn,机场B",
    "GEOIP,CN,机场C,no-resolve",
    "MATCH,机场D"
  ];
  const result = apply({ rules: conflicting });
  assert.ok(result.rules.indexOf("GEOSITE,cn,DIRECT") < result.rules.indexOf("GEOSITE,cn,机场B"));
  assert.ok(result.rules.indexOf("GEOIP,CN,DIRECT,no-resolve") < result.rules.indexOf("GEOIP,CN,机场C,no-resolve"));
  assert.deepEqual(result.rules.slice(-conflicting.length), conflicting);
});

test("保留有无 MATCH 的机场规则及原始相对顺序", () => {
  for (const original of [
    ["DOMAIN,example.com,自定义组", "MATCH,自定义组"],
    ["DOMAIN,example.com,自定义组", "IP-CIDR,203.0.113.0/24,DIRECT"]
  ]) {
    const result = apply({ rules: original });
    assert.deepEqual(result.rules.slice(managedCount), original);
    assert.equal(result.rules.some(rule => rule.startsWith("MATCH,")), original.some(rule => rule.startsWith("MATCH,")));
  }
});

test("已有脚本托管 Geo 规则不会重复，重复执行保持幂等", () => {
  const fixture = {
    rules: [
      " geosite , CN , direct ",
      "GEOIP,CN,DIRECT",
      "GEOSITE,private,DIRECT",
      "MATCH,机场"
    ]
  };
  const once = apply(fixture);
  const twice = apply(plain(once));
  assert.deepEqual(twice, once);
  assert.equal(once.rules.filter(rule => rule === "GEOSITE,cn,DIRECT").length, 1);
  assert.equal(once.rules.filter(rule => rule.startsWith("GEOIP,CN,DIRECT")).length, 1);
  assert.equal(once.rules.filter(rule => rule === "GEOSITE,private,DIRECT").length, 1);
  assert.deepEqual(once.rules.slice(-1), ["MATCH,机场"]);
});

test("强制顶层和 DNS 使用 IPv4-only", () => {
  for (const fixture of [{}, { ipv6: true, dns: { ipv6: true } }, { ipv6: false, dns: { ipv6: false } }]) {
    const once = apply(fixture);
    assert.equal(once.ipv6, false);
    assert.equal(once.dns.ipv6, false);
    assert.deepEqual(apply(plain(once)), once);
  }
});

test("DNS 缺失时建立 GeoSite CN 分流并避免节点解析循环", () => {
  const dns = apply({}).dns;
  assert.equal(dns.enable, true);
  assert.equal(dns.ipv6, false);
  assert.equal(dns["enhanced-mode"], "fake-ip");
  assert.equal(dns["respect-rules"], true);
  assert.equal(dns["prefer-h3"], false);
  assert.ok(dns.nameserver.every(server => server.endsWith("#RULES")));
  assert.ok(dns["proxy-server-nameserver"].every(server => server.endsWith("#DIRECT")));
  assert.ok(dns["nameserver-policy"]["geosite:cn"].every(server => server.endsWith("#DIRECT")));
  assert.equal(dns["nameserver-policy"]["geosite:private"], "system");
  assert.deepEqual(dns.fallback, []);
  assert.equal(dns["direct-nameserver"], undefined);
});

test("保留 DNS 监听、未知字段、自定义 policy 和 blacklist 过滤项", () => {
  const result = apply({ dns: {
    listen: "127.0.0.1:1053",
    "custom-option": { enabled: true },
    "fake-ip-filter": ["printer.example"],
    "nameserver-policy": { "+.corp.example": "system", "geosite:cn": "system" },
    "proxy-server-nameserver-policy": { "+.node.example": "223.5.5.5" },
    "direct-nameserver": ["114.114.114.114"]
  } });
  assert.equal(result.dns.listen, "127.0.0.1:1053");
  assert.deepEqual(result.dns["custom-option"], { enabled: true });
  assert.ok(result.dns["fake-ip-filter"].includes("printer.example"));
  assert.equal(result.dns["nameserver-policy"]["+.corp.example"], "system");
  assert.ok(Array.isArray(result.dns["nameserver-policy"]["geosite:cn"]));
  assert.deepEqual(result.dns["proxy-server-nameserver-policy"], { "+.node.example": "223.5.5.5" });
  assert.equal(result.dns["direct-nameserver"], undefined);
});

test("保留节点、provider、代理组、测速参数和 IPv6 字面量节点", () => {
  const config = {
    mode: "rule", tun: { enable: false }, "mixed-port": 7890,
    proxies: [
      { name: "域名节点", type: "ss", server: "node.example.com", port: 443 },
      { name: "IPv6 字面量节点", type: "ss", server: "2001:db8::1", port: 443 }
    ],
    "proxy-providers": { airport: { type: "http", url: "https://example.com/sub" } },
    "proxy-groups": [
      { name: "任意名称", type: "url-test", url: "https://www.gstatic.com/generate_204", interval: 300, timeout: 5000, tolerance: 50, proxies: ["域名节点"] },
      { name: "备用", type: "fallback", url: "https://cp.cloudflare.com/generate_204", proxies: ["IPv6 字面量节点"] }
    ],
    rules: ["IP-CIDR6,2001:db8::/32,DIRECT,no-resolve", "MATCH,任意名称"]
  };
  const before = plain(config);
  const result = apply(config);
  for (const key of ["mode", "tun", "mixed-port", "proxies", "proxy-providers", "proxy-groups"]) {
    assert.deepEqual(result[key], before[key]);
  }
  assert.deepEqual(result.rules.slice(-before.rules.length), before.rules);
});

test("whitelist 旧过滤项不会错误合并进 blacklist", () => {
  const result = apply({ dns: { "fake-ip-filter-mode": "whitelist", "fake-ip-filter": ["foreign.example"] } });
  assert.equal(result.dns["fake-ip-filter-mode"], "blacklist");
  assert.ok(!result.dns["fake-ip-filter"].includes("foreign.example"));
});
