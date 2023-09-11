import { describe, it, expect } from "@jest/globals";
import * as swc from "@swc/core";
import fs from "node:fs";
import path from "node:path";

const sources = {
  content: fs.readFileSync(
    path.join(__dirname, "testContent", "content.ts"),
    "utf8",
  ),
};

describe("transpile", () => {
  it("should transpile", async () => {
    const result = await swc.transform(sources.content, {
      jsc: {
        target: "es2022",
        parser: {
          syntax: "typescript",
          dynamicImport: true,
        },
        experimental: {
          plugins: [
            [
              require.resolve("../target/wasm32-wasi/release/swc_mockify.wasm"),
              {
                basePath: __dirname,
              },
            ],
          ],
        },
      },
    });
    expect(result.code).toMatchInlineSnapshot(`
"import { mockify as mockify } from "mockify";
class Example extends Set {
    a = 100;
    b = 200;
}
function exportedFns() {
    return 100;
}
export const example = mockify({
    a: 100,
    b: 200
});
export default mockify(Example);
export const lambda = mockify(()=>100);
function fns() {
    return 100;
}
export { _mockified_fns as fns };
export const instance = mockify(new Example());
const obj = {
    a: 100,
    b: 200
};
const obj2 = {
    a: 100,
    b: 200
};
export { _mockified_obj as obj, _mockified_obj2 as renamedObjExport };
const _mockified_exportedFns = mockify(exportedFns);
export const expression = mockify((100 + 100) * 2);
const _mockified_fns = mockify(fns);
const _mockified_obj = mockify(obj);
const _mockified_obj2 = mockify(obj2);
export { _mockified_exportedFns as exportedFns };
"
`);
  });
});
