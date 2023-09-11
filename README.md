# `promock`

`promock` is simple (<200 LOC), innovative tool for mocking exports of objects and functions in ESM. Instead of using the often cumbersome and convoluted methodologies present in existing testing frameworks, `promock` provides a seamless, straightforward, and high-performant alternative.

The name `promock` is a portmanteau of "Proxy" and "mock", as it uses JS Proxies to achieve its functionality.

## Why Use `promock`?

- **Elegant and Intuitive**: Forget about lengthy and complex mocking setups, often requiring you to mix `require`'s and `import`s in your test files, or worry about the order in which dependencies are loaded. `promock` is intuitive and meshes well with modern ES syntax.

- **TypeScript and auto-refactoring support**: When using traditional mocking, you cannot rely on your IDE's auto-refactoring tools. Whenever a file is renamed, or a symbol moved, you need to manually update all your tests. This is a tedious and error-prone process.
  `promock`, on the other hand, is fully compatible with TypeScript and auto-refactoring, allowing you to refactor your code without worrying about breaking your tests.

- **Flexible Mocking**: `promock` allows for complete or partial overrides of objects, even on instances of classes, providing fine-grained control over your mock's behavior.

- **Less Boilerplate**: No more unnecessary and repetitive code in your tests. `promock` makes it easy to focus on what truly matters: testing your logic.

## When Not to Use `promock`

While `promock` is powerful, it's essential to understand its limitations:

- **Cannot Override Primitives**: `promock` isn't suitable for mocking primitive values directly.
- **Cannot Override non-const Variables**: `promock` cannot override variables declared with `let` or `var`.
- **Does not fully replace the module**: For some unique cases, traditional mocking might offer more granular control.

## Getting Started

### Basic Usage

First, you'll need to setup `promock` in your project.

(TODO)

#### Mocking

First, import the required functions:

```typescript
import { override, partialOverride, restore } from "`promock`";
```

Then, import any object, function, or class you wish to mock:

```typescript
import { exampleObj as mockedObj } from "./example";
```

You can now override or restore your object:

```typescript
override(mockedObj, { ...mockedObj, a: 50 });
// or to partially override:
partialOverride(mockedObj, { a: 50 });
// and to restore:
restore(mockedObj);
```

### SWC Plugin

`promock` has an SWC plugin. This means that when inside of your tests, it automatically transforms your code and `promock` exports seamlessly.

For example, a code like:

```typescript
export const example = {
  a: 100,
  b: 200,
};
```

Is transformed to:

```typescript
import { `promock` } from "`promock`";
export const example = `promock`({
  a: 100,
  b: 200,
});
```

This automation reduces manual intervention and ensures that your mocks are always set up correctly.

## API Reference

- ``promock`(obj: T): T`: Converts an object or function into a mockifiable version. Used internally by the SWC plugin.

- `isMockified(obj: T): boolean`: Checks if the given object is mockified.

- `override(obj: T, impl: T)`: Completely overrides the mockified object with a new implementation.

- `partialOverride(obj: T, impl: Partial<T>)`: Partially overrides the mockified object, only replacing specified properties or methods.

- `restore(obj: T)`: Restores the mockified object to its original state.
