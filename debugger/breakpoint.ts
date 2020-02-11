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

import {Path} from "./path";

export namespace Breakpoint {
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

