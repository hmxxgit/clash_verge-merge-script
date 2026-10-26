# Clash Verge Rev 全局扩展脚本

一个可直接粘贴到 Clash Verge Rev 的单文件脚本：补充常用国内网站直连，并为国内外域名选择不同的 DNS 上游。

## 功能

- 局域网、保留地址和代表性国内网站直连。
- 国内域名使用阿里 DNS / DNSPod DoH；其他域名使用 Cloudflare / Google DoH。
- 国外 DoH 连接使用 Mihomo 的 `#RULES`，遵循机场原有规则和代理组选择。
- 保留订阅原有节点、代理提供者、代理组、具体规则、`MATCH` 兜底和测速设置。
- 代理节点域名通过可直连的国内 DoH 解析，避免代理建立前的 DNS 循环依赖。

脚本不下载 GeoSite、GeoIP 或远程规则集，也不需要 Merge YAML、npm 或构建步骤。

## 安装

1. 打开 Clash Verge Rev 的「订阅」页面。
2. 找到「全局扩展脚本」，右键选择「编辑文件」。不同版本的名称可能显示为「全局脚本」或「Script 配置」。
3. 复制 [`global-script.js`](global-script.js) 的全部内容，粘贴并保存。
4. 重新应用当前订阅。
5. 在运行配置中检查 `dns`、规则顺序，并执行一次节点延迟测试。

官方说明：[Clash Verge Rev 扩展配置与脚本](https://www.clashverge.dev/guide/extend.html)；[Mihomo DNS 配置](https://wiki.metacubex.one/config/dns/)。

## 推荐设置

- 使用 Rule 模式；脚本不改变客户端运行模式。
- 系统代理只接管遵循系统代理的应用；需要覆盖更多应用时可自行启用 TUN。脚本不会修改 TUN、端口或系统 DNS。
- 可用 `dnsleaktest.com` 等工具检查当前网络。还应检查浏览器 Secure DNS、IPv6、VPN、其他网卡和绕过代理的应用。

## 注意事项

- `#RULES` 让国外 DoH 的连接遵循订阅规则；若订阅本身把这些连接设为 DIRECT，脚本不会擅自改成代理。
- `default-nameserver` 只负责必要时的 DNS 服务器域名引导解析，使用国内明文 DNS；当前 DoH 上游均写为 IP，普通网站域名不会把它作为默认或回退上游。
- Fake-IP 对局域网、系统联网检测和时间服务保留了最小过滤项；特殊设备域名可自行加入 `fake-ip-filter`。
- 本脚本降低 Mihomo 管理范围内的 DNS 泄露风险，但不能保证操作系统级“零泄露”。
- 节点延迟仍取决于节点服务器、网络、机场测速 URL 和 Clash Verge Rev 的最终覆写。
- 脚本不会自动修复机场订阅本身的无效节点、代理组或规则。

## 验证

```bash
node --check global-script.js
node --test tests/global-script.test.cjs
```

测试只使用 Node.js 内置模块。静态测试通过不等同于 Clash Verge Rev 真机、真实 DNS 路径或节点测速已经验证。
