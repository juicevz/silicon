import { expect, type Page } from "@playwright/test";

/** Test-only adapter. Never sends a transaction or connects a real wallet. */
export async function mockWallet(page: Page, address: string) {
  await page.route(/\/(src\/wallet-runtime\.tsx|assets\/wallet-runtime-[^/]+\.js)(\?.*)?$/, async route => {
    const runtime = `let __siliconTestHandled=0;function __SiliconTestWalletRuntime({request,success}){
      if(request>__siliconTestHandled){__siliconTestHandled=request;queueMicrotask(()=>success('${address}',async()=>({request:async({method})=>{
        if(method==='eth_accounts')return ['${address}'];
        if(method==='eth_chainId')return '0x1237';
        if(method==='personal_sign')return '0x'+'a'.repeat(130);
        throw new Error('Unexpected wallet method '+method);
      }})));}return null;}`;
    if (route.request().url().includes("/assets/")) {
      const source = await (await route.fetch()).text();
      const namespace = /(__proto__:null,default:)[\w$]+(?=\})/;
      expect(source).toMatch(namespace);
      // Rollup may share ordinary viem helpers with this chunk. Preserve every
      // real export and replace only the lazy React wallet entry in its namespace.
      await route.fulfill({ contentType: "text/javascript", body: source.replace(namespace, "$1__SiliconTestWalletRuntime") + "\n" + runtime });
    } else {
      await route.fulfill({ contentType: "text/javascript", body: runtime + "\nexport default __SiliconTestWalletRuntime;" });
    }
  });
}
