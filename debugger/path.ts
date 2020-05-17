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

import {luaAssert} from "./luafuncs";

export namespace Path {
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
            if (p) {
                [cwd] = p.read("*a").match("^%s*(.-)%s*$");
            }
            cwd = cwd || "";
        }
        return cwd;
    }

    export function dirName(path: string) {
        const [dir] = path.match(`^(.-)${separator}+[^${separator}]+$`);
        return dir || ".";
    }

    /** @tupleReturn */
    export function splitDrive(path: string) {
        let [drive, pathPart] = path.match(`^[@=]?([a-zA-Z]:)[\\/](.*)`);
        if (drive) {
            drive = drive.upper() + separator;
        } else {
            [drive, pathPart] = path.match(`^[@=]?([\\/]*)(.*)`);
        }
        return [luaAssert(drive), luaAssert(pathPart)];
    }

    const formattedPathCache: Record<string, string> = {};

    export function format(path: string) {
        let formattedPath = formattedPathCache[path];
        if (!formattedPath) {
            const [drive, pathOnly] = splitDrive(path);
            const pathParts: string[] = [];
            for (const [part] of luaAssert(pathOnly).gmatch("[^\\/]+")) {
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
