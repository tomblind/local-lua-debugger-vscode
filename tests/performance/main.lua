function breakpoint()
    local i = 0
end

function doStuff()
    local t = {}
    t.a = "A"
    t.b = "B"
    t.c = "C"
    table.insert(t, "D")
    table.insert(t, "E")
    table.insert(t, "F")
    table.remove(t, 2)
    table.x = t.a .. t.b .. t.c .. t[1] .. t[2]
    local i = 17
    local j = 27
    table.y = math.ceil(i / j)
end

local start = os.clock()
for i = 1, 1000000 do
    doStuff()
end
local stop = os.clock()
print(stop - start)
