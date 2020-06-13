function a(id)
    for i = 1, 10 do
        coroutine.yield(id .. i)
    end
end

function b(id)
    local routines = {}
    for i = 1, 3 do
        local r = coroutine.create(a)
        table.insert(routines, r)
    end
    while true do
        local sum = 0
        for i, r in ipairs(routines) do
            local subId = string.char(string.byte('A') + i - 1)
            local success, n = coroutine.resume(r, subId)
            if not success then
                return
            end
            sum = sum .. n
        end
        coroutine.yield(id .. sum)
    end
end

function c()
    local routines = {}
    for i = 1, 3 do
        local r = coroutine.create(b)
        table.insert(routines, r)
    end
    while true do
        for i, r in ipairs(routines) do
            local subId = string.char(string.byte('z') - i + 1)
            local success, n = coroutine.resume(r, subId)
            if not success then
                return
            end
            print(n)
        end
    end
end

c()
