# 验证记录

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

这个验证脚本只使用隔离的临时配置，代理参数只用来下载规则集。内核初始化大型域名规则集是异步过程，测试会等待加载完成再检查条目数。
