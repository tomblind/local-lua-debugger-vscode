//MIT License
//
//Copyright (c) 202 Tom Blind
//
//Permission is hereby granted, free of charge, to any person obtaining a copy
//of this software and associated documentation files (the "Software"), to deal
//in the Software without restriction, including without limitation the rights
//to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//copies of the Software, and to permit persons to whom the Software is
//furnished to do so, subject to the following conditions:
//
//The above copyright notice and this permission notice shall be included in all
//copies or substantial portions of the Software.
//
//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//SOFTWARE.

import {
    luaAssert,
    luaError,
    luaCoroutineCreate,
    luaCoroutineWrap,
    luaCoroutineResume,
    luaDebugTraceback,
    loadLuaString,
    luaGetEnv
} from "./luafuncs";
import {Path} from "./path";
import {SourceMap} from "./sourcemap";
import {Send} from "./send";
import {Breakpoint} from "./breakpoint";
import {Thread, mainThread, mainThreadName, isThread} from "./thread";

export interface Var {
    val: unknown;
    type: string;
}

export interface Vars {
    [name: string]: Var | undefined;
}

export interface IndexedVar extends Var {
    index: number;
}

export interface Locals {
    vars: { [name: string]: IndexedVar };
    varargs?: IndexedVar[];
}

export namespace Debugger {
    export interface DebuggableFunction {
        (this: void, ...args: unknown[]): LuaMultiReturn<unknown[]>;
    }

    const debuggerName = "lldebugger.lua";
    const builtinFunctionPrefix = "[builtin:";

    const inputFileEnv: LuaDebug.InputFileEnv = "LOCAL_LUA_DEBUGGER_INPUT_FILE";
    const inputFilePath = os.getenv(inputFileEnv);
    let inputFile: LuaFile;
    if (inputFilePath && inputFilePath.length > 0) {
        const [file, err] = io.open(inputFilePath, "r+");
        if (!file) {
            luaError(`Failed to open input file "${inputFilePath}": ${err}\n`);
        }
        inputFile = file as LuaFile;
        inputFile.setvbuf("no");
    } else {
        inputFile = io.stdin;
    }

    const pullFileEnv: LuaDebug.PullFileEnv = "LOCAL_LUA_DEBUGGER_PULL_FILE";
    const pullFilePath = os.getenv(pullFileEnv);
    let lastPullSeek = 0;
    let pullFile: LuaFile | null;
    if (pullFilePath && pullFilePath.length > 0) {
        const [file, err] = io.open(pullFilePath, "r+");
        if (!file) {
            luaError(`Failed to open pull file "${pullFilePath}": ${err}\n`);
        }
        pullFile = file as LuaFile;
        pullFile.setvbuf("no");
        const [fileSize, errorSeek] = pullFile.seek("end");
        if (!fileSize) {
            luaError(`Failed to read pull file "${pullFilePath}": ${errorSeek}\n`);
        } else {
            lastPullSeek = fileSize;
        }
    } else {
        pullFile = null;
    }

    let skipNextBreak = false;

    const enum HookType {
        Global = "global",
        Function = "function"
    }
    const hookStack: HookType[] = [];

    const threadIds = setmetatable(new LuaTable<Thread, number | undefined>(), {__mode: "k"});
    const threadStackOffsets = setmetatable(new LuaTable<Thread, number | undefined>(), {__mode: "k"});
    const mainThreadId = 1;
    threadIds.set(mainThread, mainThreadId);
    let nextThreadId = mainThreadId + 1;

    function getThreadId(thread: Thread) {
        return luaAssert(threadIds.get(thread));
    }

    function getActiveThread() {
        return coroutine.running() ?? mainThread;
    }

    function getLine(info: debug.FunctionInfo) {
        const currentLine = info.currentline && tonumber(info.currentline);
        if (currentLine && currentLine > 0) {
            return currentLine;
        }
        const lineDefined = info.linedefined && tonumber(info.linedefined);
        if (lineDefined && lineDefined > 0) {
            return lineDefined;
        }
        return -1;
    }

    function backtrace(stack: debug.FunctionInfo[], frameIndex: number) {
        const frames: LuaDebug.Frame[] = [];
        for (const i of $range(0, stack.length - 1)) {
            const info = luaAssert(stack[i]);
            const frame: LuaDebug.Frame = {
                source: info.source && Path.format(info.source) || "?",
                line: getLine(info)
            };
            if (info.source) {
                const sourceMap = SourceMap.get(frame.source);
                if (sourceMap) {
                    const lineMapping = sourceMap.mappings[frame.line];
                    if (lineMapping) {
                        frame.mappedLocation = {
                            source: luaAssert(sourceMap.sources[lineMapping.sourceIndex]),
                            line: lineMapping.sourceLine,
                            column: lineMapping.sourceColumn
                        };
                    }
                }
            }
            if (info.name) {
                frame.func = info.name;
            } else if (info.func) {
                frame.func = tostring(info.func);
            }
            if (i === frameIndex) {
                frame.active = true;
            }
            table.insert(frames, frame);
        }
        Send.frames(frames);
    }

