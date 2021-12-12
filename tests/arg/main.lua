print("varg: ", ...)
local varg = {...}
for key, val in pairs(varg) do
    print("    " .. tostring(key) .. " = " .. tostring(val))
end

print("arg: ", (table.unpack or unpack)(arg))
for key, val in pairs(arg) do
    print("    " .. tostring(key) .. " = " .. tostring(val))
end

function foo(a)
    print(a)
    print(arg)
end

function bar(a, ...)
    print(a)
    print(arg)
end

function baz(a, ...)
    print(a)
    print(...)
    print(arg)
end

foo("a")
foo("a", "b", {c = "d"})

bar("a")
bar("a", "b", {c = "d"})

baz("a")
baz("a", "b", {c = "d"})
