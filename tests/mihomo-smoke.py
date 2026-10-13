"""Validate the generated config and real upstream rule data in an isolated core.

Requires Python 3, curl, Node.js, Ruby (standard YAML library), and Mihomo.
Does not edit any Clash app files.
Example: python3 tests/mihomo-smoke.py --core /path/to/mihomo --node /path/to/node
"""
import argparse
import hashlib
import threading
import http.server
import socketserver
import urllib.error
import concurrent.futures
import json
import pathlib
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument('--core', required=True)
parser.add_argument('--node', default='node')
parser.add_argument('--ruby', default='ruby', help='Ruby with its standard YAML library')
parser.add_argument('--proxy', default='http://127.0.0.1:7897')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

def controlled_checks(config, home, path, api, udp_a, mixed):
    """Real core with local upstreams: isolate routing/DNS/cache from public networks."""
    queries = {'domestic': [], 'foreign': []}
    class DNSHandler(socketserver.BaseRequestHandler):
        def handle(self):
            data, sock = self.request
            offset, labels = 12, []
            while data[offset]:
                length = data[offset]
                labels.append(data[offset+1:offset+1+length].decode())
                offset += length+1
            domain = '.'.join(labels)
            queries[self.server.kind].append(domain)
            end = offset+5
            qtype = struct.unpack('!H', data[offset+1:offset+3])[0]
            count = 1 if qtype == 1 else 0
            header = data[:2] + struct.pack('!5H', 0x8180, 1, count, 0, 0)
            answer = b'' if not count else b'\xc0\x0c'+struct.pack('!2HIH', 1, 1, 60, 4)+socket.inet_aton('223.5.5.5' if domain == 'overseas.validation.hmxxgit.org' else self.server.address)
            sock.sendto(header+data[12:end]+answer, self.client_address)
    dns_servers = []
    for kind, address in [('domestic', '127.0.0.1'), ('foreign', '127.0.0.2')]:
        server = socketserver.ThreadingUDPServer(('127.0.0.1', 0), DNSHandler)
        server.kind, server.address = kind, address
        threading.Thread(target=server.serve_forever, daemon=True).start()
        dns_servers.append(server)
    state = {'failure': None, 'proxy_requests': []}
    release = threading.Event()
    class HTTPHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_CONNECT(self):
            state['proxy_requests'].append(self.path)
            self.send_response(200); self.end_headers()
            while self.rfile.readline() not in (b'\r\n', b''): pass
            self.wfile.write(b'HTTP/1.1 200 OK\r\nContent-Length: 14\r\nConnection: close\r\n\r\nisolated-proxy')
            self.wfile.flush()
            self.close_connection = True
        def do_GET(self):
            if self.path == '/hold':
                self.send_response(200); self.send_header('Content-Length', '6'); self.end_headers()
                self.wfile.write(b'abc'); self.wfile.flush()
                release.wait(20)
                self.wfile.write(b'def'); self.wfile.flush()
                return
            if self.path.startswith('http://') or self.path == '/check':
                state['proxy_requests'].append(self.path)
                body = b'isolated-proxy'
            elif state['failure'] == 'http':
                self.send_error(503); return
            elif state['failure'] == 'parse':
                body = b'payload: [invalid yaml'
            else:
                name = self.path.lstrip('/')
                provider = config['rule-providers'].get(name)
                if not provider: self.send_error(404); return
                body = (home/provider['path']).read_bytes()
            self.send_response(200); self.send_header('Content-Length', str(len(body))); self.end_headers()
            self.wfile.write(body)
    http_server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), HTTPHandler)
    threading.Thread(target=http_server.serve_forever, daemon=True).start()
    held = None
    try:
        fixture = json.loads(json.dumps(config))
        local_dns = ['127.0.0.1:'+str(s.server_address[1])+'#DIRECT' for s in dns_servers]
        dns = fixture['dns']
        dns['nameserver'] = [local_dns[1]]
        dns['default-nameserver'] = [local_dns[0]]
        dns['proxy-server-nameserver'] = [local_dns[0]]
        dns['direct-nameserver'] = [local_dns[0]]
        for key, value in dns['nameserver-policy'].items():
            if isinstance(value, list): dns['nameserver-policy'][key] = [local_dns[0]]
        fixture['proxies'].append({'name': 'controlled-proxy', 'type': 'http',
            'server': 'node.fixture.test', 'port': http_server.server_port})
        fixture['proxy-groups'][0]['proxies'].append('controlled-proxy')
        fixture['hosts'] = {'overseas.validation.hmxxgit.org': '223.5.5.5'}
        # Only test-fixture URLs/resolvers/nodes change; production files stay untouched.
        for name, provider in fixture['rule-providers'].items():
            provider['url'] = 'http://127.0.0.1:'+str(http_server.server_port)+'/'+name
            provider['proxy'] = 'DIRECT'
        path.write_text(json.dumps(fixture))
        subprocess.run([args.core, '-t', '-d', str(home), '-f', str(path)], check=True, capture_output=True)
        api('/configs?force=true', 'PUT', {'path': str(path)})
        api('/proxies/smoke-proxy', 'PUT', {'name': 'controlled-proxy'})
        for _ in range(60):
            counts = api('/providers/rules')['providers']
            if all(counts[n]['ruleCount'] > 0 for n in fixture['rule-providers']): break
            time.sleep(0.2)
        else: raise RuntimeError('Controlled providers failed to initialize')
        for name in fixture['rule-providers']: api('/providers/rules/'+name, 'PUT')
        payload = json.loads(subprocess.check_output([args.ruby, '-ryaml', '-rjson', '-e',
            'puts JSON.generate(YAML.load_file(ARGV[0])["payload"])',
            str(home/fixture['rule-providers']['hmxx-cn-direct']['path'])]))
        # Pick an upstream suffix not already covered by the hand-written DNS policies.
        suffixes = [k[2:] for k in dns['nameserver-policy'] if k.startswith('+.')]
        probe = next('dns-check.'+entry[2:] for entry in payload if entry.startswith('+.')
            and '*' not in entry and not any(entry[2:] == d or entry[2:].endswith('.'+d) for d in suffixes))
        dns_answers = {}
        for domain, expected in [(probe,'127.0.0.1'), ('dns-check.doubao.com','127.0.0.1'),
                ('dns-check.qq.com','127.0.0.1'), ('dns-check.bilibili.com','127.0.0.1'),
                ('foreign-policy.fixture.test','127.0.0.2'), ('keyword-doubao.fixture.test','127.0.0.2')]:
            answer = api('/dns/query?name='+domain+'&type=A')
            addresses = [a['data'] for a in answer.get('Answer', []) if a.get('type') == 1]
            if addresses != [expected]: raise RuntimeError('Wrong DNS policy for '+domain+': '+str(addresses))
            dns_answers[domain] = addresses
        filter_answers = {}
        # Local-name filtering is tested with controlled resolvers here, not macOS mDNS.
        for domain in ['captive.apple.com', 'www.msftconnecttest.com', 'dns.msftncsi.com',
                'time.asia.apple.com', 'time.windows.com', 'pool.ntp.org',
                'localhost.ptlogin2.qq.com', 'localhost.work.weixin.qq.com', 'multimedia.nt.qq.com']:
            addresses = udp_a(domain)
            if not addresses or any(ip.startswith('198.18.') for ip in addresses):
                raise RuntimeError('Fake-IP exclusion failed for '+domain)
            filter_answers[domain] = addresses
        resolved = api('/dns/query?name=overseas.validation.hmxxgit.org&type=A')
        if [a['data'] for a in resolved.get('Answer', []) if a.get('type') == 1] != ['223.5.5.5']:
            raise RuntimeError('Overseas fixture did not resolve to a mainland IP')
        # A real website request: even when its IP is mainland, explicit proxy DOMAIN wins.
        response = subprocess.check_output(['curl','-sS','--noproxy','','--proxy',
            'http://127.0.0.1:'+str(mixed),'--max-time','10','http://overseas.validation.hmxxgit.org/check'])
        if response != b'isolated-proxy': raise RuntimeError('Overseas routing failed: '+repr(response[:200])+'\n'+(home/'core.log').read_text()[-2500:])
        if 'node.fixture.test' not in queries['domestic'] or 'node.fixture.test' in queries['foreign']:
            raise RuntimeError('Proxy server hostname used the wrong DNS path')
        # Unmatched literal mainland IP must hit the supplemental provider, not MATCH.
        subprocess.run(['curl','-sS','--noproxy','','--proxy','http://127.0.0.1:'+str(mixed),
            '--max-time','2','http://223.5.5.6:9/'], capture_output=True)
        log = (home/'core.log').read_text()
        if 'match RuleSet/hmxx-cn-cidr' not in log and 'match RuleSet(hmxx-cn-cidr)' not in log:
            raise RuntimeError('Mainland IP did not hit supplemental CIDR rule')
        # Keep one existing DIRECT stream open while all four providers fail updates.
        held = socket.create_connection(('127.0.0.1', mixed), timeout=10)
        stream = held.makefile('rb')
        held.sendall(b'\x05\x01\x00')
        if stream.read(2) != b'\x05\x00': raise RuntimeError('SOCKS greeting failed')
        held.sendall(b'\x05\x01\x00\x01'+socket.inet_aton('127.0.0.1')+struct.pack('!H', http_server.server_port))
        handshake = stream.read(10)
        if len(handshake) != 10 or handshake[1] != 0: raise RuntimeError('SOCKS connection failed')
        held.sendall(b'GET /hold HTTP/1.1\r\nHost: localhost\r\n\r\n')
        while stream.readline() not in (b'\r\n', b''): pass
        if stream.read(3) != b'abc': raise RuntimeError('Hold connection failed: '+(home/'core.log').read_text()[-2000:])
        failed = {}
        for failure in ['http', 'parse']:
            state['failure'] = failure
            for name, provider in fixture['rule-providers'].items():
                cached = (home/provider['path']).read_bytes()
                before = api('/providers/rules')['providers'][name]
                try:
                    api('/providers/rules/'+name, 'PUT')
                except urllib.error.HTTPError:
                    pass
                else: raise RuntimeError(name+': invalid update unexpectedly succeeded')
                after = api('/providers/rules')['providers'][name]
                if before['ruleCount'] != after['ruleCount'] or cached != (home/provider['path']).read_bytes():
                    raise RuntimeError(name+': failed update changed cache/rules')
            failed[failure] = 'all four retain cache bytes and loaded rule counts'
        release.set()
        if stream.read(3) != b'def': raise RuntimeError('Existing stream interrupted by failed update')
        return {'dns_policy_answers': dns_answers, 'upstream_policy_probe': probe,
            'fake_ip_filter_answers': filter_answers, 'node_hostname_domestic_dns': True,
            'overseas_domain_with_mainland_ip': 'subscription proxy retained',
            'unmatched_mainland_ip': 'hmxx-cn-cidr DIRECT', 'failed_updates': failed,
            'existing_connection_survived': True}
    finally:
        release.set()
        if held: held.close()
        http_server.shutdown(); http_server.server_close()
        for server in dns_servers: server.shutdown(); server.server_close()

