import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', timeout:45000, fullyParallel:false, workers:1,
  use:{baseURL:process.env.SILICON_TEST_URL??'http://127.0.0.1:5286',headless:true,viewport:{width:1440,height:900},screenshot:'only-on-failure',trace:'retain-on-failure'},
  reporter:'list',
});
