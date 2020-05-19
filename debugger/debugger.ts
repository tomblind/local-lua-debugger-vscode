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
    interface Env {
        [name: string]: unknown;
    }

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

    // For Lua 5.2+
    /** @tupleReturn */
    declare function load(
        this: void,
        chunk: string,
        chunkname?: string,
        mode?: "b" | "t" | "bt",
        env?: Object
    ): [{ (this: void): unknown }, undefined] | [undefined, string];

    /** @tupleReturn */
    function loadCode(code: string, env?: Env): [{ (this: void): unknown }, undefined] | [undefined, string] {
        if (setfenv) {
            const [f, e] = loadstring(code, code);
            if (f && env) {
                setfenv(f, env);
            }
            return [f, e] as [{ (this: void): unknown }, undefined] | [undefined, string];

        } else {
            return load(code, code, "t", env);
        }
    }

    function backtrace(stack: debug.FunctionInfo[], frameIndex: number) {
        const frames: LuaDebug.Frame[] = [];
        for (const i of forRange(0, stack.length - 1)) {
            const info = stack[i];
            const frame: LuaDebug.Frame = {
                source: info.source && Path.format(info.source) || "?",
                line: info.currentline && assert(tonumber(info.currentline)) || -1
            };
            if (info.source && info.currentline) {
                const sourceMap = SourceMap.get(frame.source);
                if (sourceMap) {
                    const lineMapping = sourceMap[frame.line];
                    if (lineMapping) {
                        frame.mappedLocation = {
                            source: assert(sourceMap.sources[lineMapping.sourceIndex]),
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
            ups[assert(name)] = {val, index, type: type(val)};
        }

        return ups;
    }

    function getGlobals(): Vars {
        const globs: Vars = {};
        for (const [key, val] of pairs(_G)) {
            const name = tostring(key);
            globs[name] = {val, type: type(val)};
        }
        return globs;
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
        const env = setmetatable(
            {},
            {
                __index(this: unknown, name: string) {
                    const variable = locs[name] || ups[name];
                    if (variable !== undefined) {
                        return variable.val;
                    } else {
                        return _G[name];
                    }
                },
                __newindex(this: unknown, name: string, val: unknown) {
                    const variable = locs[name] || ups[name];
                    if (variable !== undefined) {
                        variable.type = type(val);
                        variable.val = val;
                    } else {
                        _G[name] = val;
                    }
                }
            }
        );

        const [func, err] = loadCode(statement, env);
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
                debug.setupvalue(assert(info.func), up.index, up.val);
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
        let info = assert(currentStack[frame]);
        while (true) {
            const inp = getInput();
            if (!inp || inp === "quit") {
                os.exit(0);

            } else if (inp === "cont" || inp === "continue") {
                break;

            } else if (inp === "help") {
                Send.help(
                    ["help", "show available commands"],
                    ["cont|continue", "continue execution"],
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
                    const newThreadId = assert(tonumber(newThreadIdStr));
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
                        info = assert(currentStack[frame]);
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
                    const newFrame = assert(tonumber(newFrameStr));
                    if (newFrame !== undefined && newFrame > 0 && newFrame <= currentStack.length) {
                        frame = newFrame - 1;
                        info = assert(currentStack[frame]);
                        backtrace(currentStack, frame);
                    } else {
                        Send.error("Bad frame");
                    }
                } else {
                    Send.error("Bad frame");
                }

            } else if (inp === "locals") {
                const locs = getLocals(frame + frameOffset + 1, currentThread);
                Send.vars(locs);

            } else if (inp === "ups") {
                const ups = getUpvalues(info);
                Send.vars(ups);

            } else if (inp === "globals") {
                const globs = getGlobals();
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
                        line = assert(tonumber(lineStr));
                        breakpoint = Breakpoint.get(file, line);
                    }
                }
                if (cmd === "set") {
                    if (file !== undefined && line !== undefined) {
                        const [condition] = inp.match("^break%s+[a-z]+%s+.-:%d+%s+(.+)");
                        Breakpoint.add(file, line, condition);
                        breakpoint = assert(Breakpoint.get(file, line));
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
                    const [s, r] = execute("return " + expression, currentThread, frame, frameOffset, info);
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
                    const [s, r] = execute("return " + expression, currentThread, frame, frameOffset, info);
                    if (s) {
                        if (typeof r === "object") {
                            Send.props(r as object, kind, tonumber(first), tonumber(count));
                        } else {
                            Send.error(`Expression "${expression}" is not a table`);
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

        breakPointLines = Breakpoint.getLines();
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

    function isIgnoreStepBreak(topFrame: debug.FunctionInfo): boolean {
        //Ignore debugger code
        if (!topFrame || !topFrame.source || topFrame.source.sub(-debuggerName.length) === debuggerName) {
            return true;
        }

        //Ignore builtin lua functions (luajit)
        if (topFrame.short_src && topFrame.short_src.sub(1, builtinFunctionPrefix.length) === builtinFunctionPrefix) {
            return true;
        }

        return false;
    }

    function stepHook(event: "call" | "return" | "tail return" | "count" | "line", line?: number) {
        const stackOffset = 2;
        const topFrame = debug.getinfo(stackOffset, "nSluf");
        const activeThread = coroutine.running() || mainThread;

        //Stepping
        if (breakAtDepth >= 0 && !isIgnoreStepBreak(topFrame)) {
            let stepBreak: boolean;
            if (!breakInThread) {
                stepBreak = true;
            } else if (activeThread === breakInThread) {
                stepBreak = getStack(stackOffset).length <= breakAtDepth;
            } else {
                stepBreak = breakInThread !== mainThread && coroutine.status(breakInThread as LuaThread) === "dead";
            }
            if (stepBreak) {
                Send.debugBreak("step", "step", assert(threadIds.get(activeThread)));
                debugBreak(activeThread, stackOffset);
                return;
            }
        }

        runhook(event, line);
    }

    function runhook(event: "call" | "return" | "tail return" | "count" | "line", line?: number) {
        const stackOffset = 2;
        const topFrame = debug.getinfo(stackOffset, "nSluf");
        const activeThread = coroutine.running() || mainThread;

        //Breakpoints
        const breakpoints = Breakpoint.getAll();
        if (!topFrame.currentline || breakpoints.length === 0) {
            return;
        }

        const source = Path.format(assert(topFrame.source));
        const sourceMap = SourceMap.get(source);
        for (const breakpoint of breakpoints) {
            if (breakpoint.enabled && checkBreakpoint(breakpoint, source, topFrame.currentline, sourceMap)) {
                if (breakpoint.condition) {
                    const condition = "return " + breakpoint.condition;
                    const [success, result] = execute(condition, activeThread, 0, stackOffset, topFrame);
                    if (success && result) {
                        const conditionDisplay = `"${breakpoint.condition}" = "${result}"`;
                        Send.debugBreak(
                            `breakpoint hit: "${breakpoint.file}:${breakpoint.line}", ${conditionDisplay}`,
                            "breakpoint",
                            assert(threadIds.get(activeThread))
                        );
                        debugBreak(activeThread, stackOffset);
                        break;
                    }
                } else {
                    Send.debugBreak(
                        `breakpoint hit: "${breakpoint.file}:${breakpoint.line}"`,
                        "breakpoint",
                        assert(threadIds.get(activeThread))
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
            const line = assert(tonumber(lineStr));
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
    const luaCoroutineCreate = coroutine.create;

    function debuggerCoroutineCreate(f: Function) {
        const thread = luaCoroutineCreate(f);
        threadIds.set(thread, nextThreadId);
        ++nextThreadId;
        const [hook] = debug.gethook();
        if (hook === runhook) {
            debug.sethook(thread, runhook, "l");
        }
        return thread;
    }

    //coroutine.wrap replacement for hooking threads
    const luaCoroutineWrap = coroutine.wrap;

    function debuggerCoroutineWrap(f: Function) {
        const thread = debuggerCoroutineCreate(f);
        /** @tupleReturn */
        const resumer = (...args: LuaVarArg<unknown[]>) => {
            const results = coroutine.resume(thread, ...args);
            if (!results[0]) {
                throw results[1];
            }
            return unpack(results, 2);
        };
        return resumer;
    }

    //debug.traceback replacement for catching errors
    const luaDebugTraceback = debug.traceback;

    function debuggerTraceback(
        threadOrMessage?: LuaThread | string,
        messageOrLevel?: string | number,
        level?: number
    ): string {
        let trace = luaDebugTraceback(threadOrMessage as LuaThread, messageOrLevel as string, level as number);
        if (trace) {
            trace = mapSources(trace);
        }

        if (skipBreakInNextTraceback) {
            skipBreakInNextTraceback = false;
        } else {
            const thread = isThread(threadOrMessage) && threadOrMessage || coroutine.running() || mainThread;
            Send.debugBreak(trace || "error", "error", assert(threadIds.get(thread)));
            debugBreak(thread, 3);
        }

        return trace;
    }

    //error replacement for catching errors
    const luaError = error;

    function debuggerError(message: string, level?: number) {
        message = mapSources(message);
        const thread = coroutine.running() || mainThread;
        Send.debugBreak(message, "error", assert(threadIds.get(thread)));
        debugBreak(thread, 2);
        skipBreakInNextTraceback = true;
        return luaError(message, level);
    }

    const luaAssert = assert;

    /** @tupleReturn */
    function debuggerAssert(v: unknown, ...args: LuaVarArg<unknown[]>) {
        if (!v) {
            const message = args[0] !== undefined && mapSources(tostring(args[0])) || "assertion failed";
            const thread = coroutine.running() || mainThread;
            Send.debugBreak(message, "error", assert(threadIds.get(thread)));
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
            debug.traceback = debuggerTraceback;
        } else {
            _G.error = luaError;
            _G.assert = luaAssert;
            debug.traceback = luaDebugTraceback;
        }
    }

    function setHook(hook?: debug.Hook) {
        if (!!hook) {
            debug.sethook(hook, "l");
        } else {
            debug.sethook();
        }

        for (const [thread] of pairs(threadIds)) {
            if (isThread(thread) && coroutine.status(thread) !== "dead") {
                if (!!hook) {
                    debug.sethook(thread, hook, "l");
                } else {
                    debug.sethook(thread);
                }
            }
        }
    }

    export function clearHook() {
        while (hookStack.length > 0) {
            table.remove(hookStack);
        }

        setErrorHandler();

        coroutine.create = luaCoroutineCreate;
        coroutine.wrap = luaCoroutineWrap;

        setHook();
    }

    export function pushHook(hookType: HookType) {
        table.insert(hookStack, hookType);

        setErrorHandler();

        if (hookStack.length > 1) {
            return;
        }

        coroutine.create = debuggerCoroutineCreate;
        coroutine.wrap = debuggerCoroutineWrap;

        setHook(runhook);
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
        Send.debugBreak(msg, "error", assert(threadIds.get(thread)));
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
