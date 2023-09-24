import { mockify, override } from "./mockify";

class ActualSomeClass {
  get abc() {
    return 123;
  }
  // contents
}
// this is the exported one:
const SomeClass = mockify(ActualSomeClass);

const instance = new SomeClass();

instance instanceof ActualSomeClass; // true
instance instanceof SomeClass; // true

instance.abc; //=

const overriden = class extends SomeClass {
  get abc() {
    return 456;
  }
};
override(SomeClass, overriden);

// the instances get the new implementation!
// something not possible with traditional mocking
instance.abc; //=

// additionally, the instances themselves can be overriden:
override(instance, { abc: 999 });
instance.abc; //=

const fn = () => 123;
