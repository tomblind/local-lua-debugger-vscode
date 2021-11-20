-----------------------------------------------------------------------------------------
--
-- main.lua
--
-----------------------------------------------------------------------------------------

-- Your code here

if os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") == "1" then
	local lldebugger = loadfile(os.getenv("LOCAL_LUA_DEBUGGER_FILEPATH"))()
	lldebugger.start()
end

local msgText = display.newText("Hello, world!", 250, 250, native.systemFont, 32)
msgText:setFillColor(0.2, 0.6, 0.8)
