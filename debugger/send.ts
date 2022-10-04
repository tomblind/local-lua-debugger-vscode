//MIT License
//
//Copyright (c) 2020 Tom Blind
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

import {luaAssert, luaError, luaLenMetamethodSupported, luaRawLen} from "./luafuncs";
import {Format} from "./format";
import {Vars} from "./debugger";
import {Thread, mainThread, mainThreadName} from "./thread";
import {Breakpoint} from "./breakpoint";

export namespace Send {
    const startToken: LuaDebug.StartToken = "@lldbg|";
    const endToken: LuaDebug.EndToken = "|lldbg@";

    const outputFileEnv: LuaDebug.OutputFileEnv = "LOCAL_LUA_DEBUGGER_OUTPUT_FILE";
    const outputFilePath = os.getenv(outputFileEnv);
    let outputFile: LuaFile;
    if (outputFilePath && outputFilePath.length > 0) {
        const [file, err] = io.open(outputFilePath, "w+");
        if (!file) {
            luaError(`Failed to open output file "${outputFilePath}": ${err}\n`);
        }
        outputFile = file as LuaFile;
        outputFile.setvbuf("no");
    } else {
        outputFile = io.stdout;
    }

    function getPrintableValue(value: unknown) {
        const valueType = type(value);
        if (valueType === "string") {
            return `"${value}"`;

        } else if (valueType === "number" || valueType === "boolean" || valueType === "nil") {
            return tostring(value);

        } else {
            const [_, str] = pcall(tostring, value);
            const strType = type(str);
            if (strType !== "string") {
                return `[${strType}]`;
            }
            return `[${str}]`;
        }
    }

    function isElementKey(tbl: AnyTable, tblLen: number, key: unknown) {
        return typeof key === "number" && key >= 1 && key <= tblLen;
    }

    function buildVariable(name: string, value: unknown) {
        const dbgVar: LuaDebug.Variable = {
            type: type(value),
            name,
            value: getPrintableValue(value)
        };

        if (typeof value === "object") {
            dbgVar.length = luaRawLen(value as AnyTable);
        }

        return dbgVar;
    }

    function buildVarArgs(name: string, values: unknown[]): LuaDebug.Variable {
        const valueStrs: string[] = [];
        for (const [_, val] of ipairs(values)) {
            table.insert(valueStrs, getPrintableValue(val));
        }
        return {type: "table", name, value: table.concat(valueStrs, ", "), length: values.length};
    }

    function send(message: LuaDebug.MessageBase) {
        outputFile.write(`${startToken}${Format.asJson(message)}${endToken}`);
    }

    export function error(err: string): void {
        const dbgError: LuaDebug.Error = {tag: "$luaDebug", type: "error", error: err};
        send(dbgError);
    }

    export function debugBreak(message: string, breakType: LuaDebug.DebugBreak["breakType"], threadId: number): void {
        const dbgBreak: LuaDebug.DebugBreak = {tag: "$luaDebug", type: "debugBreak", message, breakType, threadId};
        send(dbgBreak);
    }

    export function result(...values: unknown[]): void {
        const results: LuaDebug.Value[] = Format.makeExplicitArray();
        for (const value of values) {
            table.insert(results, {type: type(value), value: getPrintableValue(value)});
        }
        const dbgResult: LuaDebug.Result = {tag: "$luaDebug", type: "result", results};
        send(dbgResult);
    }

    export function frames(frameList: LuaDebug.Frame[]): void {
        const dbgStack: LuaDebug.Stack = {tag: "$luaDebug", type: "stack", frames: frameList};
        send(dbgStack);
    }

    export function threads(threadIds: LuaTable<Thread, number | undefined>, activeThread: Thread): void {
        const dbgThreads: LuaDebug.Threads = {
            tag: "$luaDebug",
            type: "threads",
            threads: []
        };
        for (const [thread, threadId] of pairs(threadIds)) {
            if (thread === mainThread || coroutine.status(thread as LuaThread) !== "dead") {
                const dbgThread: LuaDebug.Thread = {
                    name: thread === mainThread ? mainThreadName : tostring(thread),
                    id: threadId,
                    active: thread === activeThread || undefined
                };
                table.insert(dbgThreads.threads, dbgThread);
            }
        }
        send(dbgThreads);
    }

