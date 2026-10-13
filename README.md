# Clash Verge Rev 全局中国大陆直连规则

把本仓库的两个文件分别粘贴到 Clash Verge Rev 的 **全局扩展覆写配置（Merge）** 和 **全局扩展脚本（Script）**。

适用于所有配置在生成运行配置时的处理：既有订阅、新增订阅、导入的本地配置，激活或重新加载后都会应用这份全局脚本。刷新正在使用的订阅后也会重新应用。**不修改服务器订阅，也不直接改写下载保存的订阅原文。** 非当前配置在之后激活、生成运行配置时应用。

本仓库只提供需要粘贴的内容；本次没有修改本机 Clash Verge 的全局配置、DNS、节点或订阅绑定。

## 两个选项分别填写什么

### 1. 全局扩展覆写配置（Merge）

打开 [global-merge.yaml](global-merge.yaml)，完整复制到该选项中。该文件现在包含完整 DNS 配置、Fake-IP 排除列表、解析路径和缓存设置，具体说明见下文“DNS 与通用覆写”。**必须搭配本仓库的全局脚本**，因为 DNS 政策引用脚本注册的 `hmxx-cn-direct` 规则集。

所有在线规则集定义和前置逻辑仍由脚本管理，不要另外在 Merge 中写 `rules:`；列表覆写可能丢掉机场原有规则。如果你有自己的 DNS/hosts 等定制，先与此文件核对再替换。

### 2. 全局扩展脚本（Script）

打开 [global-script.js](global-script.js)，复制**整个文件**，替换旧的全局脚本后保存。只保留一个 `main` 函数，不要把两个脚本直接拼接。

脚本已经读取并保留你原有全局脚本里的自定义直连政策，包括局域网、抖音/豆包、微信/QQ、淘宝/支付宝、京东、百度、哔哩哔哩、小红书、微博、知乎、网易、手机厂商、美团、拼多多、快手、银行、政府和教育等条目。原来的 133 个条目去掉重复项及两个旧 Geo 数据库规则后，保留了 120 个自定义条目；通用地域分类改用下面的在线规则集。

本次没有擅自删除你原有的国际业务域名或较宽的 `DOMAIN-KEYWORD,doubao`、`.cn` 等规则。这些是你之前的直连选择，并不保证每个服务在任何网络都可直连。例如 `bilibili.tv`、`alibaba.com`、`alibabacloud.com`、`tmall.hk`、`jd.hk` 也仍在自定义列表中；若你不想强制某项直连，在 `customDirectRules` 中删除对应条目即可。

保存后点一次“重新激活订阅”，在“查看运行时订阅”中检查生成的 `rules`。使用 **规则模式**；全局代理模式或直连模式不会按这份分流列表工作。

## DNS 与通用覆写

新版本基于本机原有的 Fake-IP、IPv4、缓存和本地排除列表补全；主要变化是把“所有网站都用国内 DNS”改成明确的国内/其他域名解析路径。

| 字段/模块 | 本方案的内容 | 作用 |
|---|---|---|
| `tcp-concurrent` | `true` | 允许并发拨号 |
| `profile` | 保存选择和 Fake-IP 映射 | 重新加载时复用缓存 |
| DNS 监听 | `127.0.0.1:1053` | 本机 DNS 服务，不对局域网开放 |
| `enhanced-mode` | `fake-ip` | 给普通域名建立虚拟地址映射 |
| 排除列表 | 本地、联网检测、NTP、部分登录域名 | 这些域名返回实际解析结果，不返回 Fake-IP |
| `cache-algorithm` | `arc` | DNS 缓存策略 |
| `prefer-h3` | `false` | 不强制通过 HTTP/3 查询 DoH |
| `respect-rules` | `true` | DNS 上游连接遵循分流；下述 DIRECT 设置明确绕过分流 |
| 引导 DNS | `223.5.5.5`、`119.29.29.29` | 找到国内 DoH 服务器地址；这一环节仍是普通 DNS |
| 节点域名 DNS | 阿里/腾讯 DoH，明确 `#DIRECT` | 在代理连接建立前解析服务器域名，避免循环依赖 |
| 直连出口 DNS | 阿里/腾讯 DoH，遵循域名 policy | 解析直接连接的目的地 |
| 默认网站 DNS | Cloudflare/Google DoH，明确 `#RULES` | 未匹配国内或本地政策的域名，通过现有分流查询 |
| 大陆域名政策 | `rule-set:hmxx-cn-direct`、`.cn` | 使用国内 DoH；与每周更新的直连域名集合保持一致 |
| 本地域名政策 | `.lan`、`.local`、`.home.arpa` 等 → `system` | 使用当前网络的系统解析器，不硬编码某一台路由器 |
| `fallback` | 清空 | 避免混入机场另一套 fallback 分类 |

