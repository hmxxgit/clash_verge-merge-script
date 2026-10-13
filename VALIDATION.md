# 验证记录

## 本次 Code Review / Bug Fix（2026-10-13）

环境：macOS、Clash Verge 自带 Mihomo **v1.19.32**，独立临时工作目录和 loopback 端口。未修改用户 Clash 的节点、代理组、订阅、全局扩展或应用开关。所有测试核心、线程和临时文件在退出时清理。

### 实际问题与处理

| 严重程度 | 问题 | 处理 |
|---|---|---|
| 高 | 前置大陆 IP 规则可能抢先匹配原订阅的海外代理域名 | 放在原订阅具体规则之后、首个 MATCH 之前；不改原兜底 |
| 高 | 同名 provider 被直接覆盖 | 不同定义使用独立后缀和缓存路径，调整自身引用 |
| 中 | 全局去重会删除原订阅相同规则 | 仅识别完整生成前缀和 IP 插入项，保留订阅原规则及重复项 |
| 中 | 手动直连域名未必属于 rule-set DNS 分类 | Script 自动同步 DOMAIN/DOMAIN-SUFFIX；关键词不转换 |
| 中（文档边界） | DoH/GLOBAL 被误解为保证代理或零泄漏 | 补充系统接管、引导解析、出口选择和首次下载失败边界 |
| 非缺陷 | 上游 .txt + format: yaml | 四个文件均为 payload YAML，保留 yaml 和 .yaml 缓存 |

### 静态及回归测试

- `node --check global-script.js`：通过。
- Ruby 标准 YAML 解析实际 `global-merge.yaml`：通过；smoke 使用该解析结果先应用 Merge、再执行 Script，不使用另一份手写 DNS 模板。
- `node --test tests/global-script.test.cjs`：**7 项全部通过**。覆盖缺失 rules、多种 MATCH/域名/IP 顺序、原规则及重复项保留、序列化后幂等、旧版生成块迁移、同名 provider 独立命名、无关 DNS/节点/代理组/TUN/模式/端口不变，以及 DNS 后缀与关键词的严格区别。
- `git diff --check`：通过。

### 真实上游格式、加载和刷新

curl 直接下载上游原始字节到临时缓存，**没有文本/YAML 转换步骤**。四个文件通过 YAML payload 解析；最终 Merge→Script 配置通过 `mihomo -t`，内核加载数与原始 payload 数一致。真实内核通过 GLOBAL 下载出口对四个 provider 主动 PUT 更新，全部成功。

| Provider | 原始字节 | YAML payload 数 | 内核加载数 |
|---|---:|---:|---:|
| hmxx-cn-private | 3,478 | 130 | 130 |
| hmxx-cn-lan | 341 | 18 | 18 |
| hmxx-cn-direct | 2,293,950 | 110,924 | 110,924 |
| hmxx-cn-cidr | 210,825 | 9,609 | 9,609 |

原始下载 SHA-256（上游可能每日变化）：

```text
hmxx-cn-private: 3a04b128200ef8097d73b1496cbb23d24bc1e05d42fffb09f07c51699efb00b2
hmxx-cn-lan: 82920b241dc328f1dc99849cf733ed8675a00a4ee0bdf64c892b332dfb7e1e2e
hmxx-cn-direct: c91a00128a071c6a3fa94c11cf7448ed1552a691e84ffb30a43b5838b9e39abc
hmxx-cn-cidr: 0db34dd0446a376f5a8a2948b1878acd4a4b697025c7c02df3e56e4fd876c352
```

原历史测试成功符合 YAML 原始数据格式，并非依据后缀加载。旧记录没有保存上游哈希，无法追溯证明所有历史版本都相同；当前测试补充了原始字节哈希和 payload 计数。只检查 `-t` 或“非空 provider”都不足以证明正确分类，因此本次还检查实际规则命中和 DNS policy。

最终 fixture 的首条为 hmxx-cn-private，123 条直连域名/私网前置项后是原 DOMAIN 代理规则，再是 hmxx-cn-cidr，最后是原 MATCH（索引 125）。原订阅 MATCH 的出口不变。

### 真实公网 DNS / UDP 验证

