local ____exports = {}
local Format
local Breakpoint = {}
do
    local current = {}
    function Breakpoint.get(file, line)
        for _, breakpoint in ipairs(current) do
            if breakpoint.file == file and breakpoint.line == line then
                return breakpoint
            end
        end
        return nil
    end
    function Breakpoint.getAll()
        return current
    end
    local function makeFilePattern(file)
        file = Format.path(file)
        file = file:gsub("%.", "%.")
        file = tostring(file) .. "$"
        return file
    end
    function Breakpoint.add(file, line)
        local pattern = makeFilePattern(file)
        table.insert(current, {
            file = file,
            line = line,
            pattern = pattern,
            enabled = true,
        })
    end
    function Breakpoint.remove(file, line)
        for i, breakpoint in ipairs(current) do
            if breakpoint.file == file and breakpoint.line == line then
                table.remove(current, i)
                break
            end
        end
    end
    function Breakpoint.clear()
        current = {}
    end
end
local SourceMap = {}
do
    local cache = {}
    local base64Lookup = {
        A = 0,
        B = 1,
        C = 2,
        D = 3,
        E = 4,
        F = 5,
        G = 6,
        H = 7,
        I = 8,
        J = 9,
        K = 10,
        L = 11,
        M = 12,
        N = 13,
        O = 14,
        P = 15,
        Q = 16,
        R = 17,
        S = 18,
        T = 19,
        U = 20,
        V = 21,
        W = 22,
        X = 23,
        Y = 24,
        Z = 25,
        a = 26,
        b = 27,
        c = 28,
        d = 29,
        e = 30,
        f = 31,
        g = 32,
        h = 33,
        i = 34,
        j = 35,
        k = 36,
        l = 37,
        m = 38,
        n = 39,
        o = 40,
        p = 41,
        q = 42,
        r = 43,
        s = 44,
        t = 45,
        u = 46,
        v = 47,
        w = 48,
        x = 49,
        y = 50,
        z = 51,
        ["0"] = 52,
        ["1"] = 53,
        ["2"] = 54,
        ["3"] = 55,
        ["4"] = 56,
        ["5"] = 57,
        ["6"] = 58,
        ["7"] = 59,
        ["8"] = 60,
        ["9"] = 61,
        ["+"] = 62,
        ["/"] = 63,
        ["="] = 0,
    }
    local function base64Decode(input)
        local results = {}
        local bits = {}
        for c in input:gmatch(".") do
            local sextet = assert(base64Lookup[c])
            do
                local i = 0
                while i < 6 do
                    local bit = sextet % 2 ~= 0
                    table.insert(bits, i + 1, bit)
                    sextet = math.floor(sextet / 2)
                    i = i + 1
                end
            end
            if #bits >= 8 then
                local value = 0
                do
                    local i = 7
                    while i >= 0 do
                        local bit = table.remove(bits)
                        if bit then
                            value = value + (2 ^ i)
                        end
                        i = i - 1
                    end
                end
                table.insert(results, string.char(value))
            end
        end
        return table.concat(results)
    end
    local function decodeBase64VLQ(input)
        local values = {}
        local bits = {}
        for c in input:gmatch(".") do
            local sextet = assert(base64Lookup[c])
            do
                local i = 0
                while i < 5 do
                    local bit = sextet % 2 ~= 0
                    table.insert(bits, bit)
                    sextet = math.floor(sextet / 2)
                    i = i + 1
                end
            end
            local continueBit = sextet % 2 ~= 0
            if not continueBit then
                local value = 0
                do
                    local i = 1
                    while i < #bits do
                        if bits[i + 1] then
                            value = value + (2 ^ (i - 1))
                        end
                        i = i + 1
                    end
                end
                if bits[0 + 1] then
                    value = -value
                end
                table.insert(values, value)
                bits = {}
            end
        end
        return values
    end
    local function build(data)
        local sources = data:match("\"sources\"%s*:%s*(%b[])")
        local mappings = data:match("\"mappings\"%s*:%s*\"([^\"]+)\"")
        if mappings == nil or sources == nil then
            return nil
        end
        local lineMappingsForSources = {}
        do
            local line = 1
            local sourceIndex = 0
            local originalLine = 1
            for mapping, separator in mappings:gmatch("([^;,]*)([;,]?)") do
                local colOffset, sourceOffset, origLineOffset, origColOffset = unpack(decodeBase64VLQ(mapping))
                sourceIndex = sourceIndex + (sourceOffset or 0)
                originalLine = originalLine + (origLineOffset or 0)
                local lineMappings = lineMappingsForSources[sourceIndex]
                if lineMappings == nil then
                    lineMappings = {}
                    lineMappingsForSources[sourceIndex] = lineMappings
                end
                lineMappings[originalLine] = math.min(lineMappings[originalLine] or math.huge, line)
                if separator == ";" then
                    line = line + 1
                end
            end
        end
        local sourceMap = {sources = {}}
        for source in sources:gmatch("\"([^\"]+)\"") do
            table.insert(sourceMap.sources, source)
        end
        for sourceIndex, lineMappings in pairs(lineMappingsForSources) do
            for sourceLine, line in pairs(lineMappings) do
                sourceMap[line] = {
                    sourceIndex = sourceIndex,
                    sourceLine = sourceLine,
                }
            end
        end
        return sourceMap
    end
    function SourceMap.get(file)
        if file == "[C]" then
            return nil
        end
        local sourceMap = cache[file]
        if sourceMap == nil then
            sourceMap = false
            local mapFile = tostring(file) .. ".map"
            local f = io.open(mapFile)
            if f ~= nil then
                local data = f:read("*a")
                f:close()
                sourceMap = build(data) or false
            else
                f = io.open(file)
                if f ~= nil then
                    local data = f:read("*a")
                    f:close()
                    local encodedMap = data:match("--# sourceMappingURL=data:application/json;base64,([A-Za-z0-9+/=]+)%s*$")
                    if encodedMap ~= nil then
                        local map = base64Decode(encodedMap)
                        sourceMap = build(map) or false
                    end
                end
            end
            cache[file] = sourceMap
        end
        return sourceMap or nil
    end
