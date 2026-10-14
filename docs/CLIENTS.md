# 客户端源码核对与兼容边界

核对日期：2026-10-14。读取各项目官方仓库，不依据第三方宣传推定扩展功能。下列确认属于源码/文档审查，**不是手机 App 实测**。客户端后续版本可能变化。

## 扩展能力速查（不是同一种 Merge）

| 客户端 | YAML 覆写 | 用户 JavaScript | 本项目选用的方式 |
|---|---|---|---|
| Verge Rev | 全局/订阅任意 Merge，受应用管理字段限制 | main(config)，全局/订阅层 | 保留双文件 |
| FlClash v0.9.0 | 标准模式字段覆写，含模型限定的 YAML 快捷编辑；不是 Verge 全局 Merge | QuickJS main(config)，按订阅绑定 | 自包含 Script |
| CMFA | 持久化/会话类型化字段覆写；完整 YAML 从文件/URL 读取 | 核对路径没有对应用户 JS 入口 | 完整派生 YAML 文件 |
| Clash Mi | YAML patch（有自己的 overwrite 语义） | flutter_js main(config)，JS 类型补丁 | 自包含 JS 或完整 YAML |
| 裸 Mihomo | 完整 YAML；没有自动合并两个机场配置的客户端挂钩 | 不提供这些客户端扩展入口 | 外部合成完整 YAML |

对于 Android，应用覆写模型/内核接受 dns.listen 字段并不代表系统会用该监听。没有把 127.0.0.1:1053 当作所有移动端的必要值；端口占用、App safe mode 和真实监听行为未真机验收。VPN 内部 DNS 接管与外部 UDP/TCP 监听是两条机制。

## Clash Verge Rev