    const supportsUtf8Identifiers = (() => {
        const identifier = `${string.char(226)}${string.char(143)}${string.char(176)}`;
        const [, err] = loadLuaString(`local ${identifier} = true return ${identifier}`);
        return err === undefined;
    })();

    function isValidIdentifier(name: string) {
        if (supportsUtf8Identifiers) {
            for (const [c] of name.gmatch("[^a-zA-Z0-9_]")) {
                const [a] = c.byte();
                if (a && a < 128) {
                    return false;
                }
            }
            return true;
        } else {
            const [invalidChar] = name.match("[^a-zA-Z0-9_]");
            return invalidChar === undefined;
        }
    }

    function getLocals(level: number, thread?: Thread): Locals {
        const locs: Locals = {vars: {}};

        if (thread === mainThreadName) {
            return locs; // Accessing locals for main thread, but we're in a coroutine right now
        }

        //Validate level
        let info: debug.FunctionInfo | undefined;
        if (thread) {
            info = debug.getinfo(thread, level, "u");
        } else {
            info = debug.getinfo(level + 1, "u");
        }
        if (!info) {
            return locs;
        }

        let name: string | undefined;
        let val: unknown;

        //Standard locals
        let index = 1;
        while (true) {
            if (thread) {
                [name, val] = debug.getlocal(thread, level, index);
            } else {
                [name, val] = debug.getlocal(level + 1, index);
            }
            if (!name) {
                break;
            }

            if (isValidIdentifier(name)) {
                locs.vars[name] = {val, index, type: type(val)};
            }

            ++index;
        }

        //Varargs
        const isVarArg = (info as unknown as { isvararg: boolean | undefined }).isvararg;
        if (isVarArg !== false) {
            if (isVarArg) {
                locs.varargs = [];
            }
            index = -1;
            while (true) {
                if (thread) {
                    [name, val] = debug.getlocal(thread, level, index);
                } else {
                    [name, val] = debug.getlocal(level + 1, index);
                }
                if (!name) {
                    break;
                }
                if (!locs.varargs) {
                    locs.varargs = [];
                }
                table.insert(locs.varargs, {val, index, type: type(val)});
                --index;
            }
        }

        return locs;
    }

    function getUpvalues(info: debug.FunctionInfo): Locals {
        const ups: Locals = {vars: {}};

        if (!info.nups || !info.func) {
            return ups;
        }

        for (const index of $range(1, info.nups)) {
            const [name, val] = debug.getupvalue(info.func, index);
            ups.vars[luaAssert(name)] = {val, index, type: type(val)};
        }

        return ups;
    }

    function populateGlobals(
        globs: Vars,
        tbl: Record<string, unknown>,
        metaStack: LuaTable<AnyNotNil, boolean | undefined>
    ) {
        metaStack.set(tbl, true);

        const meta = debug.getmetatable(tbl) as Record<string, unknown> | undefined;
        if (meta !== undefined && type(meta.__index) === "table" && metaStack.get(meta) === undefined) {
            populateGlobals(globs, meta.__index as Record<string, unknown>, metaStack);
        }

        for (const [key, val] of pairs(tbl)) {
            const name = tostring(key);
            globs[name] = {val, type: type(val)};
        }
    }

    function getGlobals(level: number, thread?: Thread): Vars {
        if (thread === mainThreadName) {
            thread = undefined; //Use globals from active thread if main is inaccessible
        }
        if (!thread) {
            ++level;
        }
        const globs: Vars = {};
        const fenv = luaGetEnv(level, thread) ?? _G;
        const metaStack = new LuaTable<AnyNotNil, boolean | undefined>();
        populateGlobals(globs, fenv, metaStack);
        return globs;
    }

    function mapVarNames(vars: Vars, sourceMap: SourceMap | undefined) {
        if (!sourceMap) {
            return;
        }

        const addVars: Vars = {};
        const removeVars: string[] = [];
        for (const [name, info] of pairs(vars)) {
            const mappedName = sourceMap.sourceNames[name];
            if (mappedName) {
                addVars[mappedName] = info;
                table.insert(removeVars, name);
            }
        }
        for (const [_, name] of ipairs(removeVars)) {
            vars[name] = undefined;
        }
        for (const [name, info] of pairs(addVars)) {
            vars[name] = info;
        }
    }

