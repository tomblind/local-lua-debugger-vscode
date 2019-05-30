/** @noSelfInFile */

interface Var {
    val: unknown;
    type: string;
}

interface Vars {
    [name: string]: Var;
}

interface Local extends Var {
    index: number;
}

interface Locals {
    [name: string]: Local;
}

interface LuaTypeMap {
    nil: undefined;
    number: number;
    string: string;
    boolean: boolean;
    table: object;
    function: Function;
    thread: LuaThread;
    userdata: LuaUserData;
}

/** @luaTable */
declare class LuaTable<K, V> {
    public readonly length: number;
    public get(key: K): V | undefined;
    public set(key: K, value: V | undefined): void;
}

/** @luaIterator @tupleReturn */
declare interface LuaTableIterable<K, V> extends Array<[K, V]> {}

declare function pairs<K, V>(this: void, t: LuaTable<K, V>): LuaTableIterable<K, V>;
declare function pairs<T extends object>(this: void, t: T): LuaPairsIterable<T>;

function isType<T extends keyof LuaTypeMap>(val: unknown, luaTypeName: T): val is LuaTypeMap[T] {
    return type(val) === luaTypeName;
}

type Thread = LuaThread | typeof mainThreadName;

const mainThreadName = "main thread" as const;
let mainThread: Thread;
{
    const LUA_RIDX_MAINTHREAD = 1;
    const registryMainThread = debug.getregistry()[LUA_RIDX_MAINTHREAD];
    mainThread = isType(registryMainThread, "thread") && registryMainThread || mainThreadName;
}

namespace Path {
    export const separator = (function() {
        const config = (_G.package as typeof _G["package"] & Record<"config", string>).config;
        if (config) {
            const [sep] = config.match("^[^\n]+");
            if (sep) {
                return sep;
            }
        }
        return "/";
    })();

    let cwd: string | undefined;

    export function getCwd() {
        if (!cwd) {
            const [p] = io.popen(separator === "\\" && "cd" || "pwd");
            cwd = p && p.read("*a") || "";
        }
        return cwd;
    }

    /** @tupleReturn */
    export function splitDrive(path: string) {
        let [drive, pathPart] = path.match(`^[@=]?([a-zA-Z]:[\\/])(.*)`);
        if (drive) {
            drive = drive.upper();
        } else {
            [drive, pathPart] = path.match(`^[@=]?([\\/]*)(.*)`);
        }
        return [assert(drive), assert(pathPart)];
    }

    const formattedPathCache: Record<string, string> = {};

    export function format(path: string) {
        let formattedPath = formattedPathCache[path];
        if (!formattedPath) {
            const [drive, pathOnly] = splitDrive(path);
            const pathParts: string[] = [];
            for (const [part] of assert(pathOnly).gmatch("[^\\/]+")) {
                if (part !== ".") {
                    if (part === ".." && pathParts.length > 0 && pathParts[pathParts.length - 1] !== "..") {
                        table.remove(pathParts);
                    } else {
                        table.insert(pathParts, part);
                    }
                }
            }
            formattedPath = `${drive}${table.concat(pathParts, separator)}`;
            formattedPathCache[path] = formattedPath;
        }
        return formattedPath;
    }

    export function isAbsolute(path: string) {
        const [drive] = splitDrive(path);
        return drive.length > 0;
    }

    export function getAbsolute(path: string) {
        if (isAbsolute(path)) {
            return format(path);
        }
        return format(`${getCwd()}${separator}${path}`);
    }
}

namespace Breakpoint {
    let current: LuaDebug.Breakpoint[] = [];

    export function get(file: string, line: number): LuaDebug.Breakpoint | undefined {
        file = Path.format(file);
        for (const [_, breakpoint] of ipairs(current)) {
            if (breakpoint.file === file && breakpoint.line === line) {
                return breakpoint;
            }
        }
        return undefined;
    }

    export function getAll(): LuaDebug.Breakpoint[] {
        return current;
    }

    export function add(file: string, line: number) {
        table.insert(current, {file: Path.format(file), line, enabled: true});
    }

    export function remove(file: string, line: number) {
        file = Path.format(file);
        for (const [i, breakpoint] of ipairs(current)) {
            if (breakpoint.file === file && breakpoint.line === line) {
                table.remove(current, i);
                break;
            }
        }
    }

    export function clear() {
        current = [];
    }
}

