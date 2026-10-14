// Shared by browser UI and Node CLI/tests. No network, storage or telemetry.
function composeYaml(text, target, parser) {
  if (typeof text !== 'string' || text.length > 5 * 1024 * 1024) {
    throw new Error('请选择不超过 5 MiB 的完整 Mihomo YAML 配置');
  }
  // YAML 1.2 core scalars + merge anchors; do not turn date-like strings into Date.
  const schema = parser.CORE_SCHEMA.withTags(parser.mergeTag);
  const input = parser.load(text, { schema });
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('需要完整 Mihomo YAML 对象；不接受 URI/base64 节点订阅');
  }
  if (target === 'cmfa' && !(Array.isArray(input.proxies) && input.proxies.length) &&
      !(input['proxy-providers'] && Object.keys(input['proxy-providers']).length)) {
    throw new Error('CMFA 源码拒绝没有 proxies/proxy-providers 的配置；本工具不会创建节点');
  }
  const result = main(input);
  return parser.dump(result, { schema, noRefs: true, lineWidth: -1, sortKeys: false });
}
if (typeof module !== 'undefined') module.exports = composeYaml;
if (typeof document !== 'undefined') {
  const input = document.getElementById('source');
  const status = document.getElementById('status');
  const download = document.getElementById('download');
  let objectUrl;
  function invalidate() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    download.hidden = true;
    download.removeAttribute('href');
    status.textContent = '尚未生成';
  }
  input.addEventListener('input', invalidate);
  document.getElementById('target').addEventListener('change', invalidate);
  document.getElementById('file').addEventListener('change', async event => {
    invalidate();
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { status.textContent = '文件超过 5 MiB'; return; }
    input.value = await file.text();
  });
  document.getElementById('generate').addEventListener('click', () => {
    invalidate();
    try {
      const output = composeYaml(input.value, document.getElementById('target').value, jsyaml);
      objectUrl = URL.createObjectURL(new Blob([output], { type: 'application/yaml;charset=utf-8' }));
      download.href = objectUrl;
      download.hidden = false;
      status.textContent = '已生成独立副本。请下载并作为新配置导入；原订阅未修改。';
    } catch (error) {
      // Parser errors can contain source excerpts with credentials: never render them.
      status.textContent = error.name === 'YAMLException' ? 'YAML 解析失败，请检查格式（为保护凭据不显示原文）' : error.message;
    }
  });
  document.getElementById('clear').addEventListener('click', () => {
    input.value = '';
    document.getElementById('file').value = '';
    invalidate();
  });
}
