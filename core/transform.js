// 共享转换器。由构建工具注入 HMXX_DATA；客户端脚本不需要 require/fetch。
// 返回独立副本，永不就地修改下载保存的订阅对象。
function hmxxTransform(input, options) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("配置必须是 YAML/JSON 对象，而非节点链接列表");
  }
  const config = JSON.parse(JSON.stringify(input));
  const defaults = JSON.parse(JSON.stringify(HMXX_DATA.defaults));
  if (options && options.applyDns) {
    // 顺序独立：在同一次转换里应用 DNS，再同步规则与域名 policy。
    // 原有监听地址及未知 DNS 字段保留；不注入客户端 TUN/端口/mode。
    config["tcp-concurrent"] = defaults["tcp-concurrent"];
    config.profile = { ...(config.profile || {}), ...defaults.profile };
    config.dns = { ...(config.dns || {}), ...defaults.dns,
      "nameserver-policy": { ...((config.dns || {})["nameserver-policy"] || {}),
        ...defaults.dns["nameserver-policy"] }
    };
    // 保留订阅的 blacklist 排除项；whitelist 与 blacklist 的语义不能混用。
    const oldDns = input.dns || {};
    if ((!oldDns["fake-ip-filter-mode"] || oldDns["fake-ip-filter-mode"] === "blacklist") &&
        Array.isArray(oldDns["fake-ip-filter"])) {
      config.dns["fake-ip-filter"] = [...new Set([
        ...defaults.dns["fake-ip-filter"], ...oldDns["fake-ip-filter"]
      ])];
    }
  }
  const WEEK_SECONDS = HMXX_DATA.providers.interval;
  const BASE_URL = HMXX_DATA.providers.baseUrl;
  const sources = HMXX_DATA.providers.sources;
  const customDirectRules = HMXX_DATA.rules;
  // 同名但定义不同的订阅 provider 保留；为本脚本选择独立名称。
  config["rule-providers"] = { ...(config["rule-providers"] || {}) };
  const providerNames = {};
  for (const [baseName, file, behavior] of sources) {
    let name = baseName;
    let suffix = 2;
    const definition = candidate => ({
      type: "http", behavior, format: HMXX_DATA.providers.format,
      // 上游 .txt 实际是 payload: YAML，不是逐行 text。
      url: BASE_URL + file + ".txt",
      path: "./ruleset/" + candidate + "." +
        (HMXX_DATA.providers.format === "text" ? "txt" : HMXX_DATA.providers.format),
      interval: WEEK_SECONDS, proxy: HMXX_DATA.providers.proxy
    });
    while (config["rule-providers"][name] &&
      !(Object.keys(config["rule-providers"][name]).length === Object.keys(definition(name)).length &&
        Object.entries(definition(name)).every(([key, value]) =>
          // 客户端会重写缓存 path；来源与其他字段相同则复用，不改回路径。
          key === "path" ? typeof config["rule-providers"][name].path === "string" :
            config["rule-providers"][name][key] === value))) {
      name = baseName + "-" + suffix++;
    }
    providerNames[baseName] = name;
    if (!config["rule-providers"][name]) config["rule-providers"][name] = definition(name);
  }

  const managedRules = [...new Set([
    "RULE-SET," + providerNames["hmxx-cn-private"] + ",DIRECT",
    "RULE-SET," + providerNames["hmxx-cn-lan"] + ",DIRECT,no-resolve",
    ...customDirectRules,
    "RULE-SET," + providerNames["hmxx-cn-direct"] + ",DIRECT"
  ])];
  const cidrRule = "RULE-SET," + providerNames["hmxx-cn-cidr"] + ",DIRECT";
  let originalRules = Array.isArray(config.rules) ? config.rules.slice() : [];
  const isMatch = rule => typeof rule === "string" && rule.split(",")[0].trim() === "MATCH";

  // 只移除完整的本脚本前缀及其配套 IP 插入项；不去重订阅原文。
  // 即使经过 JSON/YAML 保存再执行，也保持幂等。
  if (managedRules.every((rule, index) => originalRules[index] === rule)) {
    originalRules = originalRules.slice(managedRules.length);
    const match = originalRules.findIndex(isMatch);
    const inserted = match < 0 ? originalRules.length - 1 : match - 1;
    if (originalRules[inserted] === cidrRule) originalRules.splice(inserted, 1);
    // 兼容旧版本把大陆 IP 紧接在前缀后的生成配置。
    else if (originalRules[0] === cidrRule) originalRules.shift();
  }
  // 大陆 IP 仅作为 MATCH 前的补充，先尊重订阅中全部具体规则。
  // 无 MATCH 时放到末尾；不创建或改写兜底策略。
  const match = originalRules.findIndex(isMatch);
  originalRules.splice(match < 0 ? originalRules.length : match, 0, cidrRule);
  config.rules = [...managedRules, ...originalRules];

  // 复用已应用的共享 DNS：Verge 由 Merge 输入，其他适配器同次转换应用。
  const dns = config.dns;
  const policy = dns && dns["nameserver-policy"];
  const domestic = policy && (policy["rule-set:hmxx-cn-direct"] ||
    policy["rule-set:" + providerNames["hmxx-cn-direct"]]);
  if (domestic) {
    const providerKey = "rule-set:" + providerNames["hmxx-cn-direct"];
    if (providerKey !== "rule-set:hmxx-cn-direct") {
      delete policy["rule-set:hmxx-cn-direct"];
      policy[providerKey] = domestic;
    }
    for (const rule of customDirectRules) {
      const [type, domain] = rule.split(",");
      // KEYWORD 无等价 DNS policy 语义，禁止转换成后缀或通配符。
      // localhost 保持系统解析，不能发给公共国内 DoH。
      if (domain === "localhost") continue;
      if (type === "DOMAIN" || type === "DOMAIN-SUFFIX") {
        policy[type === "DOMAIN" ? domain : "+." + domain] =
          Array.isArray(domestic) ? domestic.slice() : domestic;
      }
    }
  }
  return config;
}
