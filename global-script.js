// Paste the entire file into Clash Verge Rev's GLOBAL extension script.
// Online rule sets are refreshed by Mihomo every 604800 seconds (7 days).
// Only synchronize manual domain DNS policies when paired with the Merge file.
// Never create nodes or change TUN, ports, or the proxy mode.
function main(config, profileName) {
  const WEEK_SECONDS = 604800;
  // Official alternate: https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/
  const BASE_URL = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/";
  const sources = [
    ["hmxx-cn-private", "private", "domain"],
    ["hmxx-cn-lan", "lancidr", "ipcidr"],
    ["hmxx-cn-direct", "direct", "domain"],
    ["hmxx-cn-cidr", "cncidr", "ipcidr"]
  ];

  // 同名但定义不同的订阅 provider 保留；为本脚本选择独立名称。
  config["rule-providers"] = { ...(config["rule-providers"] || {}) };
  const providerNames = {};
  for (const [baseName, file, behavior] of sources) {
    let name = baseName;
    let suffix = 2;
    const definition = candidate => ({
      type: "http", behavior, format: "yaml",
      // 上游 .txt 实际是 payload: YAML，不是逐行 text。
      url: BASE_URL + file + ".txt",
      path: "./ruleset/" + candidate + ".yaml",
      interval: WEEK_SECONDS, proxy: "GLOBAL"
    });
    while (config["rule-providers"][name] &&
      !(Object.keys(config["rule-providers"][name]).length === Object.keys(definition(name)).length &&
        Object.entries(definition(name)).every(([key, value]) =>
          config["rule-providers"][name][key] === value))) {
      name = baseName + "-" + suffix++;
    }
    providerNames[baseName] = name;
    config["rule-providers"][name] = definition(name);
  }

  // Your existing explicit direct-routing policy, with repeated entries removed.
  // These manual exceptions do not change when the online rule sets refresh.
  const customDirectRules = [
      "DOMAIN,localhost,DIRECT",
      "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
      "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
      "DOMAIN-SUFFIX,douyin.com,DIRECT",
      "DOMAIN-KEYWORD,doubao,DIRECT",
      "DOMAIN-SUFFIX,douyinvod.com,DIRECT",
      "DOMAIN-SUFFIX,douyinpic.com,DIRECT",
      "DOMAIN-SUFFIX,douyincdn.com,DIRECT",
      "DOMAIN-SUFFIX,byteimg.com,DIRECT",
      "DOMAIN-SUFFIX,bytedance.com,DIRECT",
      "DOMAIN-SUFFIX,bytedance.net,DIRECT",
      "DOMAIN-SUFFIX,toutiao.com,DIRECT",
      "DOMAIN-SUFFIX,toutiaoimg.com,DIRECT",
      "DOMAIN-SUFFIX,ixigua.com,DIRECT",
      "DOMAIN-SUFFIX,doubao.com,DIRECT",
      "DOMAIN-SUFFIX,doubao.cn,DIRECT",
      "DOMAIN-SUFFIX,volcengine.com,DIRECT",
      "DOMAIN-SUFFIX,volces.com,DIRECT",
      "DOMAIN-SUFFIX,volccdn.com,DIRECT",
      "DOMAIN-SUFFIX,bytecdn.cn,DIRECT",
      "DOMAIN-SUFFIX,bytecdn.com,DIRECT",
      "DOMAIN-SUFFIX,byteimg.cn,DIRECT",
      "DOMAIN-SUFFIX,bytescm.com,DIRECT",
      "DOMAIN-SUFFIX,bytegoofy.com,DIRECT",
      "DOMAIN-SUFFIX,bytefcdn.com,DIRECT",
      "DOMAIN-SUFFIX,zijieapi.com,DIRECT",
      "DOMAIN-SUFFIX,zijieapi.com.cn,DIRECT",
      "DOMAIN-SUFFIX,zijiecdn.com,DIRECT",
      "DOMAIN-SUFFIX,zijiecdn.cn,DIRECT",
      "DOMAIN-SUFFIX,weixin.qq.com,DIRECT",
      "DOMAIN-SUFFIX,wechat.com,DIRECT",
      "DOMAIN-SUFFIX,wx.qq.com,DIRECT",
      "DOMAIN-SUFFIX,qq.com,DIRECT",
      "DOMAIN-SUFFIX,qpic.cn,DIRECT",
      "DOMAIN-SUFFIX,gtimg.cn,DIRECT",
      "DOMAIN-SUFFIX,gtimg.com,DIRECT",
      "DOMAIN-SUFFIX,myqcloud.com,DIRECT",
      "DOMAIN-SUFFIX,qcloud.com,DIRECT",
      "DOMAIN-SUFFIX,tencent.com,DIRECT",
      "DOMAIN-SUFFIX,tencent-cloud.com,DIRECT",
      "DOMAIN-SUFFIX,tenpay.com,DIRECT",
      "DOMAIN-SUFFIX,taobao.com,DIRECT",
      "DOMAIN-SUFFIX,tmall.com,DIRECT",
      "DOMAIN-SUFFIX,tmall.hk,DIRECT",
      "DOMAIN-SUFFIX,alicdn.com,DIRECT",
      "DOMAIN-SUFFIX,alibaba.com,DIRECT",
      "DOMAIN-SUFFIX,alibabacloud.com,DIRECT",
      "DOMAIN-SUFFIX,aliyun.com,DIRECT",
      "DOMAIN-SUFFIX,alipay.com,DIRECT",
      "DOMAIN-SUFFIX,alipayobjects.com,DIRECT",
      "DOMAIN-SUFFIX,1688.com,DIRECT",
      "DOMAIN-SUFFIX,amap.com,DIRECT",
      "DOMAIN-SUFFIX,autonavi.com,DIRECT",
      "DOMAIN-SUFFIX,ele.me,DIRECT",
      "DOMAIN-SUFFIX,jd.com,DIRECT",
      "DOMAIN-SUFFIX,jd.hk,DIRECT",
      "DOMAIN-SUFFIX,jdcloud.com,DIRECT",
      "DOMAIN-SUFFIX,jdpay.com,DIRECT",
      "DOMAIN-SUFFIX,360buyimg.com,DIRECT",
      "DOMAIN-SUFFIX,baidu.com,DIRECT",
      "DOMAIN-SUFFIX,baidubce.com,DIRECT",
      "DOMAIN-SUFFIX,bdimg.com,DIRECT",
      "DOMAIN-SUFFIX,bdstatic.com,DIRECT",
      "DOMAIN-SUFFIX,baidupcs.com,DIRECT",
      "DOMAIN-SUFFIX,hao123.com,DIRECT",
      "DOMAIN-SUFFIX,bilibili.com,DIRECT",
      "DOMAIN-SUFFIX,bilibili.tv,DIRECT",
      "DOMAIN-SUFFIX,biliapi.com,DIRECT",
      "DOMAIN-SUFFIX,biliapi.net,DIRECT",
      "DOMAIN-SUFFIX,hdslb.com,DIRECT",
      "DOMAIN-SUFFIX,xiaohongshu.com,DIRECT",
      "DOMAIN-SUFFIX,xhscdn.com,DIRECT",
      "DOMAIN-SUFFIX,xhscdn.net,DIRECT",
      "DOMAIN-SUFFIX,weibo.com,DIRECT",
      "DOMAIN-SUFFIX,weibo.cn,DIRECT",
      "DOMAIN-SUFFIX,sina.com.cn,DIRECT",
      "DOMAIN-SUFFIX,sina.cn,DIRECT",
      "DOMAIN-SUFFIX,sinaimg.cn,DIRECT",
      "DOMAIN-SUFFIX,zhihu.com,DIRECT",
      "DOMAIN-SUFFIX,zhimg.com,DIRECT",
      "DOMAIN-SUFFIX,163.com,DIRECT",
      "DOMAIN-SUFFIX,126.com,DIRECT",
      "DOMAIN-SUFFIX,netease.com,DIRECT",
      "DOMAIN-SUFFIX,126.net,DIRECT",
      "DOMAIN-SUFFIX,mi.com,DIRECT",
      "DOMAIN-SUFFIX,xiaomi.com,DIRECT",
      "DOMAIN-SUFFIX,miui.com,DIRECT",
      "DOMAIN-SUFFIX,mi-img.com,DIRECT",
      "DOMAIN-SUFFIX,huawei.com,DIRECT",
      "DOMAIN-SUFFIX,hicloud.com,DIRECT",
      "DOMAIN-SUFFIX,hihonor.com,DIRECT",
      "DOMAIN-SUFFIX,oppo.com,DIRECT",
      "DOMAIN-SUFFIX,heytap.com,DIRECT",
      "DOMAIN-SUFFIX,vivo.com.cn,DIRECT",
      "DOMAIN-SUFFIX,meituan.com,DIRECT",
      "DOMAIN-SUFFIX,meituan.net,DIRECT",
      "DOMAIN-SUFFIX,dianping.com,DIRECT",
      "DOMAIN-SUFFIX,pinduoduo.com,DIRECT",
      "DOMAIN-SUFFIX,pddpic.com,DIRECT",
      "DOMAIN-SUFFIX,yangkeduo.com,DIRECT",
      "DOMAIN-SUFFIX,kuaishou.com,DIRECT",
      "DOMAIN-SUFFIX,ksapisrv.com,DIRECT",
      "DOMAIN-SUFFIX,kspkg.com,DIRECT",
      "DOMAIN-SUFFIX,douban.com,DIRECT",
      "DOMAIN-SUFFIX,doubanio.com,DIRECT",
      "DOMAIN-SUFFIX,12306.cn,DIRECT",
      "DOMAIN-SUFFIX,95306.cn,DIRECT",
      "DOMAIN-SUFFIX,unionpay.com,DIRECT",
      "DOMAIN-SUFFIX,95516.com,DIRECT",
      "DOMAIN-SUFFIX,icbc.com.cn,DIRECT",
      "DOMAIN-SUFFIX,ccb.com,DIRECT",
      "DOMAIN-SUFFIX,abchina.com,DIRECT",
      "DOMAIN-SUFFIX,boc.cn,DIRECT",
      "DOMAIN-SUFFIX,bankcomm.com,DIRECT",
      "DOMAIN-SUFFIX,cmbchina.com,DIRECT",
      "DOMAIN-SUFFIX,gov.cn,DIRECT",
      "DOMAIN-SUFFIX,edu.cn,DIRECT",
      "DOMAIN-SUFFIX,cn,DIRECT"
  ];

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

  // Merge 先执行，Script 后执行。复用 Merge 的国内 DNS，不维护第二份名单。
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