interface SourceLineMapping {
    sourceIndex: number;
    sourceLine: number;
    sourceColumn: number;
}

interface SourceMap {
    [line: number]: SourceLineMapping | undefined;
    sources: string[];
}

namespace SourceMap
{
    const cache: { [file: string]: SourceMap | false | undefined } = {};

    const base64Lookup: { [char: string]: number } = {
        A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7,
        I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15,
        Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23,
        Y: 24, Z: 25, a: 26, b: 27, c: 28, d: 29, e: 30, f: 31,
        g: 32, h: 33, i: 34, j: 35, k: 36, l: 37, m: 38, n: 39,
        o: 40, p: 41, q: 42, r: 43, s: 44, t: 45, u: 46, v: 47,
        // tslint:disable-next-line:object-literal-key-quotes
        w: 48, x: 49, y: 50, z: 51, "0": 52, "1": 53, "2": 54, "3": 55,
        // tslint:disable-next-line:object-literal-key-quotes
        "4": 56, "5": 57, "6": 58, "7": 59, "8": 60, "9": 61, "+": 62, "/": 63,
        "=": 0
    };

    function base64Decode(input: string) {
        const results: string[] = [];
        const bits: boolean[] = [];
        for (const [c] of input.gmatch(".")) {
            let sextet = assert(base64Lookup[c]);
            for (let i = 0; i < 6; ++i) {
                const bit = sextet % 2 !== 0;
                table.insert(bits, i + 1, bit);
                sextet = math.floor(sextet / 2);
            }
            if (bits.length >= 8) {
                let value = 0;
                for (let i = 7; i >= 0; --i) {
                    const bit = table.remove(bits);
                    if (bit === true) {
                        value += (2 ** i);
                    }
                }
                table.insert(results, string.char(value));
            }
        }
        return table.concat(results);
    }

    function decodeBase64VLQ(input: string) {
        const values: number[] = [];
        let bits: boolean[] = [];
        for (const [c] of input.gmatch(".")) {
            let sextet = assert(base64Lookup[c]);
            for (let i = 0; i < 5; ++i) {
                const bit = sextet % 2 !== 0;
                table.insert(bits, bit);
                sextet = math.floor(sextet / 2);
            }
            const continueBit = sextet % 2 !== 0;
            if (!continueBit) {
                let value = 0;
                for (let i = 1; i < bits.length; ++i) {
                    if (bits[i]) {
                        value += (2 ** (i - 1));
                    }
                }
                if (bits[0]) {
                    value = -value;
                }
                table.insert(values, value);
                bits = [];
            }
        }
        return values;
    }

    function build(data: string) {
        const [sources] = data.match('"sources"%s*:%s*(%b[])');
        const [mappings] = data.match('"mappings"%s*:%s*"([^"]+)"');
        const [sourceRoot] = data.match('"sourceRoot"%s*:%s*"([^"]+)"');
        if (!mappings || !sources) {
            return undefined;
        }

        const sourceMap: SourceMap = {sources: []};

        for (let [source] of sources.gmatch('"([^"]+)"')) {
            if (sourceRoot) {
                source = `${sourceRoot}${Path.separator}${source}`;
            }
            table.insert(sourceMap.sources, Path.getAbsolute(source));
        }

        let line = 1;
        let sourceIndex = 0;
        let sourceLine = 1;
        let sourceColumn = 1;
        for (const [mapping, separator] of mappings.gmatch("([^;,]*)([;,]?)")) {
            const [colOffset, sourceOffset, sourceLineOffset, sourceColOffset] = decodeBase64VLQ(mapping);
            sourceIndex += (sourceOffset || 0);
            sourceLine += (sourceLineOffset || 0);
            sourceColumn += (sourceColOffset || 0);

            const lineMapping = sourceMap[line];
            if (!lineMapping
                || sourceLine < lineMapping.sourceLine
                || (sourceLine === lineMapping.sourceLine && sourceColumn < lineMapping.sourceColumn)
            ) {
                sourceMap[line] = {sourceIndex, sourceLine, sourceColumn};
            }

            if (separator === ";") {
                ++line;
            }
        }

        // let s = "";
        // for (const [l, m] of pairs(sourceMap)) {
        //     const mapping = m as unknown as SourceLineMapping;
        //     if (isType(l, "number")) {
        //         s += `${l} -> ${sourceMap.sources[mapping.sourceIndex]}:${mapping.sourceLine}:${mapping.sourceColumn}\n`;
        //     }
        // }
        // print(s);

        return sourceMap;
    }