没有为 YouTube 或其他海外服务指定节点或专用策略组，也没有使用一个固定机场的节点名。`#RULES` 跟随你当前的现有分流，通常落到原订阅的代理兜底规则；**它不是保证强制代理**，如果你把该路径选择为 DIRECT，查询也会尝试直连。需要配置本身有可用的代理路径，默认境外 DoH 才能正常访问。

`proxy-server-nameserver` 与默认网站 DNS 是两条不同的路径。前者明确直连，后者可以经过已建立的代理，因此不存在“必须先连接节点才能解析节点地址”的设计循环。域名指向的代理地址本身若被国内解析器限制，仍需单独的节点域名政策；这份通用模板不保证所有机场域名都可解析。

这里没有写 `tun`、系统代理开关、监听代理端口、`mode` 或 `unified-delay`。这些由 Clash Verge 设置控制，写进扩展不一定生效。仅设置 DNS `listen` 也不会自动把系统 DNS 接管过来，正常使用仍需你已开启的 TUN DNS 接管或相应应用代理设置。

DNS 的 IPv6 默认关闭，贴合当前 IPv4 代理环境。Clash 的 DNS 覆写页面若启用了 IPv6，可能覆盖 `dns.ipv6`；应用设置优先级见[官方扩展说明](https://www.clashverge.dev/guide/extend.html)。若需要 IPv6，请同时核对应用开关与此配置。

### DNS 覆写的优先级

这份全局 Merge 提供的是一套明确的默认 DNS。**它会替换相应的机场 DNS 列表和政策**，并非保留机场 DNS 不变。新版本 Clash Verge 对 DNS/hosts 的合并细节也有变化，使用前应看生成的最终运行配置。

订阅自己的 Merge/Script 仍在全局扩展之后执行，可以重新改写 DNS。若某个配置的 DNS 没有按这份模板生效，检查该订阅的 DNS 扩展，而不要反复只改全局内容。原脚本继续保留输入中的 DNS，不会覆盖这份 Merge；这是两部分的职责分工。

完整字段含义和 `#DIRECT` / `#RULES` 的行为依据：[Mihomo DNS 文档](https://wiki.metacubex.one/config/dns/)。

## 搜索和选择的规则集

核对时间：2026-10-13。以下都是各项目自己的 GitHub 仓库。

| 项目 | 内容与格式 | 本方案的选择 |
|---|---|---|
| [Loyalsoldier/clash-rules](https://github.com/Loyalsoldier/clash-rules) | 提供直连域名、私有域名、局域网及大陆 IP 等现成 YAML payload | 默认使用，四个用途清晰的规则集即可 |
| [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) | 按服务、地区和客户端分类，包含 Clash 分类规则 | 可用于以后补充某个服务，本方案不再叠加另一套大型重复分类 |
| [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) | Mihomo 的 GeoSite/GeoIP 数据及 MRS 规则文件 | 可作为更紧凑的替代来源，本方案选较易阅读的 YAML |

实际下载的是 Loyalsoldier 的 `release` 分支：

| 本地规则集名称 | 上游文件 | 用途 | behavior |
|---|---|---|---|
| `hmxx-cn-private` | [private.txt](https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/private.txt) | 私有网络域名、路由器域名 | `domain` |
| `hmxx-cn-lan` | [lancidr.txt](https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/lancidr.txt) | 局域网、保留地址，含 IPv6 范围 | `ipcidr` |
| `hmxx-cn-direct` | [direct.txt](https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/direct.txt) | 上游维护的直连域名分类 | `domain` |
| `hmxx-cn-cidr` | [cncidr.txt](https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/cncidr.txt) | 上游大陆 IP 分类 | `ipcidr` |

虽然文件名是 `.txt`，内容是 `payload:` YAML，因此配置为 `format: yaml`。没有加入单独的 Apple、Google、广告或境外代理规则集，也没有创建任何代理节点或策略组。

## 如何保证放在原订阅规则前面

每次执行脚本时，它会：

1. 注册四个 `hmxx-cn-*` 在线规则集，并保留原订阅的其他 rule providers。
2. 生成自己的直连规则块：私有域名、局域网地址、自定义直连条目、直连域名列表、大陆 IP 列表。
3. 先从原规则列表中移除与这个规则块相同的旧副本。
4. 把完整直连规则块放到数组开头，之后才接原订阅的其他规则，其他规则顺序不变。

这样即使同名直连规则原来在 `MATCH` 后面，也会被移动到前面。旧脚本只在“没有同名规则”时追加的去重逻辑，会让末尾同名规则继续留在末尾；这里修正了这一点。重复激活不会重复堆积条目。

大陆 CIDR 规则没有 `no-resolve`：必要时允许解析域名再判定其 IP 是否属于大陆，以覆盖未被域名列表收录的大陆站点。这可能增加一次 DNS 解析。局域网 CIDR 保留 `no-resolve`，避免仅为私网地址分类触发域名解析。

**直连规则优先也会超过原订阅的广告拦截或其他代理规则。** 这是按照“放到最顶端”的要求实现的；属于直连列表的目标会先命中 DIRECT。

### 全局脚本的优先级边界

[Clash Verge 官方扩展文档](https://www.clashverge.dev/guide/extend.html)说明，全局扩展后还会执行订阅扩展。你的截图也显示了这一顺序。

因此这份脚本保证：**在全局脚本执行完成时，直连规则位于原订阅规则之前。** 但如果某个订阅之后用自己的扩展配置整体替换 `rules`，或者订阅脚本再前置其他规则，全局脚本不能阻止它。仅靠这两个全局选项，无法保证任意后续脚本都改不动最终顺序。

正常情况下无需给每个订阅设置一次。若某个订阅最终顺序不对，检查并清空其“编辑规则”中的额外 prepend 规则、订阅“扩展覆写配置”中的 `rules` 覆写，以及订阅“扩展脚本”中的规则改写；保留不涉及规则的其他订阅扩展即可。本仓库不会自动编辑你的各个订阅来绕过这个边界。

## 每周自动更新的实现

四个 provider 都设置：

```javascript
interval: 604800  // 7 × 24 × 60 × 60 秒
```

计时和下载由 **Mihomo 内核**负责，JavaScript 只负责生成这项配置，不需要在脚本里使用 `fetch`、`setInterval`，也不需要 GitHub Actions 或系统定时任务。首次使用会下载数据；有缓存时复用缓存，正常运行期间按间隔更新。更新在线规则不需要重新拉取机场订阅。

这是七天更新间隔，不是固定“每周一几点”。关闭、休眠、网络失败或重建 provider 会影响实际刷新时间。更新只在内核运行且上游可访问时发生；你手写的 `customDirectRules` 是静态例外，不会被在线更新改写，原订阅的其他 provider 的间隔也不被修改。

规则文件缓存在内核工作目录的 `ruleset/hmxx-cn-*.yaml`。相同全局脚本作用于不同配置时使用相同的缓存路径，不会给每个订阅复制一份百万行规则。

### 下载规则集的网络路径

脚本用 `proxy: "GLOBAL"`，通过 Mihomo 内置 GLOBAL 组下载，避免依赖某个机场专用的策略组名称。这个设置只影响规则文件下载，不改变你日常流量选择器。

如 GitHub Raw 下载失败，检查 GLOBAL 组选择的节点是否可用。也可以把脚本顶部的 `BASE_URL` 改为上游官方提供的备用地址：

```javascript
const BASE_URL = "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/";
```

备用 CDN 可能有缓存延迟；这是替代下载源，不是脚本自动重试或自动切换功能。

## 验证与维护

脚本的排序、重复执行、新导入配置以及保留其他设置的行为，可以运行：

```sh
node --test tests/global-script.test.cjs
```

实际 Mihomo 加载和在线刷新验证说明见 [VALIDATION.md](VALIDATION.md)。仓库中没有上传代理凭据、订阅链接或本机完整配置，规则集内容仍从上游获取。

如果以后新增自定义例外，修改 `customDirectRules`；如果更换在线来源，确认 `behavior` 和 `format` 与真实内容一致。停用时移除全局脚本中的这段逻辑并重新激活订阅即可，服务器原始订阅不受影响。

## 参考文档

- [Mihomo rule providers：格式、更新间隔和下载代理](https://wiki.metacubex.one/config/rule-providers/)
- [Mihomo DNS：解析路径、Fake-IP、域名政策和代理参数](https://wiki.metacubex.one/config/dns/)
- [Clash Verge Rev：全局及订阅扩展的作用范围、合并规则、执行顺序](https://www.clashverge.dev/guide/extend.html)
- [Loyalsoldier：规则文件、来源、官方备用下载地址](https://github.com/Loyalsoldier/clash-rules)

代码使用本仓库已有的 MIT 许可证；所引用的第三方规则数据遵循各自上游许可证。
