"__do_not_mockify__";
const implementation = Symbol("implementation");
const partial = Symbol("partial");
const defaultImplementation = Symbol("defaultImplementation");

export const mockify = <T extends object>(obj: T): T => {
  if (!obj || (typeof obj !== "function" && typeof obj !== "object")) {
    return obj;
  }
  // previously mockified
  if (defaultImplementation in obj) return obj;

  let overridingImplementation: T | undefined;
  let isPartial = false;
  return new Proxy(obj, {
    // basic:
    get(target, propertyKey, receiver) {
      if (propertyKey === defaultImplementation) return obj;
      if (propertyKey === implementation)
        return overridingImplementation ?? target;

      let value = (overridingImplementation as any)?.[propertyKey];
      let t = overridingImplementation;
      if (
        !overridingImplementation ||
        (isPartial && typeof value === "undefined")
      ) {
        value = (target as any)[propertyKey];
        t = target;
      }

      // cannot use Reflect.get, because it doesn't work with private properties
      if (value instanceof Function) {
        return function (this: unknown, ...args: unknown[]) {
          return value.apply(this === receiver ? t : this, args);
        };
      }

      return value;
    },
    has(target, propertyKey) {
      if (
        propertyKey === implementation ||
        propertyKey === defaultImplementation ||
        propertyKey === partial
      ) {
        return true;
      }
      const t = overridingImplementation ?? target;
      const value = Reflect.has(t, propertyKey);
      if (isPartial && overridingImplementation) {
        return value || Reflect.has(target, propertyKey);
      }
      return value;
    },
    set(target, propertyKey, newValue, receiver) {
      if (propertyKey === implementation) {
        overridingImplementation = newValue;
        return true;
      }
      if (propertyKey === partial) {
        isPartial = newValue;
        return true;
      }
      if (propertyKey === defaultImplementation) {
        throw new Error("Cannot override default implementation");
      }
      const t = overridingImplementation ?? target;
      return Reflect.set(
        t,
        propertyKey,
        newValue,
        overridingImplementation ?? receiver,
      );
    },

    // properties:
    defineProperty(target, propertyKey, attributes) {
      const t = overridingImplementation ?? target;
      return Reflect.defineProperty(t, propertyKey, attributes);
    },
    deleteProperty(target, propertyKey) {
      const t = overridingImplementation ?? target;
      return Reflect.deleteProperty(t, propertyKey);
    },
    getOwnPropertyDescriptor(target, propertyKey) {
      const t = overridingImplementation ?? target;
      const value = Reflect.getOwnPropertyDescriptor(t, propertyKey);
      if (isPartial && overridingImplementation) {
        return value ?? Reflect.getOwnPropertyDescriptor(target, propertyKey);
      }
      return value;
    },
    ownKeys(target) {
      const t = overridingImplementation ?? target;
      const value = Reflect.ownKeys(t);
      if (isPartial && overridingImplementation) {
        return Array.from(new Set([...value, ...Reflect.ownKeys(target)]));
      }
      return value;
    },

    // function:
    apply(target, thisArg, argArray) {
      const t = (overridingImplementation ?? target) as (
        ...args: unknown[]
      ) => unknown;
      return Reflect.apply(t, thisArg, argArray);
    },

    // class/object/prototype:
    construct(target, argArray, newTarget) {
      const t = (overridingImplementation ?? target) as new (
        ...args: unknown[]
      ) => object;

      return Reflect.construct(t, argArray, newTarget ? t : undefined);
    },
    getPrototypeOf(target) {
      const t = overridingImplementation ?? target;
      return Reflect.getPrototypeOf(t);
    },
    isExtensible(target) {
      const t = overridingImplementation ?? target;
      return Reflect.isExtensible(t);
    },
    preventExtensions(target) {
      const t = overridingImplementation ?? target;
      return Reflect.preventExtensions(t);
    },
    setPrototypeOf(target, v) {
      const t = overridingImplementation ?? target;
      return Reflect.setPrototypeOf(t, v);
    },
  });
};

export const isMockified = (
  obj: object | null,
): obj is {
  [implementation]?: typeof obj;
  [defaultImplementation]: typeof obj;
  [partial]: boolean;
} => Boolean(obj && defaultImplementation in obj);

export function override<T extends object>(obj: T, impl: T): void {
  if (isMockified(obj)) {
    const proto = Reflect.getPrototypeOf(impl);
    if (proto === obj && isMockified(proto)) {
      Reflect.setPrototypeOf(impl, proto[defaultImplementation]);
    }
    obj[partial] = false;
    obj[implementation] = impl;
    return;
  }
  throw new Error("Cannot override non-mockified object");
}

export function partialOverride<T extends object>(
  obj: T,
  impl: T extends { prototype: unknown } & (new (...args: unknown[]) => unknown)
    ? { prototype: Partial<T["prototype"]> }
    : Partial<T>,
): void {
  if (isMockified(obj)) {
    const proto = Reflect.getPrototypeOf(impl);
    if (proto === obj && isMockified(proto)) {
      Reflect.setPrototypeOf(impl, proto[defaultImplementation]);
    }
    obj[partial] = true;
    obj[implementation] = impl;
    return;
  }
  throw new Error("Cannot override non-mockified object");
}

export function restore<T extends object>(obj: T): void {
  if (isMockified(obj)) {
    obj[partial] = false;
    obj[implementation] = undefined;
    return;
  }
  throw new Error("Cannot restore non-mockified object");
}

// const source = { x: 123 };
// const obj = mockify(source);
// partialOverride(obj, { x: 456 });
// obj.x; //=
// obj.x = 555;
// obj.x; //=
// source.x; //=

// const fn = mockify((): number => 123);
// fn(); //=

// override(fn, () => 555);
// fn(); //=

// const x = mockify(new Map<string, number>());

// console.log(x instanceof Map);
// x.set("yo", 123);
// x.get("yo"); //=
// x.size; //=

// override(x, new Map<string, number>());
// x.size; //=

// restore(x);
// x.size; //=

// partialOverride(x, { get: () => 555 });
// x.set("xyz", 123);
// x.size; //=
// x.get("xyz"); //=

// restore(x);
// x.get("xyz"); //=

// const y = mockify(Map);
// const y1 = new y();
// console.log(y1 instanceof Map);
// y1.set("yo", 123);
// y1.get("yo"); //=

// override(
//   y,
//   class CustomMap {
//     constructor() {
//       console.log("yo");
//       console.log(new.target);
//     }
//   },
// );

// const y2 = new y();
// console.log(y2 instanceof Map);

// restore(y);

// const CustomClass = mockify(
//   class CustomClass extends Map {
//     doY() {
//       console.log("y");
//     }
//     doX() {
//       console.log("x");
//     }
//   },
// );

// override(
//   CustomClass,
//   class PartialCustomClass extends CustomClass {
//     doY() {
//       console.log("mock");
//     }
//   },
// );

// const customClass = new CustomClass();
// customClass.doY();
// customClass.doX();
// customClass.set("yo", 123);
