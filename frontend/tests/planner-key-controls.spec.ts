import { test, expect } from '@playwright/test';
test('planner arithmetic, validation, CSV and mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silicon:intro:v3','true'));
  await page.route('**/api/v1/rental-plan', async route => {
    const b=route.request().postDataJSON(), daily=2*b.machines*b.gpus_per_machine*Number(b.hours_per_day);
    await route.fulfill({json:{...b,name:'H100',total_gpus:b.machines*b.gpus_per_machine,total_gpu_hours:String(b.machines*b.gpus_per_machine*Number(b.hours_per_day)*b.days),generated_at:new Date().toISOString(),reference_stale:false,excluded_stale_listings:0,assumptions:['Constant rates; hardware availability is separate.'],estimates:[{provider:'Fixture provider',provider_id:'test',instance:'8 GPU',region:'US',rate_usd_per_gpu_hour:'2',daily_usd:String(daily),monthly_usd:String(daily*30),total_usd:String(daily*b.days),source_time:new Date().toISOString(),source_url:'https://example.test/pricing',included_in_reference:false}]}});
  });
  await page.goto('/terminal/planner?asset=h100-sxm&machines=2&gpus=8&hours=6&days=7');
  await expect(page.locator('.rental-totals')).toContainText('$192.00');
  await expect(page.locator('.rental-totals')).toContainText('$1,344.00');
  await page.getByLabel('Planner machines').fill('0');
  await expect(page.getByRole('alert')).toContainText('whole machine');
  await expect(page.locator('.rental-totals')).toHaveCount(0);
  await page.getByLabel('Planner machines').fill('2');
  await expect(page.locator('.rental-totals')).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export CSV'}).click();
  expect((await download).suggestedFilename()).toBe('silicon-rental-plan.csv');
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByLabel('GPUs per machine')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('key caps, pause, resume and usage filter', async ({ page }) => {
  const address='0x'+'1'.repeat(40);
  const key={id:'key-demo',name:'Agent',prefix:'sil_demo',created_at:1700000000,last_used_at:null,revoked:false,paused:false,limit_usd:'0.05',used_usd:'0.01',pending_usd:'0.005',available_usd:'0.035',request_count:2};
  await page.route('**/api/v1/compute/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/account')) return route.fulfill({json:{address,available_usd:'0.5',used_usd:'0.01',pending_usd:'0.005',request_count:2,access:'ready'}});
    if(path.endsWith('/models')) return route.fulfill({json:{enabled:true,models:[]}});
    if(path.endsWith('/keys/key-demo')) { Object.assign(key,route.request().postDataJSON()); return route.fulfill({json:key}); }
    if(path.endsWith('/keys')) return route.fulfill({json:[key]});
    if(path.endsWith('/usage')) return route.fulfill({json:[]});
    return route.fallback();
  });
  await page.goto('/compute?view=api');
  await expect(page.getByRole('article',{name:'API key Agent'})).toBeVisible();
  await page.getByLabel('Lifetime cap for Agent').fill('0.02');
  await page.getByRole('button',{name:'Save cap'}).click();
  await expect.poll(()=>key.limit_usd).toBe('0.02');
  await page.getByRole('button',{name:'Pause Agent'}).click();
  await expect(page.getByRole('button',{name:'Resume Agent'})).toBeVisible();
  await page.getByRole('button',{name:'Resume Agent'}).click();
  await expect(page.getByRole('button',{name:'Pause Agent'})).toBeVisible();
  await page.getByRole('link',{name:'View usage'}).click();
  await expect(page.getByLabel('Usage API key')).toHaveValue('key-demo');
});
