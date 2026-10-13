// Paste the entire file into Clash Verge Rev's GLOBAL extension script.
// Online rule sets are refreshed by Mihomo every 604800 seconds (7 days).
// This file does not create nodes or change DNS, TUN, or the proxy mode.
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

  // Preserve all other subscription-provided rule sets.
  config["rule-providers"] = { ...(config["rule-providers"] || {}) };
  for (const [name, file, behavior] of sources) {
    config["rule-providers"][name] = {
      type: "http",
      behavior,
      format: "yaml",
      url: BASE_URL + file + ".txt",
      path: "./ruleset/" + name + ".yaml",
      interval: WEEK_SECONDS,
      // GLOBAL is Mihomo's built-in group, independent of subscription group names.
      proxy: "GLOBAL"
    };
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
    "RULE-SET,hmxx-cn-private,DIRECT",
    "RULE-SET,hmxx-cn-lan,DIRECT,no-resolve",
    ...customDirectRules,
    "RULE-SET,hmxx-cn-direct,DIRECT",
    // Allow DNS resolution here so mainland IPs can be recognized for domain requests.
    "RULE-SET,hmxx-cn-cidr,DIRECT"
  ])];
  const normalize = rule => typeof rule === "string"
    ? rule.split(",").map(part => part.trim()).join(",")
    : rule;
  const managed = new Set(managedRules.map(normalize));
  const originalRules = Array.isArray(config.rules) ? config.rules : [];

  // Remove old copies FIRST, then prepend. A copy below MATCH must never stay there.
  config.rules = [
    ...managedRules,
    ...originalRules.filter(rule => !managed.has(normalize(rule)))
  ];
  return config;
}
