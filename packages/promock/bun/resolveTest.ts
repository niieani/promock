import { override } from "../mockify.js";

// import { b, goFn } from "./resolveTest2.js";
const [{ b, goFn }, { c }] = await Promise.all([
  import("./resolveTest2.js"),
  import("./resolveTest3.js"),
]);
// const { b, goFn } = require("./resolveTest2.js");

export const abc = { a: 123 };

export const fn = async () => {
  const go = await goFn();
  console.log("goFn", go);
  override(go, { go: 456 });
  console.log("stack", new Error());
  console.log("goFnOverride", go);
  return b;
};
// console.log("resolve test");