    function mapExpressionNames(expression: string, sourceMap: SourceMap | undefined) {
        if (!sourceMap || !sourceMap.hasMappedNames) {
            return expression;
        }

        function mapName(sourceName: string, isProperty: boolean) {
            if (isProperty) {
                if (!isValidIdentifier(sourceName)) {
                    return `["${sourceName}"]`;
                } else {
                    return `.${sourceName}`;
                }
            } else {
                return luaAssert(sourceMap).luaNames[sourceName] ?? sourceName;
            }
        }

        let inQuote: string | undefined;
        let isEscaped = false;
        let nameStart: number | undefined;
        let nameIsProperty = false;
        let nonNameStart = 1;
        let mappedExpression = "";
        for (const i of $range(1, expression.length)) {
            const char = expression.sub(i, i);
            if (inQuote) {
                if (char === "\\") {
                    isEscaped = !isEscaped;
                } else if (char === inQuote && !isEscaped) {
                    inQuote = undefined;
                } else {
                    isEscaped = false;
                }
            } else if (char === '"' || char === "'") {
                //TODO: Handle bracket string types ([[foo]], [=[bar]=], etc...)
                inQuote = char;
            } else {
                const [nameChar] = char.match("[^\"'`~!@#%%^&*%(%)%-+=%[%]{}|\\/<>,%.:;%s]");
                if (nameStart) {
                    if (!nameChar) {
                        const sourceName = expression.sub(nameStart, i - 1);
                        mappedExpression += mapName(sourceName, nameIsProperty);
                        nameStart = undefined;
                        nonNameStart = i;
                    }
                } else if (nameChar) {
                    const lastChar = expression.sub(i - 1, i - 1);
                    nameIsProperty = (lastChar === ".");
                    nameStart = i;
                    mappedExpression += expression.sub(nonNameStart, nameStart - (nameIsProperty ? 2 : 1));
                }
            }
        }
        if (nameStart) {
            const sourceName = expression.sub(nameStart);
            mappedExpression += mapName(sourceName, nameIsProperty);
        } else {
            mappedExpression += expression.sub(nonNameStart);
        }

        return mappedExpression;
    }

    const metatableAccessor: LuaDebug.MetatableAccessor = "lldbg_getmetatable";

    function execute(
        statement: string,
        level: number,
        info: debug.FunctionInfo,
        thread?: Thread
    ): LuaMultiReturn<[true, ...unknown[]] | [false, string]> {
        if (thread === mainThreadName) {
            return $multi(false, "unable to access main thread while running in a coroutine");
        }

        if (!thread) {
            ++level;
        }

        const locs = getLocals(level, thread);
        const ups = getUpvalues(info);
        const fenv = luaGetEnv(level, thread) ?? _G;
        const env = setmetatable(
            {},
            {
                __index(this: unknown, name: string) {
                    if (name === metatableAccessor) {
                        return getmetatable;
                    }
                    const variable = locs.vars[name] ?? ups.vars[name];
                    if (variable !== undefined) {
                        return variable.val;
                    }
                    return fenv[name];
                },
                __newindex(this: unknown, name: string, val: unknown) {
                    const variable = locs.vars[name] ?? ups.vars[name];
                    if (variable !== undefined) {
                        variable.type = type(val);
                        variable.val = val;
                    } else {
                        fenv[name] = val;
                    }
                }
            }
        );

        const loadStringResult = loadLuaString(statement, env);
        const func = loadStringResult[0];
        if (!func) {
            return $multi(false, loadStringResult[1]);
        }

        const varargs: unknown[] = [];
        if (locs.varargs) {
            for (const vararg of locs.varargs) {
                table.insert(varargs, vararg.val);
            }
        }

        const results = pcall<unknown[], unknown[]>(func, ...unpack(varargs));
        if (results[0]) {
            for (const [_, loc] of pairs(locs.vars)) {
                if (thread) {
                    debug.setlocal(thread, level, loc.index, loc.val);
                } else {
                    debug.setlocal(level, loc.index, loc.val);
                }
            }
            for (const [_, up] of pairs(ups.vars)) {
                debug.setupvalue(luaAssert(info.func), up.index, up.val);
            }
            return $multi(true, ...unpack(results, 2));
        }
        return $multi(false, results[1]);
    }

    function getInput(): string | undefined {
        const inp = inputFile.read("*l");
        return inp;
    }

    function getStack(threadOrOffset: LuaThread | number) {
        let thread: LuaThread | undefined;
        let i = 1;
        if (isThread(threadOrOffset)) {
            thread = threadOrOffset;
            const offset = threadStackOffsets.get(thread);
            if (offset) {
                i += offset;
            }
        } else {
            i += threadOrOffset;
        }
        const stack: debug.FunctionInfo[] = [];
        while (true) {
            let stackInfo: debug.FunctionInfo | undefined;
            if (thread) {
                stackInfo = debug.getinfo(thread, i, "nSluf");
            } else {
                stackInfo = debug.getinfo(i, "nSluf");
            }
            if (!stackInfo) {
                break;
            }
            table.insert(stack, stackInfo);
            ++i;
        }
        return stack;
    }

    let breakAtDepth = -1;
    let breakInThread: Thread | undefined;
    let updateHook: { (): void };
    let isDebugHookDisabled = true;
    let ignorePatterns: string[] | undefined;
    let inDebugBreak = false;

