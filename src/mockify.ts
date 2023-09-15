"use __do_not_mockify__";
const dispose: typeof Symbol.dispose =
  Symbol.dispose ?? Symbol("Symbol.dispose");

const implementation = Symbol("implementation");
const partial = Symbol("partial");
const propertyDescriptorSource = Symbol("propertyDescriptorSource");
const defaultImplementation = Symbol("defaultImplementation");

export const mockify = <T extends object>(obj: T): T => {
  if (!obj || (typeof obj !== "function" && typeof obj !== "object")) {
    return obj;
  }
  // previously mockified
  if (defaultImplementation in obj) return obj;

  let overridingImplementation: T | undefined;
  let isPartial = false;
  let descriptorSource: "default" | "override" = "override";
  return new Proxy(obj, {
    // basic:
    get(target, propertyKey, receiver) {
      if (propertyKey === defaultImplementation) return obj;
      if (propertyKey === implementation)
        return overridingImplementation ?? target;
      if (propertyKey === partial) return isPartial;
      if (propertyKey === descriptorSource) return descriptorSource;

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
        propertyKey === partial ||
        propertyKey === propertyDescriptorSource
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
      if (propertyKey === propertyDescriptorSource) {
        descriptorSource = newValue;
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
      const t =
        descriptorSource === "override"
          ? overridingImplementation ?? target
          : target;
      const value = Reflect.getOwnPropertyDescriptor(t, propertyKey);
      if (isPartial && overridingImplementation && t !== target) {
        return value ?? Reflect.getOwnPropertyDescriptor(target, propertyKey);
      }
      return value;
    },
    ownKeys(target) {
      const t =
        descriptorSource === "override"
          ? overridingImplementation ?? target
          : target;
      const value = Reflect.ownKeys(t);
      if (isPartial && overridingImplementation && t !== target) {
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
  [propertyDescriptorSource]: "default" | "override";
  [defaultImplementation]: typeof obj;
  [partial]: boolean;
} => Boolean(obj && defaultImplementation in obj);

const nothingToDispose = { [dispose]() {} };

export const setPropertyDescriptorSource = <T extends object>(
  obj: T,
  source: "default" | "override",
) => {
  if (isMockified(obj)) {
    obj[propertyDescriptorSource] = source;
  }
};

/**
 * Override an object/function, replacing it completely with the provided implementation.
 * This means any existing properties should be provided in the implementation.
 * Note that this will replace any previous overrides (partial or not).
 */
export function override<T extends object>(
  source: T,
  replacement: T,
  throwIfNotMockified = true,
): { [dispose](): void } {
  if (isMockified(source)) {
    correctExtendedClass(replacement, source);
    source[implementation] = replacement;
    source[partial] = false;

    return {
      // support disposing with the `using` keyword
      [dispose]() {
        restore(source);
      },
    };
  }
  if (throwIfNotMockified) {
    throw new Error("Cannot override non-mockified object");
  }
  return nothingToDispose;
}

/**
 * Partially override an object, only shadowing the properties that are defined in the implementation.
 * Note that this will replace any previous overrides (partial or not).
 * All writes will be done to the implementation, so the original object will not be modified.
 *
 * If overriding a class, make sure to have the overriding class extend the original class.
 */
export function partialOverride<T extends object>(
  source: T,
  partialReplacement: T extends { prototype: unknown } & (new (
    ...args: unknown[]
  ) => unknown)
    ? { prototype: Partial<T["prototype"]> }
    : Partial<T>,
  throwIfNotMockified = true,
): { [dispose](): void } {
  if (isMockified(source)) {
    correctExtendedClass(partialReplacement, source);
    source[implementation] = partialReplacement;
    source[partial] = true;

    return {
      // support disposing with the `using` keyword
      [dispose]() {
        restore(source);
      },
    };
  }
  if (throwIfNotMockified) {
    throw new Error("Cannot override non-mockified object");
  }
  return nothingToDispose;
}

function correctExtendedClass(impl: object, obj: object) {
  const proto = Reflect.getPrototypeOf(impl);
  // correct the extends clause to be of the actual class, not its Proxy
  // to avoid recursive class extension
  if (proto && proto === obj && isMockified(proto)) {
    Reflect.setPrototypeOf(impl, proto[defaultImplementation]);
  }
}

export function restore<T extends object>(
  obj: T,
  throwIfNotMockified = true,
): void {
  if (isMockified(obj)) {
    obj[implementation] = undefined;
    obj[partial] = false;
    return;
  }
  if (throwIfNotMockified) {
    throw new Error("Cannot restore non-mockified object");
  }
}

export const getActual = <T extends object>(obj: T): T =>
  isMockified(obj) ? (obj[implementation] as T) ?? obj : obj;
