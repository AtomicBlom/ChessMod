const ModBuilder = require("minecraft-scripting-toolchain");
const ts = require("gulp-typescript");

const builder = new ModBuilder("chess");
builder.scriptTasks = [
    () => ts({
        module: "ES6",
        noImplicitAny: true,
        target: "es5"
    })
];
module.exports = builder.configureEverythingForMe();
