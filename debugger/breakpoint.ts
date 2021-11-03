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

import {SourceMap} from "./sourcemap";
import {Path} from "./path";

export interface Breakpoint extends LuaDebug.Breakpoint {
    sourceFile?: string;
    sourceLine?: number;
    sourceMap?: SourceMap;
}

export namespace Breakpoint {
    export interface BreakpointSet {
        [line: number]: Breakpoint[] | undefined;
    }

    const current: BreakpointSet = {};
    let count = 0;

    export function get(file: string, line: number): LuaDebug.Breakpoint | undefined {
        file = Path.format(file);
        for (const [breakpointLine, lineBreakpoints] of pairs(current)) {
            for (const breakpoint of lineBreakpoints) {
                if (breakpoint.sourceMap) {
                    if (breakpoint.sourceLine === line && breakpoint.sourceFile === file) {
                        return breakpoint;
                    }
                } else if (breakpointLine === line && breakpoint.file === file) {
                    return breakpoint;
                }
            }
        }
    }

    export function getLookup(): BreakpointSet {
        return current;
    }

    export function getAll(): Breakpoint[] {
        const breakpointList: Breakpoint[] = [];
        for (const [_, lineBreakpoints] of pairs(current)) {
            for (const breakpoint of lineBreakpoints) {
                table.insert(breakpointList, breakpoint);
            }
        }
        return breakpointList;
    }

    export function add(file: string, line: number, condition?: string): void {
        file = Path.format(file);

        let sourceFile: string | undefined;
        let sourceLine: number | undefined;
        const [scriptFile, sourceMap] = SourceMap.find(file);
        if (scriptFile && sourceMap) {
            for (const [scriptLine, mapping] of pairs(sourceMap.mappings)) {
                if (mapping.sourceLine === line) {
                    sourceFile = file;
                    file = scriptFile;
                    sourceLine = line;
                    line = scriptLine;
                    break;
                }
            }
        }

        let lineBreakpoints = current[line];
        if (!lineBreakpoints) {
            lineBreakpoints = [];
            current[line] = lineBreakpoints;
        }
        table.insert(lineBreakpoints, {file, line, enabled: true, condition, sourceFile, sourceLine, sourceMap});
        ++count;
    }

    function removeBreakpoint(breakpointLine: number, lineBreakpoints: Breakpoint[], i: number) {
        table.remove(lineBreakpoints, i);
        if (lineBreakpoints.length === 0) {
            current[breakpointLine] = undefined;
        }
        --count;
    }

    export function remove(file: string, line: number): void {
        file = Path.format(file);
        for (const [breakpointLine, lineBreakpoints] of pairs(current)) {
            for (const [i, breakpoint] of ipairs(lineBreakpoints)) {
                if (breakpoint.sourceMap) {
                    if (breakpoint.sourceLine === line && breakpoint.sourceFile === file) {
                        removeBreakpoint(breakpointLine, lineBreakpoints, i);
                        return;
                    }
                } else if (breakpointLine === line && breakpoint.file === file) {
                    removeBreakpoint(breakpointLine, lineBreakpoints, i);
                    return;
                }
            }
        }
    }

    export function clear(): void {
        for (const [line] of pairs(current)) {
            current[line] = undefined;
        }
        count = 0;
    }

    export function getCount(): number {
        return count;
    }
}
