if os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") == "1" then
    local lldebugger = require("lldebugger")
    local d = describe
    describe = function(name, fn) d(name, function() lldebugger.call(fn) end) end --allow breaking on errors in tests
    lldebugger.start()
end

describe("a test", function()
    print("FUBAR")
end)

describe("an error", function()
    x = y / z
end)