    export function get(file: string): SourceMap | undefined {
        if (file === "[C]") {
            return undefined;
        }

        let sourceMap = cache[file];

        if (sourceMap === undefined) {
            sourceMap = false;

            //Look for map file
            const mapFile = file + ".map";
            let [f] = io.open(mapFile);
            if (f) {
                const data = f.read("*a");
                f.close();
                sourceMap = build(data) || false;

            //Look for inline map
            } else {
                [f] = io.open(file);
                if (f) {
                    const data = f.read("*a");
                    f.close();
                    const [encodedMap] = data.match(
                        "--# sourceMappingURL=data:application/json;base64,([A-Za-z0-9+/=]+)%s*$"
                    );
                    if (encodedMap) {
                        const map = base64Decode(encodedMap);
                        sourceMap = build(map) || false;
                    }
                }
            }

            cache[file] = sourceMap;
        }

        return sourceMap || undefined;
    }
}

namespace Format {
    export const arrayTag = {} as "$arrayTag";

    export interface ExplicitArray {
        [arrayTag]?: boolean;
    }

    export function makeExplicitArray<T = unknown>(arr: T[] = []) {
        (arr as ExplicitArray)[arrayTag] = true;
        return arr;
    }

    const indentStr = "  ";

    const escapes: Record<string, string> = {
        ["\n"]: "\\n",
        ["\r"]: "\\r",
        ["\""]: "\\\"",
        ["\\"]: "\\\\",
        ["\b"]: "\\b",
        ["\f"]: "\\f",
        ["\t"]: "\\t"
    };

    let escapesPattern = "";
    for (const [e] of pairs(escapes)) {
        escapesPattern += e;
    }
    escapesPattern = `[${escapesPattern}]`;

    function transformEscape(e: string) {
        return escapes[e];
    }

    function escape(str: string) {
        const [escaped] = str.gsub(escapesPattern, transformEscape);
        return escaped;
    }

    function isArray(val: unknown) {
        if ((val as ExplicitArray)[arrayTag]) {
            return true;
        }

        const len = (val as unknown[]).length;
        if (len === 0) {
            return false;
        }

        for (const [k] of pairs(val as object)) {
            if (!isType(k, "number") || k > len) {
                return false;
            }
        }
        return true;
    }

    export function asJson(val: unknown, indent = 0, tables?: LuaTable<unknown, boolean>) {
        tables = tables || new LuaTable();

        const valType = type(val);
        if (valType === "table" && !tables.get(val)) {
            tables.set(val, true);

            if (isArray(val)) {
                const arrayVals: string[] = [];
                for (const [_, arrayVal] of ipairs(val as unknown[])) {
                    const valStr = asJson(arrayVal, indent + 1, tables);
                    table.insert(arrayVals, `\n${indentStr.rep(indent + 1)}${valStr}`);
                }
                return `[${table.concat(arrayVals, ",")}\n${indentStr.rep(indent)}]`;

            } else {
                const kvps: string[] = [];
                for (const [k, v] of pairs(val as object)) {
                    const valStr = asJson(v, indent + 1, tables);
                    table.insert(kvps, `\n${indentStr.rep(indent + 1)}"${escape(tostring(k))}": ${valStr}`);
                }
                return (kvps.length > 0) ? `{${table.concat(kvps, ",")}\n${indentStr.rep(indent)}}` : "{}";
            }

        } else if (valType === "number" || valType === "boolean") {
            return tostring(val);

        } else {
            return `"${escape(tostring(val))}"`;
        }
    }
}

namespace Send {
    function getPrintableValue(value: unknown) {
        const valueType = type(value);
        if (valueType === "string") {
            return `"${value}"`;

        } else if (valueType === "number" || valueType === "boolean" || valueType === "nil") {
            return tostring(value);

        } else {
            return `[${value}]`;
        }
    }

    function send(message: LuaDebug.MessageBase) {
        io.write(Format.asJson(message) + "\n");
    }

    export function error(err: string) {
        const dbgError: LuaDebug.Error = {tag: "$luaDebug", type: "error", error: err};
        send(dbgError);
    }

    export function debugBreak(message: string, breakType: LuaDebug.DebugBreak["breakType"], threadId: number) {
        const dbgBreak: LuaDebug.DebugBreak = {tag: "$luaDebug", type: "debugBreak", message, breakType, threadId};
        send(dbgBreak);
    }