    function debugBreak(activeThread: Thread, stackOffset: number, activeLine?: number) {
        assert(!inDebugBreak);
        inDebugBreak = true;
        ++stackOffset;
        const activeStack = getStack(stackOffset);
        if (activeLine && activeStack.length > 0) {
            luaAssert(activeStack[0]).currentline = activeLine;
        }
        const activeThreadFrameOffset = stackOffset;

        breakAtDepth = -1;
        breakInThread = undefined;
        let frameOffset = activeThreadFrameOffset;
        let frame = 0;
        let currentThread = activeThread;
        let currentStack = activeStack;
        let info = luaAssert(currentStack[frame]);
        let source = Path.format(luaAssert(info.source));
        let sourceMap = SourceMap.get(source);
        while (true) {
            const inp = getInput();
            if (!inp || inp === "quit") {
                os.exit(0);

            } else if (inp === "cont" || inp === "continue") {
                break;

            } else if (inp === "autocont" || inp === "autocontinue") {
                updateHook();
                inDebugBreak = false;
                return false; //Check breakpoints before resuming

            } else if (inp === "help") {
                Send.help(
                    ["help", "show available commands"],
                    ["cont|continue", "continue execution"],
                    ["autocont|autocontinue", "continue execution if not stopped at a breakpoint"],
                    ["quit", "stop program and debugger"],
                    ["step", "step to next line"],
                    ["stepin", "step in to current line"],
                    ["stepout", "step out to calling line"],
                    ["stack", "show current stack trace"],
                    ["frame n", "set active stack frame"],
                    ["locals", "show all local variables available in current context"],
                    ["ups", "show all upvalue variables available in the current context"],
                    ["globals", "show all global variables in current environment"],
                    ["props indexed [start] [count]", "show array elements of a table"],
                    ["props named|all", "show properties of a table"],
                    ["eval", "evaluate an expression in the current context"],
                    ["exec", "execute a statement in the current context"],
                    ["break set file.ext:n [cond]", "set a breakpoint"],
                    ["break del|delete file.ext:n", "delete a breakpoint"],
                    ["break en|enable file.ext:n", "enable a breakpoint"],
                    ["break dis|disable file.ext:n", "disable a breakpoint"],
                    ["break list", "show all breakpoints"],
                    ["break clear", "delete all breakpoints"],
                    ["threads", "list active thread ids"],
                    ["thread n", "set current thread by id"],
                    ["script", "add known script file (pre-caches sourcemap for breakpoint)"],
                    ["ignore", "add pattern for files to ignore when stepping"]
                );

            } else if (inp === "threads") {
                Send.threads(threadIds, activeThread);

            } else if (inp.sub(1, 6) === "thread") {
                const [newThreadIdStr] = inp.match("^thread%s+(%d+)$");
                if (newThreadIdStr !== undefined) {
                    const newThreadId = luaAssert(tonumber(newThreadIdStr));
                    let newThread: Thread | undefined;
                    for (const [thread, threadId] of pairs(threadIds)) {
                        if (threadId === newThreadId) {
                            newThread = thread;
                            break;
                        }
                    }
                    if (newThread !== undefined) {
                        if (newThread === activeThread) {
                            currentStack = activeStack;
                        } else if (newThread === mainThreadName) {
                            currentStack = [{
                                name: "unable to access main thread while running in a coroutine",
                                source: ""
                            }];
                        } else {
                            currentStack = getStack(newThread);
                            if (currentStack.length === 0) {
                                table.insert(
                                    currentStack,
                                    {name: "thread has not been started", source: ""}
                                );
                            }
                        }
                        currentThread = newThread;
                        frame = 0;
                        frameOffset = (currentThread === activeThread)
                            ? activeThreadFrameOffset
                            : 1 + (threadStackOffsets.get(currentThread) ?? 0);
                        info = luaAssert(currentStack[frame]);
                        source = Path.format(luaAssert(info.source));
                        sourceMap = SourceMap.get(source);
                        backtrace(currentStack, frame);
                    } else {
                        Send.error("Bad thread id");
                    }
                } else {
                    Send.error("Bad thread id");
                }

            } else if (inp === "step") {
                breakAtDepth = activeStack.length;
                breakInThread = activeThread;
                break;

            } else if (inp === "stepin") {
                breakAtDepth = math.huge;
                breakInThread = undefined;
                break;

            } else if (inp === "stepout") {
                breakAtDepth = activeStack.length - 1;
                breakInThread = activeThread;
                break;

            } else if (inp === "stack") {
                backtrace(currentStack, frame);

            } else if (inp.sub(1, 5) === "frame") {
                const [newFrameStr] = inp.match("^frame%s+(%d+)$");
                if (newFrameStr !== undefined) {
                    const newFrame = luaAssert(tonumber(newFrameStr));
                    if (newFrame > 0 && newFrame <= currentStack.length) {
                        frame = newFrame - 1;
                        info = luaAssert(currentStack[frame]);
                        source = Path.format(luaAssert(info.source));
                        sourceMap = SourceMap.get(source);
                        backtrace(currentStack, frame);
                    } else {
                        Send.error("Bad frame");
                    }
                } else {
                    Send.error("Bad frame");
                }

            } else if (inp === "locals") {
                const locs = getLocals(frame + frameOffset, currentThread !== activeThread ? currentThread : undefined);
                mapVarNames(locs.vars, sourceMap);
                if (locs.varargs) {
                    const varArgVals: unknown[] = [];
                    for (const vararg of locs.varargs) {
                        table.insert(varArgVals, vararg.val);
                    }
                    locs.vars["..."] = {val: varArgVals, index: -1, type: "table"};
                }
                Send.vars(locs.vars);

            } else if (inp === "ups") {
                const ups = getUpvalues(info);
                mapVarNames(ups.vars, sourceMap);
                Send.vars(ups.vars);

            } else if (inp === "globals") {
                const globs = getGlobals(
                    frame + frameOffset,
                    currentThread !== activeThread ? currentThread : undefined
                );
                mapVarNames(globs, sourceMap);
                Send.vars(globs);

            } else if (inp.sub(1, 5) === "break") {
                const [cmd] = inp.match("^break%s+([a-z]+)");
                let file: string | undefined;
                let line: number | undefined;
                let breakpoint: LuaDebug.Breakpoint | undefined;
                if (cmd === "set"
                    || cmd === "del"
                    || cmd === "delete"
                    || cmd === "dis"
                    || cmd === "disable"
                    || cmd === "en"
                    || cmd === "enable"
                ) {
                    let lineStr: string | undefined;
                    [file, lineStr] = inp.match("^break%s+[a-z]+%s+(.-):(%d+)");
                    if (file !== undefined && lineStr !== undefined) {
                        line = luaAssert(tonumber(lineStr));
                        breakpoint = Breakpoint.get(file, line);
                    }
                }
                if (cmd === "set") {
                    if (file !== undefined && line !== undefined) {
                        const [condition] = inp.match("^break%s+[a-z]+%s+.-:%d+%s+(.+)");
                        Breakpoint.add(file, line, condition);
                        breakpoint = luaAssert(Breakpoint.get(file, line));
                        Send.breakpoints([breakpoint]);
                    } else {
                        Send.error("Bad breakpoint");
                    }

                } else if (cmd === "del" || cmd === "delete") {
                    if (file !== undefined && line !== undefined) {
                        Breakpoint.remove(file, line);
                        Send.result(undefined);
                    } else {
                        Send.error("Bad breakpoint");
                    }

                } else if (cmd === "dis" || cmd === "disable") {
                    if (breakpoint !== undefined) {
                        breakpoint.enabled = false;
                        Send.breakpoints([breakpoint]);
                    } else {
                        Send.error("Bad breakpoint");
                    }

                } else if (cmd === "en" || cmd === "enable") {
                    if (breakpoint !== undefined) {
                        breakpoint.enabled = true;
                        Send.breakpoints([breakpoint]);
                    } else {
                        Send.error("Bad breakpoint");
                    }

                } else if (cmd === "clear") {
                    Breakpoint.clear();
                    Send.breakpoints(Breakpoint.getAll());

                } else if (cmd === "list") {
                    Send.breakpoints(Breakpoint.getAll());

                } else {
                    Send.error("Bad breakpoint command");
                }

            } else if (inp.sub(1, 4) === "eval") {
                const [expression] = inp.match("^eval%s+(.+)$");
                if (!expression) {
                    Send.error("Bad expression");

                } else {
                    const mappedExpression = mapExpressionNames(expression, sourceMap);
                    const results = execute(
                        `return ${mappedExpression}`,
                        frame + frameOffset,
                        info,
                        currentThread !== activeThread ? currentThread : undefined
                    );
                    if (results[0]) {
                        Send.result(...unpack(results, 2));
                    } else {
                        Send.error(results[1]);
                    }
                }

            } else if (inp.sub(1, 5) === "props") {
                const [expression, kind, first, count] = inp.match("^props%s+(.-)%s*([a-z]+)%s*(%d*)%s*(%d*)$");
                if (!expression) {
                    Send.error("Bad expression");

                } else if (kind !== "all" && kind !== "named" && kind !== "indexed") {
                    Send.error("Bad kind: " + `'${kind}'`);

                } else {
                    const mappedExpression = mapExpressionNames(expression, sourceMap);
                    const [s, r] = execute(
                        `return ${mappedExpression}`,
                        frame + frameOffset,
                        info,
                        currentThread !== activeThread ? currentThread : undefined
                    );
                    if (s) {
                        if (type(r) === "table") {
                            Send.props(r as AnyTable, kind, tonumber(first), tonumber(count));
                        } else {
                            Send.error(`Expression "${mappedExpression}" is not a table`);
                        }
                    } else {
                        Send.error(r as string);
                    }
                }

            } else if (inp.sub(1, 4) === "exec") {
                const [statement] = inp.match("^exec%s+(.+)$");
                if (!statement) {
                    Send.error("Bad statement");

                } else {
                    const results = execute(
                        statement,
                        frame + frameOffset,
                        info,
                        currentThread !== activeThread ? currentThread : undefined
                    );
                    if (results[0]) {
                        Send.result(...unpack(results, 2));
                    } else {
                        Send.error(results[1]);
                    }
                }

            } else if (inp.sub(1, 6) === "script") {
                let [scriptFile] = inp.match("^script%s+(.+)$");
                if (!scriptFile) {
                    Send.error("Bad script file");

                } else {
                    scriptFile = Path.format(scriptFile);
                    const foundSourceMap = SourceMap.get(scriptFile);
                    if (foundSourceMap) {
                        Send.result(`added ${scriptFile}: source map found`);
                    } else {
                        Send.result(`added ${scriptFile}: source map NOT found!`);
                    }
                }

            } else if (inp.sub(1, 6) === "ignore") {
                const [ignorePattern] = inp.match("^ignore%s+(.+)$");
                if (!ignorePattern) {
                    Send.error("Bad ignore pattern");
                } else {
                    const [match, err] = pcall(string.match, "", ignorePattern);
                    if (!match) {
                        Send.error(`Bad ignore pattern "${ignorePattern}": ${err}`);
                    } else {
                        if (!ignorePatterns) {
                            ignorePatterns = [];
                        }
                        table.insert(ignorePatterns, ignorePattern);
                        Send.result(`Added ignore pattern "${ignorePattern}"`);
                    }
                }

            } else {
                Send.error("Bad command");
            }
        }

        updateHook();
        inDebugBreak = false;
        return true; //Resume execution immediately without checking breakpoints
    }

