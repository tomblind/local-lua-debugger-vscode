
local upvalue = {
    name = ""
}

local function myFunc()
    print(upvalue)
end

local value = {}

print(myFunc)
