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
    export interface BreakpointSet {
        [line: number]: LuaDebug.Breakpoint[] | undefined;
    }

    let current: BreakpointSet = {};
    let count = 0;

    export function get(file: string, line: number): LuaDebug.Breakpoint | undefined {
        const lineBreakpoints = current[line];
        if (lineBreakpoints) {
            file = Path.format(file);
            for (const [_, breakpoint] of ipairs(lineBreakpoints)) {
                if (breakpoint.file === file) {
                    return breakpoint;
                }
            }
        }
        return undefined;
    }

    export function getAll(): BreakpointSet {
        return current;
    }

    export function getList(): LuaDebug.Breakpoint[] {
        const breakpointList: LuaDebug.Breakpoint[] = [];
        for (const [_, lineBreakpoints] of pairs(current)) {
            for (const [__, breakpoint] of ipairs(lineBreakpoints)) {
                table.insert(breakpointList, breakpoint);
            }
        }
        return breakpointList;
    }

    export function add(file: string, line: number, condition?: string): void {
        let lineBreakpoints = current[line];
        if (!lineBreakpoints) {
            lineBreakpoints = [];
            current[line] = lineBreakpoints;
        }
        table.insert(lineBreakpoints, {file: Path.format(file), line, enabled: true, condition});
        ++count;
    }

    export function remove(file: string, line: number): void {
        const lineBreakpoints = current[line];
        if (!lineBreakpoints) {
            return;
        }
        file = Path.format(file);
        for (const [i, breakpoint] of ipairs(lineBreakpoints)) {
            if (breakpoint.file === file) {
                table.remove(lineBreakpoints, i);
                --count;
                if (lineBreakpoints.length === 0) {
                    current[line] = undefined;
                }
                break;
            }
        }
    }

    export function clear(): void {
        current = {};
        count = 0;
    }

    export function getCount(): number {
        return count;
    }
}