    function comparePaths(a: string, b: string) {
        let aLen = a.length;
        const bLen = b.length;
        if (aLen === bLen) {
            return a === b;
        }
        //Ensure 'a' is the shorter path
        if (bLen < aLen) {
            [a, aLen, b] = [b, bLen, a];
        }
        if (a !== b.sub(-aLen)) {
            return false;
        }
        //If shorter string doesn't start with '/', make sure the longer one has '/' right before the substring
        //so we don't match a partial filename.
        if (a.sub(1, 1) === Path.separator) {
            return true;
        }
        const bSep = -(aLen + 1);
        return b.sub(bSep, bSep) === Path.separator;
    }

    const debugHookStackOffset = 2;
    const breakpointLookup = Breakpoint.getLookup();
    const stepUnmappedLinesEnv: LuaDebug.StepUnmappedLinesEnv = "LOCAL_LUA_DEBUGGER_STEP_UNMAPPED_LINES";
    const skipUnmappedLines = (os.getenv(stepUnmappedLinesEnv) !== "1");

    function debugHook(event: "call" | "return" | "tail return" | "count" | "line", line?: number) {
        if (isDebugHookDisabled) {
            return;
        }

        //Stepping
        if (breakAtDepth >= 0) {
            const activeThread = getActiveThread();

            let stepBreak: boolean;
            if (breakInThread === undefined) {
                stepBreak = true;
            } else if (activeThread === breakInThread) {
                stepBreak = getStack(debugHookStackOffset).length <= breakAtDepth;
            } else {
                stepBreak = breakInThread !== mainThread && coroutine.status(breakInThread as LuaThread) === "dead";
            }
            if (stepBreak) {
                const topFrameSource = debug.getinfo(debugHookStackOffset, "S");
                if (!topFrameSource || !topFrameSource.source) {
                    return;
                }

                //Ignore debugger code
                if (topFrameSource.source.sub(-debuggerName.length) === debuggerName) {
                    return;
                }

                //Ignore builtin lua functions (luajit)
                if (
                    topFrameSource.short_src
                    && topFrameSource.short_src.sub(1, builtinFunctionPrefix.length) === builtinFunctionPrefix
                ) {
                    return;
                }

                //Ignore patterns
                let source: string | undefined;
                if (ignorePatterns) {
                    source = Path.format(topFrameSource.source);
                    for (const pattern of ignorePatterns) {
                        const [match] = source.match(pattern);
                        if (match) {
                            return;
                        }
                    }
                }

                //Ignore un-mapped lines in files with source maps
                if (skipUnmappedLines) {
                    source ||= Path.format(topFrameSource.source);
                    const sourceMap = SourceMap.get(source);
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    if (sourceMap && !sourceMap.mappings[line!]) {
                        return;
                    }
                }

                Send.debugBreak("step", "step", getThreadId(activeThread));
                if (debugBreak(activeThread, debugHookStackOffset, line)) {
                    return;
                }
            }
        }

        //Breakpoints
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const lineBreakpoints = breakpointLookup[line!];
        if (!lineBreakpoints) {
            return;
        }

        let topFrame = debug.getinfo(debugHookStackOffset, "S");
        if (!topFrame || !topFrame.source) {
            return;
        }
        const source = Path.format(topFrame.source);
        topFrame = undefined;

        for (const breakpoint of lineBreakpoints) {
            if (breakpoint.enabled && comparePaths(breakpoint.file, source)) {
                if (breakpoint.condition) {
                    const mappedCondition = mapExpressionNames(breakpoint.condition, breakpoint.sourceMap);
                    const condition = `return ${mappedCondition}`;
                    topFrame = topFrame || luaAssert(debug.getinfo(debugHookStackOffset, "nSluf"));
                    const [success, result] = execute(condition, debugHookStackOffset, topFrame);
                    if (success && result) {
                        const activeThread = getActiveThread();
                        const conditionDisplay = `"${breakpoint.condition}" = "${result}"`;
                        const [breakpointFile, breakpointLine] = [
                            breakpoint.sourceFile || breakpoint.file,
                            breakpoint.sourceLine || breakpoint.line
                        ];
                        Send.debugBreak(
                            `breakpoint hit: "${breakpointFile}:${breakpointLine}", ${conditionDisplay}`,
                            "breakpoint",
                            getThreadId(activeThread)
                        );
                        debugBreak(activeThread, debugHookStackOffset, line);
                        break;
                    }
                } else {
                    const activeThread = getActiveThread();
                    const [breakpointFile, breakpointLine] = [
                        breakpoint.sourceFile || breakpoint.file,
                        breakpoint.sourceLine || breakpoint.line
                    ];
                    Send.debugBreak(
                        `breakpoint hit: "${breakpointFile}:${breakpointLine}"`,
                        "breakpoint",
                        getThreadId(activeThread)
                    );
                    debugBreak(activeThread, debugHookStackOffset, line);
                    break;
                }
            }
        }
    }

