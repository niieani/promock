# `promock`

`promock` is simple (`<200` LOC of TypeScript) tool for mocking object and function exports of ESM modules (mjs).

Fully automated mocking works with `jest`, `vitest`, `bun test`, and any other testing framework that supports transforming code on the fly.

You could also use `promock` manually, as a Dependency Injection tool.

Instead of reading pages of documentation and reconfiguring your testing tools, `promock` provides an easy-to-use alternative.

Here's a basic usage example:

```typescript
import { override, restore } from "promock";
import { myObject } from "./example";

override(myObject, { a: 50 });
expect(myObject.a).toBe(50);
restore(myObject);
```

That's all! No awkward require/import mixes, no need to know about module hoisting, or `import()`ing with top-level awaits.

The name `promock` is a portmanteau of "Proxy" and "mock", as it uses JS Proxies to achieve its functionality.

## The problem

Even though ES Modules became ratified in 2015, the most prominent JavaScript testing framework, `jest`, still [doesn't fully support mocking ESM exports](https://github.com/jestjs/jest/issues/9430). Even `vitest`, the hot new testing framework, despite making a lot of progress on the front, still has [open issues](https://github.com/vitest-dev/vitest/issues/3046) related mocking ES modules, and the user experience is far from ideal, requiring the user to know complex APIs, such as [`vi.hoisted`](https://vitest.dev/api/vi.html#vi-hoisted).

This is a major problem for developers, as ESM packages are becoming ubiquitous, with more and more maintainers opting to [only support ESM](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).

TODO: in majority of cases mocking entire modules is not necessary, and it is hard when you only want to mock a single export.
Certain things are also impossible, such as changing what functions/classes are called internally, by the unmocked code, so it's hard to mix-and-match, even when using workaround such as jest.requireActual().

Enter `promock`:

- **Elegant and Intuitive**: Forget about lengthy and complex mocking setups, often requiring you to mix `require`'s and `import`s in your test files, or worry about the order in which dependencies are loaded. `promock` is intuitive and meshes well with modern ES syntax.

- **TypeScript and auto-refactoring support**: When using traditional mocking, you cannot rely on your IDE's auto-refactoring tools. Whenever a file is renamed, or a symbol moved, you need to manually update all your tests. This is a tedious and error-prone process.
  `promock`, on the other hand, is fully compatible with TypeScript and auto-refactoring, allowing you to refactor your code without worrying about breaking your tests.

- **Flexible Mocking**: `promock` allows for complete or partial overrides of objects, even on instances of classes, providing fine-grained control over your mock's behavior.

- **Less Boilerplate**: No more unnecessary and repetitive code in your tests. `promock` makes it easy to focus on what truly matters: testing your logic.

## When Not to Use `promock`

While `promock` is powerful, it's essential to understand its limitations:

- **Cannot mock primitives**: `promock` isn't suitable for mocking primitive values directly.
- **Cannot mock non-const variables**: `promock` cannot override exports declared with `export let` or `export var`.
- **Cannot mock internal Node/Bun/Electron modules**: `promock` doesn't mock modules, it mocks individual exports. This means that it cannot override internal modules, such as `fs` or `path`.
- **Does not fully replace the shape of the module**: For some unique cases, traditional mocking might offer more granular control.

## Getting Started

### Basic Usage

First, you'll need to setup `promock` in your project.

(TODO)

#### Mocking

First, import the required functions:

```typescript
import { override, partialOverride, restore } from "promock";
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

`promock` has an SWC plugin that automatically transforms all your code (and optionally its dependencies) to mockify all the exports seamlessly.

For example, a code like:

```typescript
export const example = {
  a: 100,
  b: 200,
};
```

Is transformed to:

```typescript
import { mockify } from "promock";
export const example = mockify({
  a: 100,
  b: 200,
});
```

This automation reduces manual intervention and ensures that your exports are always set up correctly.

## API Reference

- `isMockified(value: T): boolean`: Checks if the given export is mockified.

- `override(value: T, impl: T): void`: Completely overrides the mockified export with a new implementation.

- `partialOverride(value: T, impl: Partial<T>): void`: Partially overrides the mockified export, only replacing specified properties or methods.

- `restore(value: T): void`: Restores the mockified export to its original state.

- `getActual(value: T): T`: Restores the mockified export to its original state.

- `mockify(value: T): T`: Converts an object or function into a mockified version. Used internally by the SWC plugin.
