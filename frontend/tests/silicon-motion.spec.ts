import { test, expect } from "@playwright/test";
import { advanceSpring, type Spring } from "../src/siliconMotion";

function sample(rate: number) {
  const spring: Spring = {value:0,velocity:0};
  for (let frame=0; frame<rate/2; frame++) advanceSpring(spring,1,1/rate);
  return spring;
}
test("silicon spring tracks equally at 60, 120 and 144 Hz", () => {
  const reference=sample(60);
  expect(reference.value).toBeGreaterThan(.99);
  for (const rate of [120,144]) {
    expect(sample(rate).value).toBeCloseTo(reference.value,12);
    expect(sample(rate).velocity).toBeCloseTo(reference.velocity,12);
  }
});
test("silicon spring remains bounded and settles after reversing direction", () => {
  const spring: Spring = {value:0,velocity:0};
  for (let frame=0; frame<180; frame++) {
    advanceSpring(spring,frame<45?1:-1,1/120);
    expect(spring.value).toBeGreaterThanOrEqual(-1);
    expect(spring.value).toBeLessThanOrEqual(1);
  }
  expect(spring.value).toBeCloseTo(-1,4);
});
test("silicon spring keeps an exact pose while time is paused", () => {
  const spring: Spring = {value:.35,velocity:2};
  advanceSpring(spring,1,0);
  expect(spring).toEqual({value:.35,velocity:2});
});