    //Convert source paths to mapped
    function mapSource(indent: string, file: string, lineStr: string, remainder: string) {
        file = Path.format(file);
        const sourceMap = SourceMap.get(file);
        if (sourceMap) {
            const line = luaAssert(tonumber(lineStr));
            const lineMapping = sourceMap.mappings[line];
            if (lineMapping) {
                const sourceFile = sourceMap.sources[lineMapping.sourceIndex];
                const sourceLine = lineMapping.sourceLine;
                const sourceColumn = lineMapping.sourceColumn;
                return `${indent}${sourceFile}:${sourceLine}:${sourceColumn}:${remainder}`;
            }
        }
        return `${indent}${file}:${lineStr}:${remainder}`;
    }

    function mapSources(str: string) {
        [str] = str.gsub("(%s*)([^\r\n]+):(%d+):([^\r\n]+)", mapSource);
        return str;
    }

    function breakForError(err: unknown, level: number, propagate: true): never;
    function breakForError(err: unknown, level?: number, propagate?: false): void;
    function breakForError(err: unknown, level?: number, propagate?: boolean) {
        const message = mapSources(tostring(err));
        level = (level ?? 1) + 1;

        if (skipNextBreak) {
            skipNextBreak = false;

        } else if (!inDebugBreak) {
            const thread = getActiveThread();
            Send.debugBreak(message, "error", getThreadId(thread));
            debugBreak(thread, level);
        }

        if (propagate) {
            skipNextBreak = true;
            luaError(message, level);
        }
    }