- `www.baidu.com`：国内 DoH 返回真实 A 记录（180.101.49.44、180.101.51.73）。
- `www.google.com`：默认境外加密 DNS 路径返回真实 A 记录（多个 142.251.* 地址）。这些地址只记录本次应答，不作为固定配置。
- 普通域名 `dns-smoke.invalid`：UDP 返回 198.18.0.4，证明 Fake-IP 实际生效。
- 排除项 `captive.apple.com`：UDP 返回 17.253.83.150、17.253.83.139，证明真实 IP 返回路径。

DNS API 查询实际 IP，不能单独证明 Fake-IP；因此 Fake-IP 使用真正的 UDP 查询验证。

### 受控上游 + 真实内核的确定性测试

第二阶段只在临时 fixture 中替换 DNS 上游、下载 URL 和测试代理，使用本机标准库服务，不更改仓库的生产配置。国内/境外解析器分别返回 127.0.0.1/127.0.0.2 作为标记地址，这些是测试信号，不是公网解析结果。

- doubao.com、qq.com、bilibili.com 的子域名命中国内 policy；从实际 direct payload 选取、不属于手动名单的 `dns-check.0.zone` 也命中国内 policy，证明 RULE-SET DNS 引用生效。
- 普通非国内测试域名、只包含 doubao 关键词的其他域名命中默认境外 DNS，证明关键词未被错误转成后缀 policy。
- 节点 `node.fixture.test` 在连接建立前通过国内节点解析器解析；没有向默认境外解析器查询此节点。通过该节点完成实际 HTTP CONNECT 代理连接。
- 模拟海外域名解析到 223.5.5.5，仍完成原订阅 DOMAIN→smoke-proxy 的真实 HTTP 请求。该域名不在前置手动/上游 direct/private 集合中。
- 未被原订阅具体规则匹配的 223.5.5.6 请求命中 hmxx-cn-cidr→DIRECT；通过核心实际连接日志验证。目标端口 9 的连接成功不是此项验收内容。
- Apple/Windows 联网检测、Apple/Windows/NTP 时间域名、QQ/微信列出的特殊登录/多媒体域名经 UDP 返回真实标记 IP，而非 Fake-IP。仅验证过滤匹配，不代表这些应用完整功能验收。
- 四个 provider 各模拟 HTTP 503 和损坏 YAML 两种失败，共 **8 次失败更新**；逐次检查 API 已加载条目数和磁盘缓存字节未改变。
- 更新失败期间保持一个既有 SOCKS→DIRECT TCP 流，更新前后收到 `abc`、`def`，证明测试中的已有连接未中断。

### 未验证与适用边界

- 没有实际等待 604800 秒，也没有测试休眠/关闭后的七天计时；验证配置间隔和主动刷新。Mihomo 失败重试有内置退避，正常间隔不等于失败间隔。
- 未模拟所有机场、所有节点故障和用户后续订阅扩展；全局 Merge→Script 之后的订阅扩展及应用回写仍可能改变最终配置。实际 Clash Verge 编辑器保存/GUI 回写没有自动操作验收。
- 未测试其他内核版本；以本次 v1.19.32 和官方字段说明为支持证据。依赖原订阅具有可用代理路径。
- 未证明 macOS Bonjour/mDNS、系统 DNS 接管、IPv6 全路径、应用自带 DoH、QQ/微信登录和通话、豆包全部功能；没有“零 DNS 泄漏”结论。
- GLOBAL 成功下载及有效缓存失败保留已验证；首次无缓存且下载失败不能保证分类生效。没有加入自动 CDN 切换。
- 保留原有手动与上游 direct 域名优先政策，可能覆盖机场对这些域名的代理/广告拦截规则。大陆 IP 补充规则遵守机场已有具体规则，无法保证任意宽泛提前规则下仍命中 DIRECT。

## 历史记录（修复前，保留用于对照）

以下排序、去重和测试数量描述对应旧版，不代表当前行为。

日期：2026-10-13。未将本仓库内容写入用户的 Clash Verge 配置。

## 脚本行为测试

运行 `node --test tests/global-script.test.cjs`，3 项全部通过：

- 原订阅把 `MATCH` 放在前面、同名直连规则放在后面时，仍把直连规则移动到前面；兼容规则字段间的空格。
- 没有 `rules` 的新配置、空规则配置和已有规则配置均可处理，重复执行结果不变。
- 原有 DNS、代理模式、节点、代理组、其他 rule providers，以及剩余规则的顺序得到保留。

