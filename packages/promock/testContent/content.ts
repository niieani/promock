export const example = {
  a: 100,
  b: 200,
};

export default class Example extends Set<string> {
  a = 100;
  b = 200;
}

export const lambda = () => 100;

function fns() {
  return 100;
}

export { fns };

export const instance = new Example();

const obj = {
  a: 100,
  b: 200,
};

const obj2 = {
  a: 100,
  b: 200,
};

export { obj, obj2 as renamedObjExport };

export function exportedFns() {
  return 100;
}

export const expression = (100 + 100) * 2;
