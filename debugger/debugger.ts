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
    [name: string]: Var;
}

export interface Local extends Var {
    index: number;
}

export interface Locals {
    [name: string]: Local;
}

export namespace Debugger {
    /** @tupleReturn */
    export interface DebuggableFunction {
        (this: void, ...args: unknown[]): unknown[];
    }

    const prompt = "";
    const debuggerName = "lldebugger.lua";
    const builtinFunctionPrefix = "[builtin:";

    let skipBreakInNextTraceback = false;

    const enum HookType {
        Global = "global",
        Function = "function"
    }
    const hookStack: HookType[] = [];

    const threadIds = setmetatable(new LuaTable<Thread, number>(), {__mode: "k"});
    const mainThreadId = 1;
    threadIds.set(mainThread, mainThreadId);
    let nextThreadId = mainThreadId + 1;

    function getThreadId(thread: Thread) {
        return luaAssert(threadIds.get(thread));
    }

    function backtrace(stack: debug.FunctionInfo[], frameIndex: number) {
        const frames: LuaDebug.Frame[] = [];
        for (const i of forRange(0, stack.length - 1)) {
            const info = stack[i];
            const frame: LuaDebug.Frame = {
                source: info.source && Path.format(info.source) || "?",
                line: info.currentline && luaAssert(tonumber(info.currentline)) || -1
            };
            if (info.source && info.currentline) {
                const sourceMap = SourceMap.get(frame.source);
                if (sourceMap) {
                    const lineMapping = sourceMap[frame.line];
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
            }
            if (i === frameIndex) {
                frame.active = true;
            }
            table.insert(frames, frame);
        }
        Send.frames(frames);
    }

    function getLocals(level: number, thread: Thread): Locals {
        const locs: Locals = {};

        //Validate level
        if (isThread(thread)) {
            if (!debug.getinfo(thread, level, "l")) {
                return locs;
            }
        } else if (!debug.getinfo(level, "l")) {
            return locs;
        }

        if (coroutine.running() !== undefined && !isThread(thread)) {
            return locs; // Accessing locals for main thread, but we're in a coroutine right now
        }

        let name: string | undefined;
        let val: unknown;

        //Standard locals
        let index = 1;
        while (true) {
            if (isThread(thread)) {
                [name, val] = debug.getlocal(thread, level, index);
            } else {
                [name, val] = debug.getlocal(level, index);
            }
            if (!name) {
                break;
            }

            const [invalidChar] = name.match("[^a-zA-Z0-9_]");
            if (!invalidChar) {
                locs[name] = {val, index, type: type(val)};
            }

            ++index;
        }

        //Varargs
        index = -1;
        while (true) {
            if (isThread(thread)) {
                [name, val] = debug.getlocal(thread, level, index);
            } else {
                [name, val] = debug.getlocal(level, index);
            }
            if (!name) {
                break;
            }

            [name] = name.gsub("[^a-zA-Z0-9_]+", "_");
            let key = `${name}_${-index}`;
            while (locs[key]) {
                key = key + "_";
            }
            locs[key] = {val, index, type: type(val)};

            --index;
        }

        return locs;
    }

    function getUpvalues(info: debug.FunctionInfo): Locals {
        const ups: Locals = {};

        if (!info.nups || !info.func) {
            return ups;
        }

        for (const index of forRange(1, info.nups)) {
            const [name, val] = debug.getupvalue(info.func, index);
            ups[luaAssert(name)] = {val, index, type: type(val)};
        }

        return ups;
    }

    function populateGlobals(globs: Vars, tbl: Record<string, unknown>, metaStack: LuaTable<unknown, boolean>) {
        metaStack.set(tbl, true);

        const meta = getmetatable(tbl) as Record<string, unknown> | undefined;
        if (meta !== undefined && type(meta.__index) === "table" && metaStack.get(meta) === undefined) {
            populateGlobals(globs, meta.__index as Record<string, unknown>, metaStack);
        }

        for (const [key, val] of pairs(tbl)) {
            const name = tostring(key);
            globs[name] = {val, type: type(val)};
        }
    }

    function getGlobals(level: number, thread: Thread): Vars {
        const globs: Vars = {};
        const fenv = luaGetEnv(level, isThread(thread) && thread || undefined) || _G;
        const metaStack = new LuaTable<unknown, boolean>();
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
            delete vars[name];
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
                const [illegalChar] = sourceName.match("[^A-Za-z0-9_]");
                if (illegalChar) {
                    return `["${sourceName}"]`;
                } else {
                    return `.${sourceName}`;
                }
            } else {
                return luaAssert(sourceMap).luaNames[sourceName] || sourceName;
            }
        }

