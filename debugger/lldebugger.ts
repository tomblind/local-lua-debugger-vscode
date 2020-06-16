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

import {luaAssert, loadLuaFile} from "./luafuncs";
import {Debugger} from "./debugger";

//Ensure destructuring works in all lua versions
_G.unpack = _G.unpack || (table as typeof table & Record<"unpack", typeof _G["unpack"]>).unpack;

//Don't buffer io
io.stdout.setvbuf("no");
io.stderr.setvbuf("no");

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
export function runFile(filePath: unknown, breakImmediately?: boolean, arg?: object) {
    if (typeof filePath !== "string") {
        throw `expected string as first argument to runFile, but got '${type(filePath)}'`;
    }
    if (breakImmediately !== undefined && typeof breakImmediately !== "boolean") {
        throw `expected boolean as second argument to runFile, but got '${type(breakImmediately)}'`;
    }
    const env = setmetatable({arg}, {__index: _G});
    const [func] = luaAssert(...loadLuaFile(filePath, env));
    return Debugger.debugFunction(func as Debugger.DebuggableFunction, breakImmediately, arg as unknown[]);
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
