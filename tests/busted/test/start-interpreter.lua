if os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") == "1" then
    require("lldebugger").start()
end

require("busted.runner")()

describe("a test", function()
    print("FUBAR")
end)
