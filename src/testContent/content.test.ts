import MockClass, { example, fn, instance } from "./content";
import defaultFn from "./defaultFn";
import { isMockified, override, partialOverride, restore } from "../mockify";
import { afterEach, expect, describe, it } from "@jest/globals";

describe("validate", () => {
  afterEach(() => {
    restore(example);
    restore(MockClass);
    restore(fn);
    restore(defaultFn);
  });

  it("should be mockified", () => {
    expect(isMockified(example)).toBe(true);
  });

  it("should be mockable", () => {
    expect(example.a).toBe(100);
    override(example, { ...example, a: 200 });
    expect(example.a).toBe(200);
  });

  it("should be partially mockable", () => {
    expect(example.a).toBe(100);
    partialOverride(example, { a: 200 });
    expect(example.a).toBe(200);
    expect(example.b).toBe(200);
  });

  it("should be restorable", () => {
    expect(example.a).toBe(100);
    override(example, { ...example, a: 200 });
    expect(example.a).toBe(200);
    restore(example);
    expect(example.a).toBe(100);
  });

  it("should be mockable with default export class", () => {
    const inst1 = new MockClass();
    expect(inst1).toBeInstanceOf(Set);
    expect(inst1.a).toBe(100);

    override(
      MockClass,
      class Alternative extends MockClass {
        a = 200;
        b = 300;
      },
    );

    const inst2 = new MockClass();
    expect(inst1.a).toBe(100);
    expect(inst2).toBeInstanceOf(MockClass);
    expect(inst2).toBeInstanceOf(Set);
    expect(inst2.a).toBe(200);
  });

  it("should be mockable with exported function", () => {
    expect(fn()).toBe(100);
    override(fn, () => 200);
    expect(fn()).toBe(200);
    restore(fn);
    expect(fn()).toBe(100);
  });

  it("should be mockable with default export function", () => {
    expect(defaultFn()).toBe(100);
    override(defaultFn, () => 200);
    expect(defaultFn()).toBe(200);
    restore(fn);
    expect(fn()).toBe(100);
  });

  it("should be mockable with class instance", () => {
    expect(instance.a).toBe(100);
    partialOverride(instance, { a: 200 });
    expect(instance.a).toBe(200);
    restore(instance);
    expect(instance.a).toBe(100);
  });
});
