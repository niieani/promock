export const example = {
  a: 100,
  b: 200,
};

export default class Example extends Set<string> {
  a = 100;
  b = 200;
}

export const lambda = () => 100;

export function fns() {
  return 100;
}

export const instance = new Example();