        let inQuote: string | undefined;
        let isEscaped = false;
        let nameStart: number | undefined;
        let nameIsProperty = false;
        let nonNameStart = 1;
        let mappedExpression = "";
        for (const i of forRange(1, expression.length)) {
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
                    mappedExpression += expression.sub(nonNameStart, nameStart - (nameIsProperty && 2 || 1));
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

    /** @tupleReturn */
    function execute(
        statement: string,
        thread: Thread,
        frame: number,
        frameOffset: number,
        info: debug.FunctionInfo
    ): [true, unknown] | [false, string] {
        const activeThread = coroutine.running();
        if (activeThread && !isThread(thread)) {
            return [false, "unable to access main thread while running in a coroutine"];
        }

        const level = (thread === (activeThread || mainThread)) && (frame + frameOffset + 1) || frame;
        const locs = getLocals(level + 1, thread);
        const ups = getUpvalues(info);
        const fenv = luaGetEnv(level, isThread(thread) && thread || undefined) || _G;
        const env = setmetatable(
            {},
            {
                __index(this: unknown, name: string) {
                    const variable = locs[name] || ups[name];
                    if (variable !== undefined) {
                        return variable.val;
                    } else {
                        return fenv[name];
                    }
                },
                __newindex(this: unknown, name: string, val: unknown) {
                    const variable = locs[name] || ups[name];
                    if (variable !== undefined) {
                        variable.type = type(val);
                        variable.val = val;
                    } else {
                        fenv[name] = val;
                    }
                }
            }
        );

        const [func, err] = loadLuaString(statement, env);
        if (!func) {
            return [false, err as string];
        }

        const [success, result] = pcall(func);
        if (success) {
            for (const [_, loc] of pairs(locs)) {
                if (isThread(thread)) {
                    debug.setlocal(thread, level, loc.index, loc.val);
                } else {
                    debug.setlocal(level, loc.index, loc.val);
                }
            }
            for (const [_, up] of pairs(ups)) {
                debug.setupvalue(luaAssert(info.func), up.index, up.val);
            }
        }
        return [success as true, result];
    }

    function getInput() {
        if (prompt.length > 0) {
            io.write(prompt);
        }
        const inp = io.read("*l");
        return inp;
    }

    function getStack(threadOrOffset: LuaThread | number) {
        let thread: LuaThread | undefined;
        let i = 1;
        if (isThread(threadOrOffset)) {
            thread = threadOrOffset;
        } else {
            i += threadOrOffset;
        }
        const stack: debug.FunctionInfo[] = [];
        while (true) {
            let stackInfo: debug.FunctionInfo;
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

    function debugBreak(activeThread: Thread, stackOffset: number) {
        ++stackOffset;
        const activeStack = getStack(stackOffset);

        const activeThreadFrameOffset = stackOffset;
        const inactiveThreadFrameOffset = 0;

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
                    ["thread n", "set current thread by id"]
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
                        frameOffset = currentThread === activeThread
                            && activeThreadFrameOffset
                            || inactiveThreadFrameOffset;
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
                    if (newFrame !== undefined && newFrame > 0 && newFrame <= currentStack.length) {
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
                const locs = getLocals(frame + frameOffset + 1, currentThread);
                mapVarNames(locs, sourceMap);
                Send.vars(locs);

            } else if (inp === "ups") {
                const ups = getUpvalues(info);
                mapVarNames(ups, sourceMap);
                Send.vars(ups);

            } else if (inp === "globals") {
                const globs = getGlobals(frame + frameOffset + 1, currentThread);
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
                    const [s, r] = execute("return " + mappedExpression, currentThread, frame, frameOffset, info);
                    if (s) {
                        Send.result(r);
                    } else {
                        Send.error(r as string);
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
                    const [s, r] = execute("return " + mappedExpression, currentThread, frame, frameOffset, info);
                    if (s) {
                        if (typeof r === "object") {
                            Send.props(r as object, kind, tonumber(first), tonumber(count));
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
                    const [s, r] = execute(statement, currentThread, frame, frameOffset, info);
                    if (s) {
                        Send.result(r);
                    } else {
                        Send.error(r as string);
                    }
                }

            } else {
                Send.error("Bad command");
            }
        }

        return true; //Resume execution immediately without checking breakpoints
    }

    function comparePaths(a: string, b: string) {
        const aLen = a.length;
        const bLen = b.length;
        if (aLen === bLen) {
            return a === b;
        } else if (aLen < bLen) {
            return Path.separator + a === b.sub(-(aLen + 1));
        } else {
            return Path.separator + b === a.sub(-(bLen + 1));
        }
    }

    function checkBreakpoint(breakpoint: LuaDebug.Breakpoint, file: string, line: number, sourceMap?: SourceMap) {
        if (breakpoint.line === line && comparePaths(breakpoint.file, file)) {
            return true;
        }
        if (sourceMap) {
            const lineMapping = sourceMap[line];
            if (lineMapping && lineMapping.sourceLine === breakpoint.line) {
                const sourceMapFile = sourceMap.sources[lineMapping.sourceIndex];
                if (sourceMapFile) {
                    return comparePaths(breakpoint.file, sourceMapFile);
                }
            }
        }
        return false;
    }

    function debugHook(event: "call" | "return" | "tail return" | "count" | "line", line?: number) {
        const stackOffset = 2;

        //Ignore debugger code
        const topFrame = debug.getinfo(stackOffset, "nSluf");
        if (!topFrame || !topFrame.source || topFrame.source.sub(-debuggerName.length) === debuggerName) {
            return;
        }

        //Ignore builtin lua functions (luajit)
        if (topFrame.short_src && topFrame.short_src.sub(1, builtinFunctionPrefix.length) === builtinFunctionPrefix) {
            return;
        }

        const activeThread = coroutine.running() || mainThread;

        //Stepping
        if (breakAtDepth >= 0) {
            let stepBreak: boolean;
            if (!breakInThread) {
                stepBreak = true;
            } else if (activeThread === breakInThread) {
                stepBreak = getStack(stackOffset).length <= breakAtDepth;
            } else {
                stepBreak = breakInThread !== mainThread && coroutine.status(breakInThread as LuaThread) === "dead";
            }
            if (stepBreak) {
                Send.debugBreak("step", "step", getThreadId(activeThread));
                if (debugBreak(activeThread, stackOffset)) {
                    return;
                }
            }
        }

        //Breakpoints
        const breakpoints = Breakpoint.getAll();
        if (!topFrame.currentline || breakpoints.length === 0) {
            return;
        }

        const source = Path.format(luaAssert(topFrame.source));
        const sourceMap = SourceMap.get(source);
        for (const breakpoint of breakpoints) {
            if (breakpoint.enabled && checkBreakpoint(breakpoint, source, topFrame.currentline, sourceMap)) {
                if (breakpoint.condition) {
                    const mappedCondition = mapExpressionNames(breakpoint.condition, sourceMap);
                    const condition = "return " + mappedCondition;
                    const [success, result] = execute(condition, activeThread, 0, stackOffset, topFrame);
                    if (success && result) {
                        const conditionDisplay = `"${breakpoint.condition}" = "${result}"`;
                        Send.debugBreak(
                            `breakpoint hit: "${breakpoint.file}:${breakpoint.line}", ${conditionDisplay}`,
                            "breakpoint",
                            getThreadId(activeThread)
                        );
                        debugBreak(activeThread, stackOffset);
                        break;
                    }
                } else {
                    Send.debugBreak(
                        `breakpoint hit: "${breakpoint.file}:${breakpoint.line}"`,
                        "breakpoint",
                        getThreadId(activeThread)
                    );
                    debugBreak(activeThread, stackOffset);
                    break;
                }
            }
        }
    }

    //Convert source paths to mapped
    function mapSource(indent: string, file: string, lineStr: string, remainder: string) {
        const sourceMap = SourceMap.get(file);
        if (sourceMap) {
            const line = luaAssert(tonumber(lineStr));
            const lineMapping = sourceMap[line];
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

    //coroutine.create replacement for hooking threads
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

    function debuggerCoroutineCreate(f: Function) {
        const thread = luaCoroutineCreate(f);
        registerThread(thread);
        return thread;
    }

    //coroutine.wrap replacement for hooking threads
    function debuggerCoroutineWrap(f: Function) {
        const thread = debuggerCoroutineCreate(f);
        /** @tupleReturn */
        const resumer = (...args: LuaVarArg<unknown[]>) => {
            const results = coroutine.resume(thread, ...args);
            if (!results[0]) {
                luaError(results[1]);
            }
            return unpack(results, 2);
        };
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
            trace = luaDebugTraceback(threadOrMessage, (messageOrLevel as string) || "", (level || 1) + 1);
        } else {
            trace = luaDebugTraceback(threadOrMessage || "", ((messageOrLevel as number) || 1) + 1);
        }
        if (trace) {
            trace = mapSources(trace);
        }

        if (skipBreakInNextTraceback) {
            skipBreakInNextTraceback = false;

        //Break if debugging globally and traceback was not called manually from scripts
        } else if (
            hookStack[hookStack.length - 1] === HookType.Global
            && debug.getinfo(2, "S").what === "C"
        ) {
            const thread = isThread(threadOrMessage) && threadOrMessage || coroutine.running() || mainThread;
            Send.debugBreak(trace || "error", "error", getThreadId(thread));
            debugBreak(thread, 3);
        }

        return trace;
    }

    //error replacement for catching errors
    function debuggerError(message: string, level?: number) {
        message = mapSources(message);
        const thread = coroutine.running() || mainThread;
        Send.debugBreak(message, "error", getThreadId(thread));
        debugBreak(thread, 2);
        skipBreakInNextTraceback = true;
        return luaError(message, level);
    }

    /** @tupleReturn */
    function debuggerAssert(v: unknown, ...args: LuaVarArg<unknown[]>) {
        if (!v) {
            const message = args[0] !== undefined && mapSources(tostring(args[0])) || "assertion failed";
            const thread = coroutine.running() || mainThread;
            Send.debugBreak(message, "error", getThreadId(thread));
            debugBreak(thread, 2);
            skipBreakInNextTraceback = true;
            return luaError(message);
        }
        return [v, ...args];
    }

    function setErrorHandler() {
        const hookType = hookStack[hookStack.length - 1];
        if (hookType === HookType.Global) {
            _G.error = debuggerError;
            _G.assert = debuggerAssert;
        } else {
            _G.error = luaError;
            _G.assert = luaAssert;
        }
        if (hookType !== undefined) {
            debug.traceback = debuggerTraceback;
        } else {
            debug.traceback = luaDebugTraceback;
        }
    }

    export function clearHook() {
        while (hookStack.length > 0) {
            table.remove(hookStack);
        }

        setErrorHandler();

        coroutine.create = luaCoroutineCreate;
        coroutine.wrap = luaCoroutineWrap;

        debug.sethook();

        for (const [thread] of pairs(threadIds)) {
            if (isThread(thread) && coroutine.status(thread) !== "dead") {
                debug.sethook(thread);
            }
        }
    }

    export function pushHook(hookType: HookType) {
        table.insert(hookStack, hookType);

        setErrorHandler();

        if (hookStack.length > 1) {
            return;
        }

        coroutine.create = debuggerCoroutineCreate;
        coroutine.wrap = debuggerCoroutineWrap;

        const currentThread = coroutine.running();
        if (currentThread && !threadIds.get(currentThread)) {
            registerThread(currentThread);
        }

        debug.sethook(debugHook, "l");

        for (const [thread] of pairs(threadIds)) {
            if (isThread(thread) && coroutine.status(thread) !== "dead") {
                debug.sethook(thread, debugHook, "l");
            }
        }
    }

    export function popHook() {
        table.remove(hookStack);
        if (hookStack.length === 0) {
            clearHook();
        } else {
            setErrorHandler();
        }
    }

    export function triggerBreak() {
        breakAtDepth = math.huge;
    }

    export function debugGlobal(breakImmediately?: boolean) {
        Debugger.pushHook(HookType.Global);

        if (breakImmediately) {
            Debugger.triggerBreak();
        }
    }

    function onError(err: unknown) {
        const msg = mapSources(tostring(err));
        const thread = coroutine.running() || mainThread;
        Send.debugBreak(msg, "error", getThreadId(thread));
        debugBreak(thread, 2);
    }

    /** @tupleReturn */
    export function debugFunction(func: DebuggableFunction, breakImmediately: boolean | undefined, args: unknown[]) {
        Debugger.pushHook(HookType.Function);

        if (breakImmediately) {
            Debugger.triggerBreak();
        }

        const [success, results] = xpcall(() => func(...args), onError);
        Debugger.popHook();
        if (success) {
            return results;
        }
    }
}