    function registerThread(thread: LuaThread) {
        assert(!threadIds.get(thread));

        const threadId = nextThreadId;
        ++nextThreadId;
        threadIds.set(thread, threadId);

        const [hook] = debug.gethook();
        if (hook === debugHook) {
            debug.sethook(thread, debugHook, "l");
        }

        return threadId;
    }

    let canYieldAcrossPcall: boolean | undefined;

    function useXpcallInCoroutine() {
        if (canYieldAcrossPcall === undefined) {
            const [_, yieldResult] = luaCoroutineResume(luaCoroutineCreate(() => pcall(() => coroutine.yield(true))));
            canYieldAcrossPcall = (yieldResult === true);
        }
        return canYieldAcrossPcall;
    }

    //coroutine.create replacement for hooking threads
    // eslint-disable-next-line @typescript-eslint/ban-types
    function debuggerCoroutineCreate(f: Function, allowBreak: boolean) {
        if (allowBreak && useXpcallInCoroutine()) {
            const originalFunc = f as DebuggableFunction;
            function debugFunc(...args: unknown[]) {
                function wrappedFunc() {
                    return originalFunc(...args);
                }
                const results = xpcall(wrappedFunc, breakForError);
                if (results[0]) {
                    return unpack(results, 2);
                } else {
                    skipNextBreak = true;
                    const message = mapSources(tostring(results[1]));
                    return luaError(message, 2);
                }
            }
            f = debugFunc;
        }
        const thread = luaCoroutineCreate(f);
        registerThread(thread);
        return thread;
    }

    function debuggerCoroutineResume(
        thread: LuaThread,
        ...args: unknown[]
    ): LuaMultiReturn<[true, ...unknown[]] | [false, string]> {
        const activeThread = getActiveThread();
        threadStackOffsets.set(activeThread, 1);
        const results = luaCoroutineResume(thread, ...args);
        if (!results[0]) {
            breakForError(results[1], 2);
        }
        threadStackOffsets.delete(activeThread);
        return results;
    }

    //coroutine.wrap replacement for hooking threads
    // eslint-disable-next-line @typescript-eslint/ban-types
    function debuggerCoroutineWrap(f: Function) {
        const thread = debuggerCoroutineCreate(f, true);
        function resumer(...args: unknown[]) {
            const activeThread = getActiveThread();
            threadStackOffsets.set(activeThread, 1);
            const results = luaCoroutineResume(thread, ...args);
            if (!results[0]) {
                breakForError(results[1], 2, true);
            }
            threadStackOffsets.delete(activeThread);
            return unpack(results, 2);
        }
        return resumer;
    }

