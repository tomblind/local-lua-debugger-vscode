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

import {luaRawLen} from "./luafuncs";
import {Format} from "./format";
import {Locals, Vars} from "./debugger";
import {Thread, mainThread, mainThreadName} from "./thread";

export namespace Send {
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

    function isElementKey(tbl: object, tblLen: number, key: unknown) {
        return typeof key === "number" && key >= 1 && key <= tblLen;
    }

    function buildVariable(name: string, value: unknown) {
        const dbgVar: LuaDebug.Variable = {
            type: type(value),
            name,
            value: getPrintableValue(value)
        };

        if (typeof value === "object") {
            dbgVar.length = luaRawLen(value as object);
        }

        return dbgVar;
    }

    function send(message: LuaDebug.MessageBase) {
        io.write(Format.asJson(message));
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
            const last = count && (first + count - 1) || (first + luaRawLen(tbl) - 1);
            for (const i of forRange(first, last)) {
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
