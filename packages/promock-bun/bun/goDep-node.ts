// module.exports.something = 123;

let something = 123;
Object.defineProperty(module.exports, "something", {
  get: function () {
    return something;
  },
  set: function (value) {
    something = value;
  },
  enumerable: true,
});

module.exports.updateSomething = function updateSomething() {
  module.exports.something++;
  console.log("new something", module.exports.something);
};
console.log("hi from goDep");
