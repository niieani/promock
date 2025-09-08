import {
  mockify,
  override,
  partialOverride,
  restore,
} from "../packages/promock/main.js";

const source = { x: 123 };
const obj = mockify(source);
partialOverride(obj, { x: 456 });
obj.x; //=
obj.x = 555;
obj.x; //=
source.x; //=

const fn = mockify((): number => 123);
fn(); //=

override(fn, () => 555);
fn(); //=

const x = mockify(new Map<string, number>());

console.log(x instanceof Map);
x.set("yo", 123);
x.get("yo"); //=
x.size; //=

override(x, new Map<string, number>());
x.size; //=

restore(x);
x.size; //=

partialOverride(x, { get: () => 555 });
x.set("xyz", 123);
x.size; //=
x.get("xyz"); //=

restore(x);
x.get("xyz"); //=

const y = mockify(Map);
const y1 = new y();
console.log(y1 instanceof Map);
y1.set("yo", 123);
y1.get("yo"); //=

override(
  y,
  class CustomMap {
    constructor() {
      console.log("yo");
      console.log(new.target);
    }
  },
);

const y2 = new y();
console.log(y2 instanceof Map);

restore(y);

const CustomClass = mockify(
  class CustomClass extends Map {
    doY() {
      console.log("y");
    }
    doX() {
      console.log("x");
    }
  },
);

override(
  CustomClass,
  class PartialCustomClass extends CustomClass {
    override doY() {
      console.log("mock");
    }
  },
);

const customClass = new CustomClass();
customClass.doY();
customClass.doX();
customClass.set("yo", 123);
