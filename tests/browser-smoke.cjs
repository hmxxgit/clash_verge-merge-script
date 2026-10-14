// Optional real-browser test: requires Playwright and a locally installed Chrome.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),yaml=require('js-yaml');
(async()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'hmxx-browser-test-'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const failures=[],network=[];
    page.on('pageerror',e=>failures.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    await page.goto('file://'+path.resolve(__dirname,'../tools/portable.html'));
    await page.locator('#source').fill('rules: [MATCH,DIRECT]');
    await page.locator('#generate').click();
    assert.match(await page.locator('#status').textContent(),/CMFA/);
    const fixture={proxies:[{name:'FixtureOnly',type:'http',server:'127.0.0.1',port:1080}],
      'proxy-groups':[{name:'Original',type:'select',proxies:['FixtureOnly']}],rules:['MATCH,Original']};
    const source=path.join(home,'source.yaml');fs.writeFileSync(source,yaml.dump(fixture));
    await page.locator('#file').setInputFiles(source);
    await page.locator('#generate').click();
    const downloadPromise=page.waitForEvent('download');
    await page.locator('#download').click();
    const download=await downloadPromise,file=path.join(home,'output.yaml');
    await download.saveAs(file);
    const output=yaml.load(fs.readFileSync(file,'utf8'));
    assert.deepEqual(output.proxies,fixture.proxies);
    assert.deepEqual(output['proxy-groups'],fixture['proxy-groups']);
    assert.equal(output.rules.at(-1),'MATCH,Original');
    assert.equal(output.dns.listen,undefined);
    await page.locator('#source').fill('secret: [FIXTURE-SOURCE-MUST-NOT-APPEAR');
    assert.ok(await page.locator('#download').isHidden());
    await page.locator('#generate').click();
    assert.ok(!(await page.locator('#status').textContent()).includes('FIXTURE-SOURCE-MUST-NOT-APPEAR'));
    await page.locator('#clear').click();
    assert.equal(await page.locator('#source').inputValue(),'');
    assert.ok(await page.locator('#download').isHidden());
    assert.deepEqual(failures,[]);assert.deepEqual(network,[]);
    console.log('Chrome offline UI: file import, mobile viewport, validation, YAML download and clear passed; no HTTP requests.');
  }finally{await browser.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
