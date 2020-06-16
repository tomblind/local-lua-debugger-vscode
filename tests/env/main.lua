local setfenv = setfenv or function(func, env)
    local i = 1
    while true do
        if debug.getupvalue(func, i) == "_ENV" then
            debug.setupvalue(func, i, env)
            return
        end
    end
    error("unable to find _ENV upvalue")
end

local function foo()
    local _G, print, setmetatable = _G, print, setmetatable

    local myEnv = {foobar = "foobar", bar = {1, 2, 3}}
    setfenv(foo, myEnv)

    print(foobar, #bar, bar[1], bar[2], bar[3], _VERSION)

    setmetatable(myEnv, {__index = _G})
    print(foobar, #bar, bar[1], bar[2], bar[3], _VERSION)
end

foo()