    //debug.traceback replacement for catching errors and mapping sources
    function debuggerTraceback(
        threadOrMessage?: LuaThread | string,
        messageOrLevel?: string | number,
        level?: number
    ): string {
        let trace: string;
        if (isThread(threadOrMessage)) {
            trace = luaDebugTraceback(threadOrMessage, (messageOrLevel as string | undefined) ?? "", (level ?? 1) + 1);
        } else {
            trace = luaDebugTraceback(threadOrMessage ?? "", ((messageOrLevel as number | undefined) ?? 1) + 1);
        }
        trace = mapSources(trace);

        if (skipNextBreak) {
            skipNextBreak = false;

        //Break if debugging globally and traceback was not called manually from scripts
        } else if (hookStack[hookStack.length - 1] === HookType.Global) {
            const info = debug.getinfo(2, "S");
            if (info && info.what === "C") {
                const thread = isThread(threadOrMessage) ? threadOrMessage : getActiveThread();
                Send.debugBreak(trace, "error", getThreadId(thread));
                debugBreak(thread, 3);
            }
        }

        return trace;
    }

    //error replacement for catching errors
    function debuggerError(message: string, level?: number): never {
        breakForError(message, (level ?? 1) + 1, true);
    }

    function debuggerAssert(v: unknown, ...args: unknown[]) {
        if (!v) {
            const message = args[0] !== undefined && args[0] || "assertion failed";
            breakForError(message, 1, true);
        }
        return $multi(v, ...args);
    }

    function setErrorHandler() {
        const hookType = hookStack[hookStack.length - 1];
        if (hookType !== undefined) {
            _G.error = debuggerError;
            _G.assert = debuggerAssert;
            debug.traceback = debuggerTraceback;
        } else {
            _G.error = luaError;
            _G.assert = luaAssert;
            debug.traceback = luaDebugTraceback;
        }
    }

    updateHook = function() {
        isDebugHookDisabled = breakAtDepth < 0 && Breakpoint.getCount() === 0;
        // Do not disable debugging in luajit environment with pull breakpoints support enabled
        // or functions will be jitted and will lose debug info of lines and files
        if (isDebugHookDisabled && (_G["jit"] === null || pullFile === null)) {
            debug.sethook();

            for (const [thread] of pairs(threadIds)) {
                if (isThread(thread) && coroutine.status(thread) !== "dead") {
                    debug.sethook(thread);
                }
            }
        } else {
            debug.sethook(debugHook, "l");

            for (const [thread] of pairs(threadIds)) {
                if (isThread(thread) && coroutine.status(thread) !== "dead") {
                    debug.sethook(thread, debugHook, "l");
                }
            }
        }
    };

    export function clearHook(): void {
        while (hookStack.length > 0) {
            table.remove(hookStack);
        }

        setErrorHandler();

        coroutine.create = luaCoroutineCreate;
        coroutine.wrap = luaCoroutineWrap;
        coroutine.resume = luaCoroutineResume;

        isDebugHookDisabled = true;
        debug.sethook();

        for (const [thread] of pairs(threadIds)) {
            if (isThread(thread) && coroutine.status(thread) !== "dead") {
                debug.sethook(thread);
            }
        }
    }

    const breakInCoroutinesEnv: LuaDebug.BreakInCoroutinesEnv = "LOCAL_LUA_DEBUGGER_BREAK_IN_COROUTINES";
    const breakInCoroutines = os.getenv(breakInCoroutinesEnv) === "1";

    export function pushHook(hookType: HookType): void {
        table.insert(hookStack, hookType);

        setErrorHandler();

        if (hookStack.length > 1) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/ban-types
        coroutine.create = (f: Function) => debuggerCoroutineCreate(f, breakInCoroutines);
        coroutine.wrap = debuggerCoroutineWrap;
        coroutine.resume = breakInCoroutines ? debuggerCoroutineResume : luaCoroutineResume;

        const currentThread = coroutine.running();
        if (currentThread && !threadIds.get(currentThread)) {
            registerThread(currentThread);
        }

        updateHook();
    }

    export function popHook(): void {
        table.remove(hookStack);
        if (hookStack.length === 0) {
            clearHook();
        } else {
            setErrorHandler();
            updateHook();
        }
    }

    export function triggerBreak(): void {
        breakAtDepth = math.huge;
        updateHook();
    }

    export function debugGlobal(breakImmediately?: boolean): void {
        pushHook(HookType.Global);

        if (breakImmediately) {
            triggerBreak();
        }
    }

    export function debugFunction(
        func: DebuggableFunction,
        breakImmediately: boolean | undefined,
        args: unknown[]
    ): LuaMultiReturn<unknown[]> {
        pushHook(HookType.Function);

        if (breakImmediately) {
            triggerBreak();
        }

        const results = xpcall(() => func(...args), breakForError);
        popHook();
        if (results[0]) {
            return unpack(results, 2);
        } else {
            skipNextBreak = true;
            const message = mapSources(tostring(results[1]));
            return luaError(message, 2);
        }
    }

    export function pullBreakpoints(): void {
        if (pullFile) {
            const newPullSeek = pullFile.seek("end")[0] as number;
            if (newPullSeek > lastPullSeek) {
                lastPullSeek = newPullSeek;
                triggerBreak();
            }
        }
    }
}
