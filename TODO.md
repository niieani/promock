- [ ] jest transform, with support for chaining
  - [transformation](https://jestjs.io/docs/code-transformation)
- [x] support "using" declarations API, by returning with Symbol.dispose from override()
- [ ] fix internal (in-file) references to functions, e.g.

```js
export function one() {
  /* content */
}
function two() {
  // should use the mocked version of one
  one();
}
```

after transform:

```js
function __mockify__real_one() {
  /* content */
}
const __mockified__one = mockify(__mockify__real_one);
export function one(...args) {
  return __mockified__one(...args);
}
// and then the two function would be unchanged
function two() {
  // should use the mocked version of one
  one();
}
```

So the transform steps are:

- rename real function to `__mockify__real_<name>`
- create a mockified version of the function as const
- export a function with the same name as the real function, which calls the mockified version

For classes this isn't a problem as much, because:
Classes, like variables declared with const and let, [cannot be referenced before the line that initializes them runs](https://stackoverflow.com/questions/35537619/why-are-es6-classes-not-hoisted/35537963#35537963).

This is fine, but internal references to instances created by the real class will not be mocked.
If we want to be able to override properties in instances created internally,
we could keep track of all constructions internally in mockify() using a WeakMap,
and maybe with some clever tricks, like returning `mockify(this)` from the constructor,
then whenever the class is overridden, we swap the prototype of the instance with the mock to make it work?