with tempfile.TemporaryDirectory(prefix='clash-cn-rules-smoke-') as temporary:
    home = pathlib.Path(temporary)
    mixed, controller = free_port(), free_port()
    hostport = urlparse(args.proxy)
    fixture = {
        'mixed-port': mixed, 'bind-address': '127.0.0.1', 'allow-lan': False,
        'mode': 'rule', 'ipv6': False, 'log-level': 'info',
        'external-controller': f'127.0.0.1:{controller}',
        'proxies': [{'name': 'smoke-upstream', 'type': 'http', 'server': hostport.hostname, 'port': hostport.port}],
        'proxy-groups': [{'name': 'smoke-proxy', 'type': 'select', 'proxies': ['smoke-upstream']}],
        'rules': ['DOMAIN,overseas.validation.hmxxgit.org,smoke-proxy', 'MATCH,smoke-proxy']
    }
    merge = json.loads(subprocess.check_output([
        args.ruby, '-r', 'yaml', '-r', 'json', '-e',
        'puts JSON.generate(YAML.load_file(ARGV[0]))', str(root/'global-merge.yaml')]))
    fixture.update(merge)
    # Override only the test DNS port; use all other committed DNS settings.
    dns_port = free_port()
    fixture['dns']['listen'] = f'127.0.0.1:{dns_port}'
    js = "const fs=require('fs');eval(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(JSON.stringify(main(JSON.parse(fs.readFileSync(0,'utf8')),'smoke')));"
    config = json.loads(subprocess.check_output([args.node, '-e', js, str(root/'global-script.js')], input=json.dumps(fixture).encode()))

    def download(item):
        name, provider = item
        target = home/provider['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(['curl', '-sS', '-L', '--proxy', args.proxy, '--max-time', '45', '-o', str(target), '-w', '%{http_code}', provider['url']], capture_output=True, text=True)
        if result.returncode or result.stdout != '200':
            raise RuntimeError(f'{name}: upstream download failed (HTTP {result.stdout})')
        content = target.read_bytes()
        parsed = json.loads(subprocess.check_output([args.ruby, '-ryaml', '-rjson', '-e',
            'puts JSON.generate(YAML.load_file(ARGV[0]))', str(target)]))
        if not isinstance(parsed.get('payload'), list) or not parsed['payload']:
            raise RuntimeError(name + ': not YAML payload data')
        return name, {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
                      'yaml_payload_entries': len(parsed['payload'])}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        downloads = dict(pool.map(download, config['rule-providers'].items()))
    path = home/'config.json'
    path.write_text(json.dumps(config, ensure_ascii=False))
    path.chmod(0o600)
    subprocess.run([args.core, '-t', '-d', str(home), '-f', str(path)], check=True, capture_output=True)

    def api(route, method='GET', payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(f'http://127.0.0.1:{controller}'+route, data=data, method=method, headers={'Content-Type': 'application/json'})
        # Bypass host proxy environment variables for the loopback-only controller.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=45) as response:
            content = response.read()
            return json.loads(content) if content else None

    with (home/'core.log').open('w') as output:
        core = subprocess.Popen([args.core, '-d', str(home), '-f', str(path)], stdout=output, stderr=output)
        try:
            for attempt in range(30):
                if core.poll() is not None:
                    raise RuntimeError((home/'core.log').read_text()[-2000:])
                try:
                    api('/version')
                    break
                except OSError:
                    time.sleep(0.2)
            else:
                raise RuntimeError('Core controller did not become available')
            api('/proxies/GLOBAL', 'PUT', {'name': 'smoke-upstream'})
            # Large domain sets initialize asynchronously after the controller starts.
            for attempt in range(60):
                providers = api('/providers/rules')['providers']
                if all(providers[name]['ruleCount'] > 0 for name in config['rule-providers']):
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError('Rule providers did not load: '+(home/'core.log').read_text()[-2000:])
            for name in config['rule-providers']:
                if providers[name]['ruleCount'] != downloads[name]['yaml_payload_entries']:
                    raise RuntimeError(name+': loaded count differs from raw YAML payload')
                api('/providers/rules/'+name, 'PUT')
            live_rules = api('/rules')['rules']
            if live_rules[0]['payload'] != 'hmxx-cn-private' or live_rules[-1]['type'] != 'Match':
                raise RuntimeError('Managed rules were not prepended before MATCH')
            final = api('/providers/rules')['providers']
            dns_results = {}
            for domain in ['www.baidu.com', 'www.google.com']:
                answer = api('/dns/query?name='+domain+'&type=A')
                addresses = [a['data'] for a in answer.get('Answer', []) if a.get('type') == 1]
                if answer.get('Status') != 0 or not addresses:
                    raise RuntimeError('DNS query failed for '+domain+': '+json.dumps(answer))
                dns_results[domain] = addresses

            # A real UDP query exercises Fake-IP, unlike the real-IP DNS API.
            def udp_a(domain):
                labels = b''.join(bytes([len(p)])+p.encode() for p in domain.split('.'))+b'\0'
                query = struct.pack('!6H', 0x484d, 0x0100, 1, 0, 0, 0)+labels+struct.pack('!2H', 1, 1)
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                    udp.settimeout(20)
                    udp.sendto(query, ('127.0.0.1', dns_port))
                    data = udp.recv(4096)
                _, flags, qcount, acount, _, _ = struct.unpack('!6H', data[:12])
                if flags & 15: raise RuntimeError('UDP DNS error for '+domain)
                def skip_name(offset):
                    while data[offset]:
                        if data[offset] & 0xc0 == 0xc0: return offset+2
                        offset += 1+data[offset]
                    return offset+1
                offset = 12
                for _ in range(qcount): offset = skip_name(offset)+4
                found = []
                for _ in range(acount):
                    offset = skip_name(offset)
                    rtype, _, _, size = struct.unpack('!2HIH', data[offset:offset+10])
                    offset += 10
                    if rtype == 1 and size == 4: found.append(socket.inet_ntoa(data[offset:offset+size]))
                    offset += size
                return found
            fake = udp_a('dns-smoke.invalid')
            excluded = udp_a('captive.apple.com')
            if not fake or not all(ip.startswith('198.18.') for ip in fake):
                raise RuntimeError('Fake-IP mapping was not returned')
            if not excluded or any(ip.startswith('198.18.') for ip in excluded):
                raise RuntimeError('Fake-IP excluded domain did not return a real address')
            report = {
                'core_version': api('/version'), 'upstream_data': downloads,
                'rule_counts': {name: final[name]['ruleCount'] for name in config['rule-providers']},
                'first_rule': live_rules[0], 'last_rule': live_rules[-1],
                'forced_online_refresh': 'all four returned success',
                'real_dns_answers': dns_results,
                'fake_ip_udp': fake, 'excluded_domain_real_ip_udp': excluded
            }
            report['controlled_checks'] = controlled_checks(config, home, path, api, udp_a, mixed)
            print(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            core.terminate()
            try:
                core.wait(timeout=8)
            except subprocess.TimeoutExpired:
                core.kill()
                core.wait()