[官方扩展文档](https://www.clashverge.dev/guide/extend.html)确认全局 Merge/Script 及订阅 Merge/Script，入口 `main(config)`（可有第二个 profileName 参数，本项目不依赖它）。顺序是订阅原文→应用设置→全局 Merge→全局 Script→订阅 Merge→订阅 Script→应用设置回写。应用管理的端口/模式/TUN 等不会因脚本写入就成为有效配置。

本项目根目录双文件保留此方式。共享 DNS 不再指定 listen；用临时端口做 DNS 测试不意味着真实用户需要填同一个端口。Windows/Linux App 未测试；macOS 也未修改/操作当前运行的全局扩展，真测为独立内核。

## FlClash v0.9.0

源码快照：`03f955382409a4a7ac1f3f92e46d9fcc6d39f106`。

- [setup.dart](https://github.com/chen08209/FlClash/blob/03f955382409a4a7ac1f3f92e46d9fcc6d39f106/lib/providers/actions/setup.dart)：非 custom Profile 选择 Script 后，对原文调用 handleEvaluate，再 makeRealProfileTask。其扩展选择为 standard/script，字段覆写支持模型限定的 YAML 快捷编辑；这不是 Verge 任意全局 Merge。
- [javascript.dart](https://github.com/chen08209/FlClash/blob/03f955382409a4a7ac1f3f92e46d9fcc6d39f106/lib/common/javascript.dart)与 [QuickJS 入口](https://github.com/chen08209/FlClash/blob/03f955382409a4a7ac1f3f92e46d9fcc6d39f106/plugins/rust_api/rust/src/script/mod.rs)：JSON 输入，QuickJS 调用 main(config)，JSON 输出；当前实现限时 10 秒、内存 256 MiB。本项目是同步纯转换，不需要 fetch/模块加载。应用自身可能补空 proxy-providers，本脚本不修改它。
- [task.dart](https://github.com/chen08209/FlClash/blob/03f955382409a4a7ac1f3f92e46d9fcc6d39f106/lib/common/task.dart)：脚本之后重写应用模式、端口、TUN、DNS override、profile.store-selected，并将 provider 缓存隔离到每配置目录；addedRules 可前置，appendSystemDns 可追加系统 DNS；safeMode 可清空 dns.listen。
- [订阅脚本选择 UI](https://github.com/chen08209/FlClash/blob/03f955382409a4a7ac1f3f92e46d9fcc6d39f106/lib/views/profiles/extend/script.dart)：每配置选择一个脚本。没有承诺新订阅自动绑定。
- [Android VpnService](https://github.com/chen08209/FlClash/blob/03f955382409a4a7ac1f3f92e46d9fcc6d39f106/android/service/src/main/java/com/follow/clash/service/VpnService.kt)：VPN Builder 设置 DNS，应用提供 DNS/VPN 接管。dns.listen 的 UDP/TCP 本机监听不是该机制的同义词。

使用 adapters/flclash.js，一个脚本完成共享默认值与 policy 同步。其内核配置与转换逻辑已测，**未运行 FlClash QuickJS/App**。不能根据本机 Node/Chrome 测试宣称 Android 真机完成验收。

## Clash Meta for Android（CMFA）

源码快照：`3cc102aab3f251ef460a3b6e2835b6c1eb581e73`。

- [官方 README](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/3cc102aab3f251ef460a3b6e2835b6c1eb581e73/README.md)：Clash.Meta Android 客户端；URL Scheme 导入配置，不是脚本导入协议。
- [ConfigurationOverride](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/3cc102aab3f251ef460a3b6e2835b6c1eb581e73/core/src/main/java/com/github/kr328/clash/core/model/ConfigurationOverride.kt)：持久化/会话配置覆写模型，不含本项目所需的用户 JS 入口和完整规则/provider 插入功能。它的 nameserverPolicy UI 类型也不是整个 Mihomo YAML 结构，不能把所有字段复制进去当 Verge Merge。
- [load.go](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/3cc102aab3f251ef460a3b6e2835b6c1eb581e73/core/src/main/golang/native/config/load.go)读取 config.yaml，按 Mihomo RawConfig 解析，不把完整 YAML 限制在上述 UI 模型的字段内。因此选择生成完整 YAML，而不是往有限覆写 UI 填上百条规则。
- [process.go](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/3cc102aab3f251ef460a3b6e2835b6c1eb581e73/core/src/main/golang/native/config/process.go)：先持久化覆写、再会话覆写，随后应用处理 DNS、profile、TUN、provider 路径等。DNS enable=false 会触发应用默认值；append-system-dns 可加入系统 DNS；应用自管 VPN 时关闭 RawConfig 的 TUN。validConfig 明确拒绝无 proxies 且无 proxy-providers 的配置。
- [TunService.kt](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/3cc102aab3f251ef460a3b6e2835b6c1eb581e73/service/src/main/java/com/github/kr328/clash/service/TunService.kt)设置 VPN DNS，[tun.go](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/3cc102aab3f251ef460a3b6e2835b6c1eb581e73/core/src/main/golang/native/tun/tun.go)构造内部 DNS hijack，不要求所有用户绑定 127.0.0.1:1053。
- [fetch.go](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/3cc102aab3f251ef460a3b6e2835b6c1eb581e73/core/src/main/golang/native/config/fetch.go)会把远程配置更新到 config.yaml，没有本项目的转换挂钩。派生配置不能继续按原机场 URL 更新并期待增强逻辑保留。

使用 tools/portable.html 或电脑 CLI 生成独立 YAML，再从文件导入新配置。保持原机场配置用于获取原文，新的机场原文需重新合成。七天规则集刷新仍自动运行。内核字段通过 v1.19.32 验证；具体 CMFA 内置 android-real 版本、VPN 与应用覆写效果**未真机验证**。

## Clash Mi / iOS

源码快照：`daef7be6c40d49a98a174a82c10599e163e71afd`。

[官方 README](https://github.com/KaringX/clashmi/blob/daef7be6c40d49a98a174a82c10599e163e71afd/README.md)明确 Mihomo 内核及 iOS 分发。
[文件导入页面](https://github.com/KaringX/clashmi/blob/daef7be6c40d49a98a174a82c10599e163e71afd/lib/screens/add_profile_by_import_from_file_screen.dart)调用 ProfileManager.addLocal。
[profile_patch_manager.dart](https://github.com/KaringX/clashmi/blob/daef7be6c40d49a98a174a82c10599e163e71afd/lib/app/modules/profile_patch_manager.dart)支持 YAML/JS 补丁，JS 通过 flutter_js getJavascriptRuntime，对原配置 JSON 调用 main，接受对象结果并写成 YAML。
[vpn_service.dart](https://github.com/KaringX/clashmi/blob/daef7be6c40d49a98a174a82c10599e163e71afd/lib/app/local_services/vpn_service.dart)先生成配置，选择 JS 补丁后获得派生路径，再设置最终补丁路径交给服务。这个顺序不同于 Verge，也不证明之后的 App 核心处理不会回写字段。

使用 adapters/clashmi.js 为 JS 类型配置补丁，或导入合成 YAML。不依赖其 YAML patch 的特殊 overwrite 语义。脚本返回普通 JSON 对象，没有客户端专有 API；其产物经过 Mihomo -t 检查，**未在 iOS 的 flutter_js 引擎/App/VPN 上运行**。其他 iOS App 若未核实 Mihomo 和导入/补丁机制，不声明兼容。

## 共有字段与更新

[Mihomo DNS 文档](https://wiki.metacubex.one/config/dns/)与 [Rule Providers 文档](https://wiki.metacubex.one/config/rule-providers/)是内核字段依据。四个实际下载文件使用 YAML payload，domain/ipcidr 对应行为、yaml 格式、相对 .yaml 缓存、GLOBAL 下载出口、604800 秒间隔经过真实内核加载/刷新。不同 App 会重写 path；不写死家庭路由器、机场节点名或代理端口。

DNS 上游选择、DNS 上游连接出口、网站流量出口、系统 DNS 接管是四层。移动端 system 解析受 VPN/网络影响，不能保证 mDNS、Private DNS 或应用自带 DNS 全部受本项目控制。默认国际 DoH 的 #RULES 仍尊重订阅，不保证强制代理；没有可用代理时不会凭空创建出口。原有订阅指定的监听地址、App 追加的系统 DNS 或后续 override 均需在最终配置中核对。