    export function vars(varsObj: Vars): void {
        const dbgVariables: LuaDebug.Variables = {
            tag: "$luaDebug",
            type: "variables",
            variables: Format.makeExplicitArray()
        };
        for (const [name, info] of pairs(varsObj)) {
            const dbgVar = name === "..." ? buildVarArgs(name, info.val as unknown[]) : buildVariable(name, info.val);
            table.insert(dbgVariables.variables, dbgVar);
        }
        send(dbgVariables);
    }

    export function props(tbl: AnyTable, kind?: string, first?: number, count?: number): void {
        const dbgProperties: LuaDebug.Properties = {
            tag: "$luaDebug",
            type: "properties",
            properties: Format.makeExplicitArray()
        };
        if (kind === "indexed") {
            first ??= 1;
            const last = count ? (first + count - 1) : (first + luaRawLen(tbl) - 1);
            for (const i of $range(first, last)) {
                const val = (tbl as Record<string, unknown>)[i];
                const name = getPrintableValue(i);
                const dbgVar = buildVariable(name, val);
                table.insert(dbgProperties.properties, dbgVar);
            }

        } else {
            const len = luaRawLen(tbl);
            for (const [key, val] of pairs(tbl)) {
                if (kind !== "named" || !isElementKey(tbl, len, key)) {
                    const name = getPrintableValue(key);
                    const dbgVar = buildVariable(name, val);
                    table.insert(dbgProperties.properties, dbgVar);
                }
            }

            const meta = getmetatable(tbl);
            if (meta) {
                dbgProperties.metatable = {type: type(meta), value: getPrintableValue(meta)};
            }

            const [lenStatus, tblLen] = pcall(() => (tbl as unknown[]).length as unknown);
            if (!lenStatus) {
                dbgProperties.length = {type: type(tblLen), error: tblLen as string};
            } else if (tblLen !== 0) {
                dbgProperties.length = {type: type(tblLen), value: tostring(tblLen)};
            } else {
                const mt = debug.getmetatable(tbl);
                if (
                    (!mt && dbgProperties.properties.length === 0)
                    || (mt && luaLenMetamethodSupported && (mt as {__len?: unknown}).__len)
                ) {
                    dbgProperties.length = {type: type(tblLen), value: tostring(tblLen)};
                }
            }
        }
        send(dbgProperties);
    }

    function getUpvalues(info: debug.FunctionInfo): { [name: string]: unknown } {
        const ups: { [name: string]: unknown } = { };

        if (!info.nups || !info.func) {
            return ups;
        }

        for (const index of $range(1, info.nups)) {
            const [name, val] = debug.getupvalue(info.func, index);
            ups[luaAssert(name)] = val;
        }

        return ups;
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    export function functionUpvalues(f: Function): void {
        const dbgProperties: LuaDebug.Properties = {
            tag: "$luaDebug",
            type: "properties",
            properties: Format.makeExplicitArray()
        };
        const upvalues = getUpvalues(debug.getinfo(f, "fu") as debug.FunctionInfo);
        for (const [key, val] of pairs(upvalues)) {
            const name = getPrintableValue(key);
            const dbgVar = buildVariable(name, val);
            table.insert(dbgProperties.properties, dbgVar);
        }
        send(dbgProperties);
    }

    export function breakpoints(breaks: Breakpoint[]): void {
        const breakpointList: LuaDebug.Breakpoint[] = [];
        for (const breakpoint of breaks) {
            table.insert(
                breakpointList,
                {
                    line: breakpoint.sourceLine || breakpoint.line,
                    file: breakpoint.sourceFile || breakpoint.file,
                    condition: breakpoint.condition,
                    enabled: breakpoint.enabled
                }
            );
        }
        const dbgBreakpoints: LuaDebug.Breakpoints = {
            tag: "$luaDebug",
            type: "breakpoints",
            breakpoints: Format.makeExplicitArray(breakpointList)
        };
        send(dbgBreakpoints);
    }

    export function help(...helpStrs: Array<[string, string]>): void {
        let nameLength = 0;
        for (const [_, nameAndDesc] of ipairs(helpStrs)) {
            nameLength = math.max(nameLength, nameAndDesc[1].length);
        }
        const builtStrs: string[] = [];
        for (const [_, nameAndDesc] of ipairs(helpStrs)) {
            const [name, desc] = unpack(nameAndDesc);
            table.insert(builtStrs, `${name}${string.rep(" ", nameLength - name.length + 1)}: ${desc}`);
        }
        outputFile.write(`${table.concat(builtStrs, "\n")}\n`);
    }
}
