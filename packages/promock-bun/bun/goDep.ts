export function updateSomething() {
  something++, console.log("new something", something);
}
console.log("hi from goDep");
export const variable = { dep: 123 };
export let something = 123;
