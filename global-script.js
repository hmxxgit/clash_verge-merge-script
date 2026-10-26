// Clash Verge Rev 全局扩展脚本：仅调整 IPv6、DNS 和规则。

const LAN_RULES = [
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
];

// 只保留常用服务的代表性域名，不维护大而重复的 CDN 清单。
const CN_DOMAINS = [
  "qq.com", "wechat.com", "tencent.com", "qcloud.com",
  "taobao.com", "tmall.com", "alipay.com", "alipayobjects.com",
  "aliyun.com", "alibabacloud.com", "1688.com",
  "douyin.com", "doubao.com", "toutiao.com", "byteimg.com",
  "jd.com", "pinduoduo.com",
  "bilibili.com", "hdslb.com", "iqiyi.com",
  "baidu.com", "bdimg.com",
  "weibo.com", "weibo.cn", "xiaohongshu.com", "xhscdn.com",
  "zhihu.com", "zhimg.com",
  "meituan.com", "dianping.com", "amap.com", "autonavi.com",
  "mi.com", "xiaomi.com", "huawei.com",
  "unionpay.com", "95516.com", "icbc.com.cn", "ccb.com",
  "abchina.com", "boc.cn", "bankcomm.com", "cmbchina.com",
  "12306.cn", "gov.cn", "edu.cn"
];

const CN_RULES = CN_DOMAINS.map(function (domain) {
  return "DOMAIN-SUFFIX," + domain + ",DIRECT";
});

const DOMESTIC_DNS = [
  "https://223.5.5.5/dns-query#DIRECT",
  "https://1.12.12.12/dns-query#DIRECT"
];

const FOREIGN_DNS = [
  "https://1.1.1.1/dns-query#RULES",
  "https://8.8.8.8/dns-query#RULES"
];

const FAKE_IP_FILTER = [
  "localhost",
  "*.localhost",
  "*.lan",
  "*.local",
  "*.home.arpa",
  "captive.apple.com",
  "time.apple.com",
  "time.windows.com",
  "*.msftconnecttest.com",
  "*.msftncsi.com"
];

function ruleKey(rule) {
  if (typeof rule !== "string") return "";
  const parts = rule.split(",");
  if (parts.length < 2) return "";
  const type = parts[0].trim().toUpperCase();
  if (!["DOMAIN", "DOMAIN-SUFFIX", "IP-CIDR", "IP-CIDR6"].includes(type)) return "";
  return type + "," + parts[1].trim().toLowerCase();
}

function mergeRules(rules) {
  const managed = LAN_RULES.concat(CN_RULES);
  const managedSet = new Set(managed);
  const original = Array.isArray(rules)
    ? rules.filter(function (rule) { return !managedSet.has(rule); })
    : [];

  // 如果订阅对同一域名或网段已有明确规则，尊重订阅的选择。
  const originalKeys = new Set(original.map(ruleKey).filter(Boolean));
  const prepend = managed.filter(function (rule) {
    return !originalKeys.has(ruleKey(rule));
  });
  return prepend.concat(original);
}

function mergeDns(oldDns) {
  const dns = oldDns && typeof oldDns === "object" && !Array.isArray(oldDns)
    ? oldDns
    : {};
  const oldMode = dns["fake-ip-filter-mode"];
  const oldFilter = Array.isArray(dns["fake-ip-filter"]) &&
    (!oldMode || oldMode === "blacklist") ? dns["fake-ip-filter"] : [];
  const oldPolicy = dns["nameserver-policy"] &&
    typeof dns["nameserver-policy"] === "object" &&
    !Array.isArray(dns["nameserver-policy"])
    ? dns["nameserver-policy"] : {};

  dns.enable = true;
  dns.ipv6 = false;
  dns["enhanced-mode"] = "fake-ip";
  dns["fake-ip-range"] = "198.18.0.1/16";
  dns["fake-ip-filter-mode"] = "blacklist";
  dns["fake-ip-filter"] = Array.from(new Set(FAKE_IP_FILTER.concat(oldFilter)));
  dns["default-nameserver"] = ["223.5.5.5", "119.29.29.29"];
  dns.nameserver = FOREIGN_DNS.slice();
  dns["proxy-server-nameserver"] = DOMESTIC_DNS.slice();
  dns["respect-rules"] = true;
  dns["prefer-h3"] = false;
  dns.fallback = [];

  const policy = Object.assign({}, oldPolicy, {
    "localhost": "system",
    "+.lan": "system",
    "+.local": "system",
    "+.home.arpa": "system"
  });
  CN_DOMAINS.forEach(function (domain) {
    policy["+." + domain] = DOMESTIC_DNS.slice();
  });
  dns["nameserver-policy"] = policy;

  // 国内域名已由 policy 选择上游；去掉二次解析可避免 DIRECT 外域被国内 DNS 查询。
  delete dns["direct-nameserver"];
  delete dns["direct-nameserver-follow-policy"];
  return dns;
}

function main(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("配置必须是对象");
  }
  config.ipv6 = false;
  config.dns = mergeDns(config.dns);
  config.rules = mergeRules(config.rules);
  return config;
}