## 真实 Mihomo 加载与下载验证

用 Mihomo v1.19.32 的独立进程、临时工作目录、仅绑定 `127.0.0.1` 的控制接口运行 `tests/mihomo-smoke.py`。下载真实上游 YAML 数据，运行配置检查，然后读取内核规则列表和规则集状态。该过程不会修改现有 Clash 配置或切换用户的节点。

| 规则集 | 下载字节数 | 内核加载条目数 |
|---|---:|---:|
| hmxx-cn-private | 3,478 | 130 |
| hmxx-cn-lan | 341 | 18 |
| hmxx-cn-direct | 2,293,950 | 110,924 |
| hmxx-cn-cidr | 210,825 | 9,609 |

四个下载请求均成功；生成配置通过 Mihomo `-t` 检查，四个 provider 均加载了非空内容。额外通过内核 API 对四个规则集逐个触发下载刷新，请求全部成功。

排序测试特意把原始 `MATCH,smoke-proxy` 放在最前面，把一个已存在的直连 RULE-SET 放在它后面。实际运行后的第一条为 `RuleSet(hmxx-cn-private) → DIRECT`，最后一条为原始 `MATCH → smoke-proxy`，索引为 124。共有 124 条前置规则：120 条保留的自定义规则，加四条在线规则集入口。

配置中的四个 `interval` 都是 604800 秒。测试没有实际等待七天，也没有模拟关闭、休眠、网络失败或每个机场的后续订阅脚本；这些行为边界在 README 中说明。

临时测试核心已停止，临时工作目录和下载的规则内容自动删除。没有公开测试端口、提交代理凭据或复制第三方规则数据到仓库。

## 自行复验

需要 Python 3、curl、Node.js、Mihomo，以及一个能访问 GitHub 的本地 HTTP 代理。例子：

```sh
node --test tests/global-script.test.cjs
python3 tests/mihomo-smoke.py \
  --core /path/to/mihomo \
  --node /path/to/node \
  --proxy http://127.0.0.1:7897
```

这个验证脚本只使用隔离的临时配置，既有代理用作测试出站。内核初始化大型域名规则集是异步过程，测试会等待加载完成再检查条目数。

## 完整 DNS 覆写复验

后续补齐 `global-merge.yaml` 后，用同一验证脚本将完整 Merge 先应用到测试配置，再执行全局 Script。仅把 DNS 监听端口换成隔离的本机临时端口，其他 DNS 参数均来自仓库文件。

完整配置通过 Mihomo v1.19.32 校验；四个规则集仍加载成功，主动刷新成功，124 条直连规则仍位于原来的 MATCH 之前。三项 JavaScript 行为测试也再次通过。

实际 DNS 测量：

| 请求 | 结果 | 验证对象 |
|---|---|---|
| DNS API：`www.baidu.com` A | 返回 `180.101.49.44`、`180.101.51.73` | 国内域名解析成功 |
| DNS API：`www.google.com` A | 返回多个 `142.251.*` 地址 | 默认境外加密 DNS 路径能完成解析 |
| UDP：`dns-smoke.invalid` A | 返回 `198.18.0.4` | 真正的 Fake-IP 响应 |
| UDP：`captive.apple.com` A | 返回 `17.253.83.149`、`17.253.83.148` | 排除列表里的域名返回真实地址 |

DNS API用于真实地址查询，不能单独证明 Fake-IP 生效，因此后两项通过真实 UDP DNS 请求验证。以上 IP 只是测试当时的应答，没有硬编码进配置，也不是网站唯一正确的 IP。

代理测试出口使用本机既有 HTTP 代理的 IP 地址；没有独立模拟机场节点域名解析故障或节点切换。没有修改用户当前的 Clash 全局 Merge/Script、DNS 开关或节点选择。应用最终回写和订阅扩展覆盖的边界仍需用户粘贴后查看最终运行配置。

现在 smoke 测试还需要 Ruby 的标准 YAML 库读取实际 Merge 文件；macOS 可使用系统 Ruby，其他环境可用 `--ruby /path/to/ruby` 指定。`--proxy` 指定的既有本地代理既用于测试期间下载数据，也作为隔离核心的境外出站。
