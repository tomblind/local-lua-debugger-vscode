if os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") == "1" then
    require("lldebugger").start()
end

local buttons = {}
local buttonFont = love.graphics.newFont(24)

local function addButton(text, x, y, w, h, cb)
    table.insert(buttons, {text = text, x = x, y = y, w = w, h = h, cb = cb})
end

local function error1()
    require("lldebugger").call(function()
        x = y / z
    end)
end

local function error2()
    error("FUBAR")
end

function love.load()
    addButton("Error 1", 10, 10, 100, 50, error1)
    addButton("Error 2", 10, 70, 100, 50, error2)
end

function love.draw()
    love.graphics.setFont(buttonFont)
    for _, button in ipairs(buttons) do
        love.graphics.setColor(1, 0, 0, 1)
        love.graphics.rectangle("fill", button.x, button.y, button.w, button.h)
        love.graphics.setColor(1, 1, 1, 1)
        love.graphics.print(button.text, button.x, button.y)
    end
end

function love.mousepressed(x, y, button, istouch)
    for _, button in ipairs(buttons) do
        if x >= button.x and x < button.x + button.w and y >= button.y and y < button.y + button.h then
            button.cb()
            break
        end
    end
end
