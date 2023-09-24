import goDep from "./goDep-node.js";
import { something } from "./goDep-node.js";
console.log("goDep", goDep.something, something);
goDep.updateSomething();
console.log("goDep", goDep.something, something);
