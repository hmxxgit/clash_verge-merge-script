# Clash Verge Rev 国内直连脚本

一个可直接粘贴到 Clash Verge Rev 的全局扩展脚本：**中国大陆流量强制直连，其他流量继续由机场原始配置决定。**

## 功能

- 局域网和私有 IPv4 地址优先 `DIRECT`。
- `GEOSITE,private`、`GEOSITE,cn` 和 `GEOIP,CN` 位于机场全部规则之前。
- 国内域名使用阿里 DNS / DNSPod DoH；其他域名使用 Cloudflare / Google DoH，并由机场原规则决定 DNS 连接出口。
- 强制 Mihomo 顶层和 DNS 使用 `ipv6: false`。
- 原样保留机场节点、代理提供者、代理组、测速参数、原始规则顺序和 `MATCH`。

脚本不创建代理组，不假设机场策略组名称，不下载额外 JavaScript，也不需要 Merge YAML、npm 或构建步骤。

## 安装

1. 打开 Clash Verge Rev 的「订阅」页面。
2. 找到「全局扩展脚本」，右键选择「编辑文件」。旧版本可能显示为「全局脚本」或「Script 配置」。
3. 复制 [`global-script.js`](global-script.js) 的全部内容，粘贴并保存。
4. 重新应用当前订阅，在运行配置中检查规则、DNS 和两个 `ipv6` 字段。
5. 使用 Rule 模式，并执行一次机场原有的节点延迟测试。

## 规则和 Geo 数据

固定优先级为：局域网及私有 IPv4 → `GEOSITE,private` → `GEOSITE,cn` → `GEOIP,CN` → 机场原始规则。机场中冲突的规则仍保留，但因位置靠后不会覆盖国内直连策略；脚本不会创建或改写 `MATCH`。

GeoSite 覆盖国内域名，GeoIP 处理解析后的中国大陆 IPv4，因此不再维护手写国内域名清单。脚本复用 Mihomo/Clash Verge Rev 当前的 Geo 数据配置，不设置 `geox-url`，也不在每次执行时强制下载或更新。Mihomo v1.19.33 实测会在首次缺库时尝试下载；网络受限、文件损坏或更新失败可能导致配置加载失败或分类过时。可参考 [Mihomo Geo 配置](https://wiki.metacubex.one/config/general/) 和 [MetaCubeX 数据发布](https://github.com/MetaCubeX/meta-rules-dat/releases)。

## DNS 与 IPv4-only

- `nameserver-policy["geosite:cn"]` 使用阿里 DNS、DNSPod 的 IP 型 DoH，并明确 `#DIRECT`。
- 未命中国内分类的域名使用 Cloudflare、Google DoH；`#RULES` 表示连接出口遵循机场原始规则，并不强制国外流量走代理。
- `proxy-server-nameserver` 使用可直连的国内 DoH，避免代理节点域名依赖尚未建立的代理。
- Fake-IP 只保留少量局域网、联网检测和时间服务兼容项；不配置额外 fallback。
- `config.ipv6` 和 `config.dns.ipv6` 始终为 `false`。这只约束 Mihomo 配置，不关闭操作系统 IPv6，也不修改 TUN 或系统代理。

## 限制

- Clash Verge Rev 的应用设置或后续订阅扩展可能在全局脚本之后回写字段，使用时应检查最终运行配置。
- IPv6 字面量节点和已有 IPv6 规则不会被删除，但 IPv6-only 节点在本策略下可能不可用；这不等于 DNS 故障。
- 节点测速仍取决于节点、网络和机场测速 URL；脚本只保证不修改测速组和参数。
- DNS 防护只覆盖交给 Mihomo 的查询，不能阻止浏览器 Secure DNS、系统、VPN 或绕过代理的应用自行解析。

## 测试

```bash
node --check global-script.js
node --test tests/global-script.test.cjs
```

测试只使用 Node.js 内置模块。真实内核验证结果以对应提交的执行报告为准，不能把静态测试等同于 Clash Verge Rev 真机或真实机场测速。
