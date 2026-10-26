const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "global-script.js"), "utf8");
const script = new vm.Script(source + "\nmain(config);");
const plain = value => JSON.parse(JSON.stringify(value));

function apply(config) {
  return plain(script.runInNewContext({ config }, { timeout: 1000 }));
}

test("脚本语法有效、入口可调用且没有运行时依赖", () => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*(?:\(|[\s{*])/);
  const result = apply({});
  assert.equal(typeof result, "object");
  assert.throws(() => apply(null), /配置必须是对象/);
});

test("保留节点、provider、代理组、测速设置及其他顶层字段", () => {
  const config = {
    mode: "rule",
    tun: { enable: false },
    "mixed-port": 7890,
    proxies: [
      { name: "域名节点", type: "ss", server: "node.example.com", port: 443 },
      { name: "IP 节点", type: "ss", server: "203.0.113.8", port: 443 },
      { name: "IPv6 字面量节点", type: "ss", server: "2001:db8::1", port: 443 }
    ],
    "proxy-providers": { airport: { type: "http", url: "https://example.com/sub" } },
    "proxy-groups": [
      { name: "自动选择", type: "url-test", url: "https://www.gstatic.com/generate_204", interval: 300, timeout: 5000, proxies: ["域名节点"] },
      { name: "故障转移", type: "fallback", url: "https://cp.cloudflare.com/generate_204", proxies: ["IP 节点", "IPv6 字面量节点"] }
    ],
    rules: ["MATCH,自动选择"]
  };
  const before = plain(config);
  const result = apply(config);
  for (const key of ["mode", "tun", "mixed-port", "proxies", "proxy-providers", "proxy-groups"]) {
    assert.deepEqual(result[key], before[key]);
  }
});

test("插入局域网和代表性国内直连规则，不误匹配国外域名", () => {
  const result = apply({ rules: ["DOMAIN-SUFFIX,youtube.com,机场", "MATCH,机场"] });
  for (const domain of ["qq.com", "taobao.com", "douyin.com", "jd.com", "bilibili.com", "baidu.com", "zhihu.com", "12306.cn", "gov.cn"]) {
    assert.ok(result.rules.includes(`DOMAIN-SUFFIX,${domain},DIRECT`));
  }
  assert.ok(result.rules.includes("IP-CIDR,192.168.0.0/16,DIRECT,no-resolve"));
  assert.ok(!result.rules.some(rule => rule.startsWith("DOMAIN-KEYWORD")));
  assert.ok(!result.rules.includes("DOMAIN-SUFFIX,youtube.com,DIRECT"));
  assert.deepEqual(result.rules.slice(-2), ["DOMAIN-SUFFIX,youtube.com,机场", "MATCH,机场"]);
});

test("尊重订阅对同一匹配项的精确选择，并保留 MATCH 语义", () => {
  const original = [
    "DOMAIN-SUFFIX, qq.com ,机场",
    "DOMAIN,internal.example,DIRECT",
    "MATCH,机场",
    "MATCH,DIRECT"
  ];
  const result = apply({ rules: original });
  assert.equal(result.rules.filter(rule => /DOMAIN-SUFFIX,\s*qq\.com/i.test(rule)).length, 1);
  assert.deepEqual(result.rules.slice(-original.length), original);
  assert.equal(result.rules.filter(rule => rule.startsWith("MATCH,")).length, 2);
});

test("缺失或错误类型的 rules 可恢复，重复执行保持幂等", () => {
  for (const fixture of [{}, { rules: null }, { rules: "MATCH,机场" }, { rules: [] }, { rules: ["MATCH,机场"] }]) {
    const once = apply(fixture);
    const twice = apply(plain(once));
    assert.deepEqual(twice, once);
    assert.equal(new Set(once.rules).size, once.rules.length);
  }
});

test("强制顶层和 DNS 使用 IPv4-only，重复执行不会重新开启 IPv6", () => {
  for (const fixture of [
    {},
    { ipv6: true, dns: { ipv6: true } },
    { ipv6: false, dns: { ipv6: false } }
  ]) {
    const once = apply(fixture);
    assert.equal(once.ipv6, false);
    assert.equal(once.dns.ipv6, false);
    const twice = apply(plain(once));
    assert.equal(twice.ipv6, false);
    assert.equal(twice.dns.ipv6, false);
    assert.deepEqual(twice, once);
  }
});

test("保留 IPv6 字面量节点和订阅已有的 IPv6 规则", () => {
  const node = { name: "IPv6-only", type: "ss", server: "2001:db8::8", port: 443 };
  const rules = ["IP-CIDR6,2001:db8::/32,DIRECT,no-resolve", "MATCH,机场"];
  const result = apply({ ipv6: true, dns: { ipv6: true }, proxies: [node], rules });
  assert.deepEqual(result.proxies, [node]);
  assert.deepEqual(result.rules.slice(-rules.length), rules);
  assert.equal(result.ipv6, false);
  assert.equal(result.dns.ipv6, false);
});

test("DNS 国内外分流、节点解析与 Fake-IP 配置正确", () => {
  const result = apply({ rules: ["MATCH,机场"] });
  const dns = result.dns;
  assert.equal(dns.enable, true);
  assert.equal(dns.ipv6, false);
  assert.equal(dns["enhanced-mode"], "fake-ip");
  assert.equal(dns["fake-ip-range"], "198.18.0.1/16");
  assert.equal(dns["respect-rules"], true);
  assert.equal(dns["prefer-h3"], false);
  assert.ok(dns.nameserver.every(server => server.endsWith("#RULES")));
  assert.ok(dns["proxy-server-nameserver"].every(server => server.endsWith("#DIRECT")));
  assert.deepEqual(dns.fallback, []);
  assert.ok(dns["nameserver-policy"]["+.qq.com"].every(server => server.endsWith("#DIRECT")));
  assert.equal(dns["nameserver-policy"]["+.lan"], "system");
  assert.ok(dns["fake-ip-filter"].includes("*.home.arpa"));
  assert.equal(dns["direct-nameserver"], undefined);
});

test("保留 DNS 监听地址、未知字段、自定义 policy 和 blacklist 过滤项", () => {
  const result = apply({
    dns: {
      listen: "127.0.0.1:1053",
      "custom-option": { enabled: true },
      "fake-ip-filter": ["printer.example"],
      "nameserver-policy": { "+.corp.example": "system" },
      "proxy-server-nameserver-policy": { "+.node.example": "223.5.5.5" },
      "direct-nameserver": ["114.114.114.114"],
      "direct-nameserver-follow-policy": true
    }
  });
  assert.equal(result.dns.listen, "127.0.0.1:1053");
  assert.deepEqual(result.dns["custom-option"], { enabled: true });
  assert.ok(result.dns["fake-ip-filter"].includes("printer.example"));
  assert.equal(result.dns["nameserver-policy"]["+.corp.example"], "system");
  assert.deepEqual(result.dns["proxy-server-nameserver-policy"], { "+.node.example": "223.5.5.5" });
  assert.equal(result.dns["direct-nameserver"], undefined);
  assert.equal(result.dns["direct-nameserver-follow-policy"], undefined);
});

test("不把 whitelist 的旧过滤项错误合并到 blacklist", () => {
  const result = apply({ dns: { "fake-ip-filter-mode": "whitelist", "fake-ip-filter": ["foreign.example"] } });
  assert.equal(result.dns["fake-ip-filter-mode"], "blacklist");
  assert.ok(!result.dns["fake-ip-filter"].includes("foreign.example"));
});
