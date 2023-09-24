"use __do_not_mockify__";

const dispose: typeof Symbol.dispose =
  Symbol.dispose ?? Symbol("Symbol.dispose");

const configuration = Symbol("configuration");

type AnyClass = {
  prototype: object;
} & (new (...args: unknown[]) => object);

type Configuration<T> = {
  implementation?: T | Partial<T>;
  partial: boolean;
  propertyDescriptorSource: "default" | "override";
  instances: Set<WeakRef<object>>;
  readonly defaultImplementation: T;
};

export const mockify = <T extends object>(obj: T): T => {
  if (!obj || (typeof obj !== "function" && typeof obj !== "object")) {
    return obj;
  }

  // noop if previously mockified
  if (isMockified(obj)) return obj;

  const conf: Configuration<T> = {
    implementation: undefined,
    partial: false,
    propertyDescriptorSource: "override",
    defaultImplementation: obj,
    instances: new Set(),
  };

  const registry = new FinalizationRegistry<WeakRef<object>>((heldValue) => {
    conf.instances.delete(heldValue);
  });

  // defaultImplementation should be read-only
  Object.defineProperty(conf, "defaultImplementation", {
    value: obj,
    configurable: false,
    writable: false,
    enumerable: true,
  });

  return new Proxy(obj, {
    // basic:
    get(target, propertyKey, receiver) {
      if (propertyKey === configuration) {
        return conf;
      }
      let value = (conf.implementation as any)?.[propertyKey];
      let t = conf.implementation;
      if (
        !conf.implementation ||
        (conf.partial && typeof value === "undefined")
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
      if (propertyKey === configuration) {
        return true;
      }
      const t = conf.implementation ?? target;
      const value = Reflect.has(t, propertyKey);
      if (conf.partial && conf.implementation) {
        return value || Reflect.has(target, propertyKey);
      }
      return value;
    },
    set(target, propertyKey, newValue, receiver) {
      if (propertyKey === configuration) {
        throw new Error(
          'Overriding the "configuration" property is not allowed. Mutate the configuration object instead.',
        );
      }
      const t = conf.implementation ?? target;
      return Reflect.set(
        t,
        propertyKey,
        newValue,
        conf.implementation ?? receiver,
      );
    },

    // properties:
    defineProperty(target, propertyKey, attributes) {
      const t = conf.implementation ?? target;
      return Reflect.defineProperty(t, propertyKey, attributes);
    },
    deleteProperty(target, propertyKey) {
      const t = conf.implementation ?? target;
      return Reflect.deleteProperty(t, propertyKey);
    },
    getOwnPropertyDescriptor(target, propertyKey) {
      const t =
        conf.propertyDescriptorSource === "override"
          ? conf.implementation ?? target
          : target;
      const value = Reflect.getOwnPropertyDescriptor(t, propertyKey);
      if (conf.partial && conf.implementation && t !== target) {
        return value ?? Reflect.getOwnPropertyDescriptor(target, propertyKey);
      }
      return value;
    },
    ownKeys(target) {
      const t =
        conf.propertyDescriptorSource === "override"
          ? conf.implementation ?? target
          : target;
      const value = Reflect.ownKeys(t);
      if (conf.partial && conf.implementation && t !== target) {
        return Array.from(new Set([...value, ...Reflect.ownKeys(target)]));
      }
      return value;
    },

    // function:
    apply(target, thisArg, argArray) {
      const t = ((conf.implementation as T) ?? target) as (
        ...args: unknown[]
      ) => unknown;
      return Reflect.apply(t, thisArg, argArray);
    },

    // class/object/prototype:
    construct(target, argArray, newTarget) {
      const t = ((conf.implementation as T) ?? target) as new (
        ...args: unknown[]
      ) => object;

      const instance = Reflect.construct(
        t,
        argArray,
        newTarget ? t : undefined,
      );

      // store WeakRef to all instances so that whenever the class is overridden,
      // all the instances should switch their prototype to the overridden version
      const weakRef = new WeakRef(instance);
      conf.instances.add(weakRef);
      registry.register(instance, weakRef);

      // extra bonus, we mockify the instance itself,
      // so that internal references can be overridden as well
      return mockify(instance);
    },
    getPrototypeOf(target) {
      const t = conf.implementation ?? target;
      return Reflect.getPrototypeOf(t);
    },
    isExtensible(target) {
      const t = conf.implementation ?? target;
      return Reflect.isExtensible(t);
    },
    preventExtensions(target) {
      const t = conf.implementation ?? target;
      return Reflect.preventExtensions(t);
    },
    setPrototypeOf(target, v) {
      const t = conf.implementation ?? target;
      return Reflect.setPrototypeOf(t, v);
    },
  });
};

export const isMockified = <T extends object>(
  obj: T | null,
): obj is T & {
  [configuration]: Configuration<T>;
} =>
  Boolean(obj && (obj as { [configuration]: Configuration<T> })[configuration]);

function getMockConfig<T extends object>(
  obj: T | null,
  throwIfNotMockified?: true,
): Configuration<T>;
function getMockConfig<T extends object>(
  obj: T | null,
  throwIfNotMockified: boolean,
): Configuration<T> | undefined;
function getMockConfig<T extends object>(
  obj: T | null,
  throwIfNotMockified = true,
): Configuration<T> | undefined {
  if (isMockified(obj)) return obj[configuration];
  if (throwIfNotMockified) {
    throw new Error("Cannot get configuration of non-mockified object");
  }
}

const nothingToDispose = { [dispose]() {} };

export const setPropertyDescriptorSource = <T extends object>(
  obj: T,
  source: "default" | "override",
  throwIfNotMockified = true,
) => {
  const config = getMockConfig(obj, throwIfNotMockified);

  if (config) {
    config.propertyDescriptorSource = source;
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
  const config = getMockConfig(source, throwIfNotMockified);
  if (config) {
    correctExtendedClass(replacement, source, config);
    config.implementation = replacement;
    config.partial = false;

    config.instances.forEach((weakRef) => {
      const instance = weakRef.deref();
      if (instance) {
        Object.setPrototypeOf(instance, (replacement as AnyClass).prototype);
      } else {
        config.instances.delete(weakRef);
      }
    });

    return {
      [dispose]() {
        restore(source);
      },
    };
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
  partialReplacement: T extends AnyClass
    ? { prototype: Partial<T["prototype"]> }
    : Partial<T>,
  throwIfNotMockified = true,
): { [dispose](): void } {
  const config = getMockConfig(source, throwIfNotMockified);
  if (config) {
    correctExtendedClass(partialReplacement, source, config);
    config.implementation = partialReplacement;
    config.partial = true;

    return {
      [dispose]() {
        restore(source);
      },
    };
  }
  return nothingToDispose;
}

function correctExtendedClass(
  impl: object,
  obj: object,
  config: Configuration<object>,
) {
  const proto = Reflect.getPrototypeOf(impl);
  // correct the extends clause to be of the actual class, not its Proxy
  // to avoid recursive class extension
  if (proto && proto === obj && isMockified(proto)) {
    Reflect.setPrototypeOf(impl, config.defaultImplementation);
  }
}

export function restore<T extends object>(
  source: T,
  throwIfNotMockified = true,
): void {
  const config = getMockConfig(source, throwIfNotMockified);
  if (config) {
    config.implementation = undefined;
    config.partial = false;
    return;
  }
}

export const getActual = <T extends object>(source: T): T =>
  getMockConfig(source, false)?.defaultImplementation ?? source;