    export function result(value: unknown) {
        const dbgVal: LuaDebug.Value = {type: type(value), value: getPrintableValue(value)};
        const dbgResult: LuaDebug.Result = {tag: "$luaDebug", type: "result", result: dbgVal};
        send(dbgResult);
    }

    export function frames(frameList: LuaDebug.Frame[]) {
        const dbgStack: LuaDebug.Stack = {tag: "$luaDebug", type: "stack", frames: frameList};
        send(dbgStack);
    }

    export function threads(threadIds: LuaTable<Thread, number>, activeThread: Thread) {
        const dbgThreads: LuaDebug.Threads = {
            tag: "$luaDebug",
            type: "threads",
            threads: []
        };
        for (const [thread, threadId] of pairs(threadIds)) {
            const dbgThread: LuaDebug.Thread = {
                name: thread === mainThread && mainThreadName || tostring(thread),
                id: threadId,
                active: thread === activeThread || undefined
            };
            table.insert(dbgThreads.threads, dbgThread);
        }
        send(dbgThreads);
    }

    export function locals(locs: Locals) {
        const dbgVariables: LuaDebug.Variables = {
            tag: "$luaDebug",
            type: "variables",
            variables: Format.makeExplicitArray()
        };
        for (const [name, info] of pairs(locs)) {
            const dbgVar: LuaDebug.Variable = {type: info.type, name, value: getPrintableValue(info.val)};
            table.insert(dbgVariables.variables, dbgVar);
        }
        send(dbgVariables);
    }

    export function vars(varsObj: Vars) {
        const dbgVariables: LuaDebug.Variables = {
            tag: "$luaDebug",
            type: "variables",
            variables: Format.makeExplicitArray()
        };
        for (const [name, info] of pairs(varsObj)) {
            const dbgVar: LuaDebug.Variable = {type: info.type, name, value: getPrintableValue(info.val)};
            table.insert(dbgVariables.variables, dbgVar);
        }
        send(dbgVariables);
    }

    export function props(tbl: object) {
        const dbgProperties: LuaDebug.Properties = {
            tag: "$luaDebug",
            type: "properties",
            properties: Format.makeExplicitArray()
        };
        for (const [key, val] of pairs(tbl)) {
            const name = getPrintableValue(key);
            const dbgVar: LuaDebug.Variable = {type: type(val), name, value: getPrintableValue(val)};
            table.insert(dbgProperties.properties, dbgVar);
        }
        const meta = getmetatable(tbl);
        if (meta) {
            dbgProperties.metatable = {type: type(meta), value: getPrintableValue(meta)};
        }
        const len = (tbl as unknown[]).length;
        if (len > 0 || dbgProperties.properties.length === 0) {
            dbgProperties.length = len;
        }
        send(dbgProperties);
    }

    export function breakpoints(breaks: LuaDebug.Breakpoint[]) {
        const dbgBreakpoints: LuaDebug.Breakpoints = {
            tag: "$luaDebug",
            type: "breakpoints",
            breakpoints: Format.makeExplicitArray(breaks)
        };
        send(dbgBreakpoints);
    }

    export function help(helpStrs: string[]) {
        io.write(table.concat(helpStrs, "\n") + "\n");
    }
}

namespace Debugger {
    interface Env {
        [name: string]: unknown;
    }

    const prompt = "";

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
        for (let i = 0; i < stack.length; ++i) {
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

        if (coroutine.running() !== undefined && !isType(thread, "thread")) {
            return locs; // Accessing locals for main thread, but we're in a coroutine right now
        }

        for (let index = 1; ; ++index) {
            let name: string | undefined;
            let val: unknown;
            if (isType(thread, "thread")) {
                [name, val] = debug.getlocal(thread, level, index);
            } else {
                [name, val] = debug.getlocal(level, index);
            }
            if (!name) {
                break;
            }
            if (name.sub(1, 1) !== "(") {
                locs[name] = {val, index, type: type(val)};
            }
        }

        return locs;
    }

