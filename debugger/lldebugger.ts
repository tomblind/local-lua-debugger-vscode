//MIT License
//
//Copyright (c) 2019 Tom Blind
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

/** @noSelfInFile */

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

/** @forRange */
declare function forRange(start: number, limit: number, step?: number): number[];

/** @varArg */
type LuaVarArg<A extends unknown[]> = A & { __luaVarArg?: never };

//Enure destructuring works in all lua versions
_G.unpack = _G.unpack || (table as typeof table & Record<"unpack", typeof _G["unpack"]>).unpack;

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

function isThread(val: unknown): val is LuaThread {
    return type(val) === "thread";
}

type Thread = LuaThread | typeof mainThreadName;

const mainThreadName = "main thread";
const mainThread = (() => {
    const LUA_RIDX_MAINTHREAD = 1;
    const registryMainThread = debug.getregistry()[LUA_RIDX_MAINTHREAD];
    return isThread(registryMainThread) && registryMainThread || mainThreadName;
})();

namespace Path {
    export const separator = (() => {
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

    export function add(file: string, line: number, condition?: string) {
        table.insert(current, {file: Path.format(file), line, enabled: true, condition});
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
            for (const i of forRange(1, 6)) {
                const bit = sextet % 2 !== 0;
                table.insert(bits, i, bit);
                sextet = math.floor(sextet / 2);
            }
            if (bits.length >= 8) {
                let value = 0;
                for (const i of forRange(7, 0, -1)) {
                    const bit = table.remove(bits);
                    if (bit) {
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
            for (const _ of forRange(1, 5)) {
                const bit = sextet % 2 !== 0;
                table.insert(bits, bit);
                sextet = math.floor(sextet / 2);
            }
            const continueBit = sextet % 2 !== 0;
            if (!continueBit) {
                let value = 0;
                for (const i of forRange(1, bits.length - 1)) {
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

    function escape(str: string) {
        const [escaped] = str.gsub(escapesPattern, escapes);
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
            if (typeof k !== "number" || k > len) {
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

    function isElementKey(tbl: object, key: unknown) {
        return typeof key === "number" && key >= 1 && key <= (tbl as unknown[]).length;
    }

    function buildVariable(name: string, value: unknown) {
        const dbgVar: LuaDebug.Variable = {
            type: type(value),
            name,
            value: getPrintableValue(value)
        };

        if (typeof value === "object") {
            dbgVar.length = (value as unknown[]).length;
        }

        return dbgVar;
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
            if (thread === mainThread || coroutine.status(thread as LuaThread) !== "dead") {
                const dbgThread: LuaDebug.Thread = {
                    name: thread === mainThread && mainThreadName || tostring(thread),
                    id: threadId,
                    active: thread === activeThread || undefined
                };
                table.insert(dbgThreads.threads, dbgThread);
            }
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
            const dbgVar = buildVariable(name, info.val);
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
            const dbgVar = buildVariable(name, info.val);
            table.insert(dbgVariables.variables, dbgVar);
        }
        send(dbgVariables);
    }

    export function props(tbl: object, kind?: string, first?: number, count?: number) {
        const dbgProperties: LuaDebug.Properties = {
            tag: "$luaDebug",
            type: "properties",
            properties: Format.makeExplicitArray()
        };
        if (kind === "indexed") {
            first = first || 1;
            const last = count && (first + count - 1) || (first + (tbl as unknown[]).length - 1);
            for (const i of forRange(first, last)) {
                const val = (tbl as Record<string, unknown>)[i];
                const name = getPrintableValue(i);
                const dbgVar = buildVariable(name, val);
                table.insert(dbgProperties.properties, dbgVar);
            }

        } else {
            for (const [key, val] of pairs(tbl)) {
                if (kind !== "named" || !isElementKey(tbl, key)) {
                    const name = getPrintableValue(key);
                    const dbgVar = buildVariable(name, val);
                    table.insert(dbgProperties.properties, dbgVar);
                }
            }
            const meta = getmetatable(tbl);
            if (meta) {
                dbgProperties.metatable = {type: type(meta), value: getPrintableValue(meta)};
            }
            const len = (tbl as unknown[]).length;
            if (len > 0 || (dbgProperties.properties.length === 0 && !dbgProperties.metatable)) {
                dbgProperties.length = len;
            }
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

    export function help(...helpStrs: [string, string][]) {
        let nameLength = 0;
        for (const [_, nameAndDesc] of ipairs(helpStrs)) {
            nameLength = math.max(nameLength, nameAndDesc[1].length);
        }
        const builtStrs: string[] = [];
        for (const [_, nameAndDesc] of ipairs(helpStrs)) {
            const [name, desc] = nameAndDesc;
            table.insert(builtStrs, `${name}${string.rep(" ", nameLength - name.length + 1)}: ${desc}`);
        }
        io.write(table.concat(builtStrs, "\n") + "\n");
    }
}

namespace Debugger {
    interface Env {
        [name: string]: unknown;
    }

    /** @tupleReturn */
    export interface DebuggableFunction {
        (this: void, ...args: unknown[]): unknown[];
    }

    const prompt = "";
    const debuggerName = "lldebugger.lua";

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
            if (lineMapping && lineMapping.sourceLine === line) {
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
        if (hook === debugHook) {
            debug.sethook(thread, debugHook, "l");
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

//Start debugger globally
export function start(breakImmediately?: boolean) {
    breakImmediately = breakImmediately || os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") === "1";
    Debugger.debugGlobal(breakImmediately);
}

//Stop debugging currently debugged function
export function finish() {
    Debugger.popHook();
}

//Stop debugger completely
export function stop() {
    Debugger.clearHook();
}

//Load and debug the specified file
/** @tupleReturn */
export function runFile(filePath: unknown, breakImmediately?: boolean, ...args: unknown[]) {
    if (typeof filePath !== "string") {
        throw `expected string as first argument to runFile, but got '${type(filePath)}'`;
    }
    if (breakImmediately !== undefined && typeof breakImmediately !== "boolean") {
        throw `expected boolean as second argument to runFile, but got '${type(breakImmediately)}'`;
    }
    const [func] = assert(...loadfile(filePath));
    return Debugger.debugFunction(func as Debugger.DebuggableFunction, breakImmediately, args);
}

//Call and debug the specified function
/** @tupleReturn */
export function call(func: unknown, breakImmediately?: boolean, ...args: unknown[]) {
    if (typeof func !== "function") {
        throw `expected string as first argument to debugFile, but got '${type(func)}'`;
    }
    if (breakImmediately !== undefined && typeof breakImmediately !== "boolean") {
        throw `expected boolean as second argument to debugFunction, but got '${type(breakImmediately)}'`;
    }
    return Debugger.debugFunction(func as Debugger.DebuggableFunction, breakImmediately, args);
}

//Trigger a break at next executed line
export function requestBreak() {
    Debugger.triggerBreak();
}

//Don't buffer io
io.stdout.setvbuf("no");
io.stderr.setvbuf("no");
