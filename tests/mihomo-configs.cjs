// Offline isolated core checks. Provider caches use small deterministic fixtures.
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const yaml=require('js-yaml');
const core=process.argv[2];
if(!core) throw new Error('Usage: node tests/mihomo-configs.cjs /path/to/mihomo');
const root=path.resolve(__dirname,'..');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'hmxx-core-configs-'));
const fixtures=[{}, {rules:['DOMAIN,google.com,DIRECT']},
  {proxies:[{name:'FixtureOnly',type:'http',server:'127.0.0.1',port:1080}],
    'proxy-providers':{untouched:{type:'inline',payload:[{name:'FixtureProvider',type:'socks5',server:'127.0.0.1',port:1081}]}},
    'proxy-groups':[{name:'Main',type:'select',proxies:['FixtureOnly']},{name:'Media',type:'select',proxies:['Main','DIRECT']}],
    rules:['DOMAIN-SUFFIX,youtube.com,Media','DOMAIN-SUFFIX,google.com,Main','MATCH,Main']},
  {'rule-providers':{'hmxx-cn-direct':{type:'inline',behavior:'domain',payload:['+.custom.org']}},rules:['RULE-SET,hmxx-cn-direct,DIRECT','MATCH,DIRECT']}];
const artifacts=['global-script.js','adapters/flclash.js','adapters/clashmi.js','adapters/portable.js'];
const main=require('../adapters/portable.js');
const compose=vm.runInNewContext(fs.readFileSync(path.join(root,'tools/compose-browser.js'),'utf8')+'\ncomposeYaml;',{main});
let checks=0;
function check(config,label){
  config=JSON.parse(JSON.stringify(config));
  assert.ok(!config.dns.listen,'adapter must not create a DNS listener');
  assert.equal(config.tun,undefined);
  for(const provider of Object.values(config['rule-providers'])) {
    if(provider.type!=='http') continue;
    const cache=path.join(home,provider.path);
    fs.mkdirSync(path.dirname(cache),{recursive:true});
    fs.writeFileSync(cache,yaml.dump({payload:provider.behavior==='ipcidr'?['223.5.5.0/24']:['+.fixture.org']}));
  }
  const file=path.join(home,'config.yaml');
  fs.writeFileSync(file,yaml.dump(config),{mode:0o600});
  const result=execFileSync(core,['-t','-d',home,'-f',file],{encoding:'utf8',timeout:20000});
  if(!result.includes('successful')) throw new Error('Unexpected core validation result for '+label);
  checks++;
}
try{
  for(const artifact of artifacts) for(const [index,fixture] of fixtures.entries()){
    let input=JSON.parse(JSON.stringify(fixture));
    if(artifact==='global-script.js') input={...input,...yaml.load(fs.readFileSync(path.join(root,'global-merge.yaml'),'utf8'))};
    const config=vm.runInNewContext(fs.readFileSync(path.join(root,artifact),'utf8')+'\nmain(input);',{input},{timeout:1000});
    check(config,artifact+' '+index);
  }
  for(const [index,fixture] of fixtures.entries()) check(yaml.load(compose(yaml.dump(fixture),'generic',yaml)),'composed YAML '+index);
  console.log(JSON.stringify({core:execFileSync(core,['-v'],{encoding:'utf8'}).trim(),isolated_config_checks:checks,
    cases:['empty/no nodes','no MATCH','multiple groups + unchanged proxy-providers','provider collision'],
    offline_fixture_caches:true},null,2));
}finally{fs.rmSync(home,{recursive:true,force:true});}