    function getUpvalues(info: debug.FunctionInfo): Locals {
        const ups: Locals = {};

        info.nups = assert(info.nups);
        info.func = assert(info.func);
        for (let index = 1; index <= info.nups; ++index) {
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
        level: number,
        thread: Thread,
        info: debug.FunctionInfo,
        locs: Locals
    ): [true, unknown] | [false, string] {
        if (coroutine.running() && !isType(thread, "thread")) {
            return [false, "unable to access main thread while running in a coroutine"];
        }

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
                if (isType(thread, "thread")) {
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
        io.write(prompt);
        const inp = io.read("*l");
        return inp;
    }

    function getStack(threadOrOffset: LuaThread | number) {
        let thread: LuaThread | undefined;
        let i = 1;
        if (isType(threadOrOffset, "thread")) {
            thread = threadOrOffset;
        } else {
            i += threadOrOffset;
        }
        const stack: debug.FunctionInfo[] = [];
        while (true) {
            const stackInfo = thread && debug.getinfo(thread, i, "nSluf") || debug.getinfo(i, "nSluf");
            if (!stackInfo) {
                break;
            }
            table.insert(stack, stackInfo);
            ++i;
        }
        return stack;
    }

    let breakAtDepth = 0;
    let breakInThread: Thread | undefined;

    function debugBreak(activeThread: Thread, stackOffset: number) {
        ++stackOffset;
        const activeStack = getStack(stackOffset);

        const activeThreadFrameOffset = stackOffset + 1;
        const inactiveThreadFrameOffset = 1;

        breakAtDepth = 0;
        breakInThread = undefined;
        let frameOffset = activeThreadFrameOffset;
        let frame = 0;
        let currentThread = activeThread;
        let currentStack = activeStack;
        let info = assert(currentStack[frame]);
        while (true) {
            const inp = getInput();
            if (inp === "cont" || inp === "continue") {
                break;

            } else if (inp === "help") {
                Send.help(
                    [
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
                        "props                        : show all properties of a table",
                        "eval                         : evaluate an expression in the current context",
                        "exec                         : execute a statement in the current context",
                        "break [list]                 : show all breakpoints",
                        "break set file.ext:n         : set a breakpoint",
                        "break del|delete file.ext:n  : delete a breakpoint",
                        "break en|enable file.ext:n   : enable a breakpoint",
                        "break dis|disable file.ext:n : disable a breakpoint",
                        "break clear                  : delete all breakpoints",
                        "threads                      : list active thread ids",
                        "thread n                     : set current thread by id"
                    ]
                );

            } else if (inp === "threads") {
                Send.threads(threadIds, activeThread);

            } else if (inp.sub(1, 7) === "thread ") {
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
                            currentStack = [{name: "unable to access main thread while running in a coroutine"}];
                        } else {
                            currentStack = getStack(newThread);
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
                breakInThread = activeThread;
                break;

            } else if (inp === "stepout") {
                breakAtDepth = activeStack.length - 1;
                breakInThread = activeThread;
                break;

            } else if (inp === "quit") {
                os.exit(0);

            } else if (inp === "stack") {
                backtrace(currentStack, frame);

            } else if (inp.sub(1, 6) === "frame ") {
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
                const locs = getLocals(frame + frameOffset, currentThread);
                Send.vars(locs);

            } else if (inp === "ups") {
                const ups = getUpvalues(info);
                Send.vars(ups);

            } else if (inp === "globals") {
                const globs = getGlobals();
                Send.vars(globs);

            } else if (inp === "break") {
                Send.breakpoints(Breakpoint.getAll());

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
                    [file, lineStr] = inp.match("^break%s+[a-z]+%s+(.-):(%d+)$");
                    if (file !== undefined && lineStr !== undefined) {
                        line = assert(tonumber(lineStr));
                        breakpoint = Breakpoint.get(file, line);
                    }
                }
                if (cmd === "set") {
                    if (file !== undefined && line !== undefined) {
                        Breakpoint.add(file, line);
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
                    const [s, r] = execute(
                        "return " + expression,
                        frame + frameOffset,
                        currentThread,
                        info,
                        getLocals(frame + frameOffset, currentThread)
                    );
                    if (s) {
                        Send.result(r);
                    } else {
                        Send.error(r as string);
                    }
                }

            } else if (inp.sub(1, 5) === "props") {
                const [expression] = inp.match("^props%s+(.+)$");
                if (!expression) {
                    Send.error("Bad expression");

                } else {
                    const [s, r] = execute(
                        "return " + expression,
                        frame + frameOffset,
                        currentThread,
                        info,
                        getLocals(frame + frameOffset, currentThread)
                    );
                    if (s) {
                        if (isType(r, "table")) {
                            Send.props(r);
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
                    const [s, r] = execute(
                        statement,
                        frame + frameOffset,
                        currentThread,
                        info,
                        getLocals(frame + frameOffset, currentThread)
                    );
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

    function debugHook(event: "call" | "return" | "tail return" | "count" | "line", line?: number) {
        const stackOffset = 2;

        //Ignore debugger code
        const topFrame = debug.getinfo(stackOffset, "Sl");
        if (!topFrame || !topFrame.source || topFrame.source.sub(-12) === "debugger.lua") {
            return;
        }

        const activeThread = coroutine.running() || mainThread;

        //Stepping
        if (breakAtDepth > 0) {
            const activeStack = getStack(stackOffset);
            if (activeStack.length <= breakAtDepth && (!breakInThread || activeThread === breakInThread)) {
                Send.debugBreak("step", "step", assert(threadIds.get(activeThread)));
                debugBreak(activeThread, stackOffset);
                return;
            }
        }

        //Breakpoints
        const breakpoints = Breakpoint.getAll();
        if (!topFrame.currentline || breakpoints.length === 0) {
            return;
        }

        const source = Path.format(assert(topFrame.source));
        const sourceMap = SourceMap.get(source);
        let sourceMapFile: string | undefined;
        let lineMapping: SourceLineMapping | undefined;
        if (sourceMap) {
            lineMapping = sourceMap[topFrame.currentline];
            if (lineMapping) {
                sourceMapFile = sourceMap.sources[lineMapping.sourceIndex];
            }
        }
        for (const [_, breakpoint] of ipairs(breakpoints)) {
            if (breakpoint.enabled
                && ((breakpoint.line === topFrame.currentline && comparePaths(breakpoint.file, source))
                    || (lineMapping
                        && sourceMapFile
                        && breakpoint.line === lineMapping.sourceLine
                        && comparePaths(breakpoint.file, sourceMapFile)
                    )
                )
            ) {
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

    export function setHook() {
        debug.sethook(debugHook, "l");

        for (const [thread] of pairs(threadIds)) {
            if (isType(thread, "thread") && coroutine.status(thread) !== "dead") {
                debug.sethook(thread, debugHook, "l");
            }
        }
    }

    export function clearHook() {
        debug.sethook();

        for (const [thread] of pairs(threadIds)) {
            if (isType(thread, "thread") && coroutine.status(thread) !== "dead") {
                debug.sethook(thread);
            }
        }
    }

    export function triggerBreak() {
        breakAtDepth = math.huge;
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

    export function onError(err: unknown) {
        const msg = mapSources(tostring(err));
        const thread = coroutine.running() || mainThread;
        Send.debugBreak(msg, "error", assert(threadIds.get(thread)));
        debugBreak(thread, 2);
    }

    //Track coroutines
    const luaCoroutineCreate = coroutine.create;
    coroutine.create = (f: Function) => {
        const thread = luaCoroutineCreate(f);
        threadIds.set(thread, nextThreadId);
        ++nextThreadId;
        if (debug.gethook()) {
            debug.sethook(thread, debugHook, "l");
        }
        return thread;
    };

    //Override debug.traceback
    const luaDebugTraceback = debug.traceback;
    debug.traceback = (
        threadOrMessage?: LuaThread | string,
        messageOrLevel?: string | number,
        level?: number
    ): string => {
        let trace = luaDebugTraceback(threadOrMessage as LuaThread, messageOrLevel as string, level as number);
        if (trace) {
            trace = mapSources(trace);
        }

        const thread = isType(threadOrMessage, "thread") && threadOrMessage || coroutine.running() || mainThread;
        Send.debugBreak(trace || "error", "error", assert(threadIds.get(thread)));
        debugBreak(thread, 3);

        return trace;
    };
}

//Trigger a break at next executed line
export function requestBreak() {
    Debugger.triggerBreak();
}

//Stop debugger
export function stop() {
    Debugger.clearHook();
}

//Start debugger
export function start(entryPoint?: string | { (this: void): void }, breakImmediately?: boolean) {
    if (isType(entryPoint, "string")) {
        [entryPoint] = assert(...loadfile(entryPoint));
    }

    Debugger.setHook();

    if (breakImmediately !== false) {
        Debugger.triggerBreak();
    }

    if (entryPoint !== undefined) {
        xpcall(
            () => {
                (entryPoint as { (this: void): void })();
                stop();
            },
            Debugger.onError
        );
    }
}

//Don't buffer io
io.stdout.setvbuf("no");
io.stderr.setvbuf("no");
