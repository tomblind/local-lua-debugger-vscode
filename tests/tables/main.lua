local base =
{
    foo = "foo",
    "A",
    "B",
    "C",
    {
        "d",
        "e",
        "f",
        bar = "bar"
    }
}

local make

local mt =
{
    __index = base,
    __len = function() return 42 end,
    __add = function(self, other) return make() end,
    __tostring = function() return "foobar" end,
}

make = function()
    return setmetatable({}, mt)
end

local a = make()
local b = make()
print(#a) --0 in 5.1/jit, 42 in 5.2+
local c = a + b
print(c)
print(c.foo)
print(c[4].bar)
