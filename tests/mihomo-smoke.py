"""Validate the generated config and real upstream rule data in an isolated core.

Requires Python 3, curl, Node.js, Ruby (standard YAML library), and Mihomo.
Does not edit any Clash app files.
Example: python3 tests/mihomo-smoke.py --core /path/to/mihomo --node /path/to/node
"""
import argparse
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
        'rules': ['MATCH,smoke-proxy', 'RULE-SET,hmxx-cn-direct,DIRECT']
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
        return name, target.stat().st_size

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
                'core_version': api('/version'), 'upstream_bytes': downloads,
                'rule_counts': {name: final[name]['ruleCount'] for name in config['rule-providers']},
                'first_rule': live_rules[0], 'last_rule': live_rules[-1],
                'forced_online_refresh': 'all four returned success',
                'real_dns_answers': dns_results,
                'fake_ip_udp': fake, 'excluded_domain_real_ip_udp': excluded
            }
            print(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            core.terminate()
            try:
                core.wait(timeout=8)
            except subprocess.TimeoutExpired:
                core.kill()
                core.wait()