end
Format = {}
do
    local indentStr = "  "
    local escapes = {
        ["\n"] = "\\n",
        ["\r"] = "\\r",
        ["\""] = "\\\"",
        ["\\"] = "\\\\",
        ["\b"] = "\\b",
        ["\f"] = "\\f",
    }
    local escapesPattern = ""
    for e in pairs(escapes) do
        escapesPattern = tostring(escapesPattern) .. tostring(e)
    end
    local function transformEscape(e)
        return escapes[e]
    end
    local function escape(str)
        local escaped = str:gsub(escapesPattern, transformEscape)
        return escaped
    end
    function Format.path(path)
        local firstChar = path:sub(1, 1)
        if firstChar == "@" or firstChar == "=" then
            path = path:sub(2)
        end
        path = path:gsub("\\", "/")
        return path
    end
    local function formatLuaKey(key, indent, tables)
        if type(key) == "string" then
            local validIdentifier = key:match("^[a-zA-Z_][a-zA-Z0-9_]*$")
            if validIdentifier ~= nil then
                return key
            end
        end
        return "[\"" .. tostring(escape(key)) .. "\"]"
    end
    function Format.formatAsLua(val, indent, tables)
        if indent == nil then
            indent = 0
        end
        tables = tables or {}
        local valType = type(val)
        if valType == "table" and not tables[val] then
            tables[val] = true
            local kvps = {}
            for _, v in ipairs(val) do
                local valStr = Format.formatAsLua(v, indent + 1, tables)
                table.insert(kvps, "\n" .. tostring(indentStr:rep(indent + 1)) .. tostring(valStr))
            end
            for k, v in pairs(val) do
                local keyType = type(k)
                if keyType ~= "number" or k > #val then
                    local keyStr = formatLuaKey(k, indent, tables)
                    local valStr = Format.formatAsLua(v, indent + 1, tables)
                    table.insert(kvps, "\n" .. tostring(indentStr:rep(indent + 1)) .. tostring(keyStr) .. " = " .. tostring(valStr))
                end
            end
            return (#kvps > 0) and "{" .. tostring(table.concat(kvps, ",")) .. "\n" .. tostring(indentStr:rep(indent)) .. "}" or "{}"
        elseif valType == "number" or valType == "boolean" then
            return tostring(val)
        else
            return "\"" .. tostring(escape(tostring(val))) .. "\""
        end
    end
    local function isArray(val)
        local len = #val
        if len == 0 then
            return false
        end
        for k in pairs(val) do
            if type(k) ~= "number" or k > len then
                return false
            end
        end
        return true
    end
    function Format.formatAsJson(val, indent, tables)
        if indent == nil then
            indent = 0
        end
        tables = tables or {}
        local valType = type(val)
        if valType == "table" and not tables[val] then
            tables[val] = true
            if isArray(val) then
                local arrayVals = {}
                for _, arrayVal in ipairs(val) do
                    local valStr = Format.formatAsJson(arrayVal, indent + 1, tables)
                    table.insert(arrayVals, "\n" .. tostring(indentStr:rep(indent + 1)) .. tostring(valStr))
                end
                return "[" .. tostring(table.concat(arrayVals, ",")) .. "\n" .. tostring(indentStr:rep(indent)) .. "]"
            else
                local kvps = {}
                for k, v in pairs(val) do
                    local valStr = Format.formatAsJson(v, indent + 1, tables)
                    table.insert(kvps, "\n" .. tostring(indentStr:rep(indent + 1)) .. "\"" .. tostring(escape(tostring(k))) .. "\": " .. tostring(valStr))
                end
                return (#kvps > 0) and "{" .. tostring(table.concat(kvps, ",")) .. "\n" .. tostring(indentStr:rep(indent)) .. "}" or "{}"
            end
        elseif valType == "number" or valType == "boolean" then
            return tostring(val)
        else
            return "\"" .. tostring(escape(tostring(val))) .. "\""
        end
    end
    Format.format = Format.formatAsJson
end
local Send = {}
do
    function Send.error(error)
        print(Format.format({error = error}))
    end
    function Send.debugBreak(msg)
        print(Format.format({debugBreak = msg}))
    end
    function Send.result(result)
        print(Format.format({result = result}))
    end
    function Send.frames(frames)
        print(Format.format(frames))
    end
    function Send.locals(locs)
        local locTable = {}
        for name, info in pairs(locs) do
            locTable[name] = {type = info.type}
        end
        print(Format.format(locTable))
    end
    function Send.vars(vars)
        local varTable = {}
        for name, info in pairs(vars) do
            varTable[name] = {type = info.type}
        end
        print(Format.format(varTable))
    end
    function Send.breakpoints(breaks)
        local breakStrs = {}
        for _, breakpoint in ipairs(breaks) do
            table.insert(breakStrs, tostring(breakpoint.file) .. ":" .. tostring(breakpoint.line) .. " (" .. tostring(breakpoint.enabled and "enabled" or "disabled") .. ")")
        end
        print(Format.format(breakStrs))
    end
    function Send.help(help)
        print(Format.format({help = help}))
    end
end
local Debugger = {}
do
    local function loadCode(code, env)
        if loadstring then
            local f, e = loadstring(code, code)
            if f and env then
                setfenv(f, env)
            end
            return unpack({
                f,
                e,
            })
        else
            return load(code, code, "t", env)
        end
    end
    local function backtrace(stack, frameIndex)
        local frames = {}
        do
            local i = 0
            while i < #stack do
                local info = stack[i + 1]
                local frame = {
                    source = info.source and Format.path(info.source) or "?",
                    line = info.currentline and assert(tonumber(info.currentline)) or -1,
                }
                if info.source and info.currentline then
                    local sourceMap = SourceMap.get(frame.source)
                    if sourceMap then
                        local lineMapping = sourceMap[frame.line]
                        if lineMapping ~= nil then
                            if sourceMap.sources then
                                frame.mappedSource = assert(sourceMap.sources[lineMapping.sourceIndex + 1])
                            end
                            frame.mappedLine = sourceMap[frame.line].sourceLine
                        end
                    end
                end
                if info.name then
                    frame.func = info.name
                end
                if i == frameIndex then
                    frame.active = true
                end
                table.insert(frames, frame)
                i = i + 1
            end
        end
        Send.frames(frames)
    end
    local function getLocals(level)
        local locs = {}
        do
            local index = 1
            while true do
                local name, val = debug.getlocal(level + 1, index)
                if name == nil then
                    break
                end
                if name:sub(1, 1) ~= "(" then
                    locs[name] = {
                        val = val,
                        index = index,
                        type = type(val),
                    }
                end
                index = index + 1
            end
        end
        return locs
    end
    local function getUpvalues(info)
        local ups = {}
        info.nups = assert(info.nups)
        info.func = assert(info.func)
        do
            local index = 1
            while index <= info.nups do
                local name, val = debug.getupvalue(info.func, index)
                ups[assert(name)] = {
                    val = val,
                    index = index,
                    type = type(val),
                }
                index = index + 1
            end
        end
        return ups
    end
    local function getGlobals()
        local globs = {}
        for key, val in pairs(_G) do
            local name = tostring(key)
            globs[name] = {
                val = val,
                type = type(val),
            }
        end
        return globs
    end
    local breakAtDepth = 0
    function Debugger.debugBreak(stack)
        breakAtDepth = 0
        local frameOffset = 3
        local frame = 0
        local info = stack[frame + 1]
        backtrace(stack, frame)
        while true do
            io.stdout:write("> ")
            local inp = io.stdin:read("*l")
            if inp == nil or type(inp) == "number" or inp == "cont" or inp == "continue" then
                break
            elseif inp == "help" then
                Send.help({
                    "help                         : show available commands",
                    "cont|continue                : continue execution",
                    "quit                         : stop program and debugger",
                    "step                         : step to next line",
                    "stepin                       : step in to current line",
                    "stepout                      : step out to calling line",
                    "stack                        : show current stack trace",
                    "frame n                      : set active stack frame",
                    "locals                       : show all local variables available in current context",
                    "ups                          : show all upvalue variables available in the current context",
                    "globals                      : show all global variables in current environment",
                    "eval                         : evaluate an expression in the current context and show its value",
                    "exec                         : execute a statement in the current context",
                    "break [list]                 : show all breakpoints",
                    "break set file.ext:n         : set a breakpoint",
                    "break del|delete file.ext:n  : delete a breakpoint",
                    "break en|enable file.ext:n   : enable a breakpoint",
                    "break dis|disable file.ext:n : disable a breakpoint",
                    "break clear                  : delete all breakpoints",
                })
            elseif inp == "step" then
                breakAtDepth = #stack
                break
            elseif inp == "stepin" then
                breakAtDepth = math.huge
                break
            elseif inp == "stepout" then
                breakAtDepth = #stack - 1
                break
            elseif inp == "quit" then
                os.exit(0)
            elseif inp == "stack" then
                backtrace(stack, frame)
            elseif inp:sub(1, 5) == "frame" then
                local newFrameStr = inp:match("^frame%s+(%d+)$")
                local newFrame = assert(tonumber(newFrameStr))
                if newFrame ~= nil and newFrame > 0 and newFrame <= #stack then
                    frame = newFrame - 1
                    info = stack[newFrame + 1]
                    backtrace(stack, frame)
                else
                    Send.error("Bad frame")
                end
            elseif inp == "locals" then
                local locs = getLocals(frameOffset + frame)
                Send.vars(locs)
            elseif inp == "ups" then
                local ups = getUpvalues(info)
                Send.vars(ups)
            elseif inp == "globals" then
                local globs = getGlobals()
                Send.vars(globs)
            elseif inp == "break" then
                Send.breakpoints(Breakpoint.getAll())
            elseif inp:sub(1, 5) == "break" then
                local cmd = inp:match("^break%s+([a-z]+)")
                local file
                local line
                local breakpoint
                if cmd == "set" or cmd == "del" or cmd == "delete" or cmd == "dis" or cmd == "disable" or cmd == "en" or cmd == "enable" then
                    local lineStr
                    file, lineStr = inp:match("^break%s+[a-z]+%s+([^:]+):(%d+)$")
                    if file ~= nil and lineStr ~= nil then
                        file = Format.path(file)
                        line = assert(tonumber(lineStr))
                        breakpoint = Breakpoint.get(file, line)
                    end
                end
                if cmd == "set" then
                    if file ~= nil and line ~= nil then
                        Breakpoint.add(file, line)
                    else
                        Send.error("Bad breakpoint")
                    end
                elseif cmd == "del" or cmd == "delete" then
                    if file ~= nil and line ~= nil then
                        Breakpoint.remove(file, line)
                    else
                        Send.error("Bad breakpoint")
                    end
                elseif cmd == "dis" or cmd == "disable" then
                    if breakpoint ~= nil then
                        breakpoint.enabled = false
                    else
                        Send.error("Bad breakpoint")
                    end
                elseif cmd == "en" or cmd == "enable" then
                    if breakpoint ~= nil then
                        breakpoint.enabled = true
                    else
                        Send.error("Bad breakpoint")
                    end
                elseif cmd == "clear" then
                    Breakpoint.clear()
                elseif cmd == "list" then
                    Send.breakpoints(Breakpoint.getAll())
                else
                    Send.error("Bad breakpoint command")
                end
            elseif inp:sub(1, 4) == "eval" then
                local expression = inp:match("^eval%s+(.+)$")
                if expression == nil then
                    Send.error("Bad expression")
                else
                    local env = setmetatable({}, {__index = _G})
                    local ups = getUpvalues(info)
                    for name, val in pairs(ups) do
                        env[name] = val.val
                    end
                    local vars = getLocals(frameOffset + frame)
                    for name, val in pairs(vars) do
                        env[name] = val.val
                    end
                    local f, e = loadCode("return " .. tostring(expression), env)
                    if f ~= nil then
                        local s, r = pcall(f)
                        if s then
                            Send.result(r)
                        else
                            Send.error(r)
                        end
                    else
                        Send.error(e)
                    end
                end
            elseif inp:sub(1, 4) == "exec" then
                local statement = inp:match("^exec%s+(.+)$")
                if statement == nil then
                    Send.error("Bad statement")
                else
                    local vars = getLocals(frameOffset + frame)
                    local ups = getUpvalues(info)
                    local env = setmetatable({}, {
                        __index = function(self, name)
                            local v = vars[name] or ups[name]
                            return (v ~= nil) and v.val or _G[name]
                        end,
                        __newindex = function(self, name, val)
                            local v = vars[name]
                            if v ~= nil then
                                local extraStack = 1
                                while debug.getinfo(frameOffset + #stack + extraStack) do
                                    extraStack = extraStack + 1
                                end
                                debug.setlocal(frameOffset + frame + extraStack, v.index, val)
                                return
                            end
                            v = ups[name]
                            if v ~= nil then
                                debug.setupvalue(assert(info.func), v.index, val)
                                return
                            end
                            _G[name] = val
                        end,
                    })
                    local f, e = loadCode(statement, env)
                    if f ~= nil then
                        local _, r = pcall(f)
                        if r ~= nil then
                            Send.result(r)
                        end
                    else
                        Send.error(e)
                    end
                end
            else
                Send.error("Bad command")
            end
        end
    end
    function Debugger.getStack()
        local info = debug.getinfo(3, "nSluf")
        if not info.source then
            return nil
        end
        local isDebugger = info.source:match("[/\\]?debugger%.lua$")
        if isDebugger ~= nil then
            return nil
        end
        local stack = {info}
        local i = 4
        while true do
            local stackInfo = debug.getinfo(i, "nSluf")
            if stackInfo == nil then
                break
            end
            table.insert(stack, stackInfo)
            i = i + 1
        end
        return stack
    end
    local function debugHook(event, line)
        local stack = Debugger.getStack()
        if not stack then
            return
        end
        if #stack <= breakAtDepth then
            Debugger.debugBreak(stack)
            return
        end
        local info = stack[0 + 1]
        local breakpoints = Breakpoint.getAll()
        if info.currentline == nil or #breakpoints == 0 then
            return
        end
        local source = Format.path(assert(info.source))
        local sourceMap = SourceMap.get(source)
        local lineMapping = sourceMap and sourceMap[info.currentline]
        local sourceMapFile = lineMapping and sourceMap.sources[lineMapping.sourceIndex + 1]
        for _, breakpoint in ipairs(breakpoints) do
            if breakpoint.enabled then
                local fileMatch
                if breakpoint.line == info.currentline then
                    fileMatch = source:match(breakpoint.pattern)
                elseif lineMapping and breakpoint.line == lineMapping.sourceLine then
                    fileMatch = sourceMapFile:match(breakpoint.pattern)
                end
                if fileMatch ~= nil then
                    Send.debugBreak("breakpoint hit: \"" .. tostring(breakpoint.file) .. ":" .. tostring(breakpoint.line) .. "\"")
                    Debugger.debugBreak(stack)
                    break
                end
            end
        end
    end
    function Debugger.setHook()
        debug.sethook(debugHook, "l")
    end
    function Debugger.clearHook()
        debug.sethook()
    end
    function Debugger.triggerBreak()
        breakAtDepth = math.huge
    end
    function Debugger.mapSources(msg)
        local result = ""
        for msgLine in msg:gmatch("[^\r\n]+[\r\n]*") do
            local _, e, indent, file, lineStr = msgLine:find("^(%s*)(.+):(%d+):")
            if e and file and lineStr then
                local line = assert(tonumber(lineStr))
                local sourceMap = SourceMap.get(file)
                if sourceMap and sourceMap[line] then
                    local file = sourceMap.sources[sourceMap[line].sourceIndex + 1]
                    local sourceLine = sourceMap[line].sourceLine
                    msgLine = tostring(indent) .. tostring(file) .. ":" .. tostring(sourceLine) .. ":" .. tostring(msgLine:sub(e + 1))
                end
            end
            result = tostring(result) .. tostring(msgLine)
        end
        return result
    end
end
local debugTraceback = debug.traceback
debug.traceback = function(threadOrMessage, messageOrLevel, level)
    local message
    local traceback
    if type(threadOrMessage) == "thread" then
        if messageOrLevel then
            message = Debugger.mapSources(messageOrLevel)
        end
        traceback = Debugger.mapSources(debugTraceback(threadOrMessage, message, level))
    else
        if threadOrMessage then
            message = Debugger.mapSources(threadOrMessage)
        end
        traceback = Debugger.mapSources(debugTraceback(message, messageOrLevel))
    end
    local stack = Debugger.getStack()
    if stack then
        Send.debugBreak(message and ("error: " .. tostring(message)) or "error")
        Debugger.debugBreak(stack)
    end
    return traceback
end
function ____exports.triggerBreak()
    Debugger.triggerBreak()
end
function ____exports.start(breakImmediately, useJson)
    if breakImmediately == nil then
        breakImmediately = true
    end
    if useJson == nil then
        useJson = false
    end
    Format.format = useJson and Format.formatAsJson or Format.formatAsLua
    Debugger.setHook()
    if breakImmediately then
        Debugger.triggerBreak()
    end
end
function ____exports.stop()
    Debugger.clearHook()
end
return ____exports
