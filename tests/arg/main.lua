print("varg: ", ...)
local varg = {...}
for key, val in pairs(varg) do
    print("    " .. tostring(key) .. " = " .. tostring(val))
end

print("arg: ", (table.unpack or unpack)(arg))
for key, val in pairs(arg) do
    print("    " .. tostring(key) .. " = " .. tostring(val))
end
