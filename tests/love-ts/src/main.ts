import * as foo from "./foo";

if (os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") === "1") {
    require("@NoResolution:lldebugger").start();
}

love.load = () => {
    print(foo.bar());
};
