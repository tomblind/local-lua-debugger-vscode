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
import {Path} from "./path";

export interface SourceLineMapping {
    sourceIndex: number;
    sourceLine: number;
    sourceColumn: number;
}

export interface SourceMap {
    [line: number]: SourceLineMapping | undefined;
    sources: string[];
    sourceNames: Record<string, string>;
    luaNames: Record<string, string>;
    hasMappedNames: boolean;
}

export namespace SourceMap
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
            let sextet = luaAssert(base64Lookup[c]);
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
            let sextet = luaAssert(base64Lookup[c]);
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

    function build(data: string, mapDir: string, luaScript: string) {
        const [sources] = data.match('"sources"%s*:%s*(%b[])');
        const [mappings] = data.match('"mappings"%s*:%s*"([^"]+)"');
        if (!mappings || !sources) {
            return undefined;
        }

        const sourceMap: SourceMap = {sources: [], sourceNames: {}, luaNames: {}, hasMappedNames: false};

        let [sourceRoot] = data.match('"sourceRoot"%s*:%s*"([^"]+)"');
        if (sourceRoot === undefined || sourceRoot.length === 0) {
            sourceRoot = ".";
        }

        for (const [source] of sources.gmatch('"([^"]+)"')) {
            const sourcePath = `${mapDir}${Path.separator}${sourceRoot}${Path.separator}${source}`;
            table.insert(sourceMap.sources, Path.getAbsolute(sourcePath));
        }

        const [names] = data.match('"names"%s*:%s*(%b[])');
        let nameList: string[] | undefined;
        if (names) {
            nameList = [];
            for (const [name] of names.gmatch('"([^"]+)"')) {
                table.insert(nameList, name);
            }
        }

        let luaLines: string[] | undefined;

        let line = 1;
        let column = 1;
        let sourceIndex = 0;
        let sourceLine = 1;
        let sourceColumn = 1;
        let nameIndex = 0;
        for (const [mapping, separator] of mappings.gmatch("([^;,]*)([;,]?)")) {
            if (mapping.length > 0) {
                const [colOffset, sourceOffset, sourceLineOffset, sourceColOffset, nameOffset]
                    = decodeBase64VLQ(mapping);

                column += (colOffset || 0);
                sourceIndex += (sourceOffset || 0);
                sourceLine += (sourceLineOffset || 0);
                sourceColumn += (sourceColOffset || 0);

                if (nameList && nameOffset) {
                    nameIndex += nameOffset;

                    const sourceName = nameList[nameIndex];

                    if (!luaLines) {
                        luaLines = [];
                        for (const [luaLineStr] of luaScript.gmatch("([^\r\n]*)\r?\n")) {
                            table.insert(luaLines, luaLineStr);
                        }
                    }

                    const luaLine = luaLines[line - 1];
                    if (luaLine) {
                        const [luaName] = luaLine.sub(column).match("[a-zA-Z_][A-Za-z0-9_]*");
                        if (luaName) {
                            sourceMap.sourceNames[luaName] = sourceName;
                            sourceMap.luaNames[sourceName] = luaName;
                            sourceMap.hasMappedNames = true;
                        }
                    }
                }

                const lineMapping = sourceMap[line];
                if (!lineMapping
                    || sourceLine < lineMapping.sourceLine
                    || (sourceLine === lineMapping.sourceLine && sourceColumn < lineMapping.sourceColumn)
                ) {
                    sourceMap[line] = {sourceIndex, sourceLine, sourceColumn};
                }
            }

            if (separator === ";") {
                ++line;
                column = 1;
            }
        }

        return sourceMap;
    }

    const scriptRootsEnv: LuaDebug.ScriptRootsEnv = "LOCAL_LUA_DEBUGGER_SCRIPT_ROOTS";
    let scriptRoots: string[] | undefined;

    function getScriptRoots(): string[] {
        if (!scriptRoots) {
            scriptRoots = [];
            const scriptRootsStr = os.getenv(scriptRootsEnv);
            if (scriptRootsStr) {
                for (let [path] of scriptRootsStr.gmatch("[^;]+")) {
                    path = Path.format(path) + Path.separator;
                    table.insert(scriptRoots, path);
                }
            }
        }
        return scriptRoots;
    }

    function getMap(filePath: string, file: LuaFile) {
        const data = file.read("*a");
        file.close();

        const [encodedMap] = data.match(
            "--# sourceMappingURL=data:application/json;base64,([A-Za-z0-9+/=]+)%s*$"
        );
        if (encodedMap) {
            const map = base64Decode(encodedMap);
            const fileDir = Path.dirName(filePath);
            return build(map, fileDir, data);
        }

        const [mapFile] = io.open(filePath + ".map");
        if (mapFile) {
            const map = mapFile.read("*a");
            mapFile.close();
            const fileDir = Path.dirName(filePath);
            return build(map, fileDir, data);
        }
    }

    function findMap(fileName: string) {
        let [file] = io.open(fileName);
        if (file) {
            return getMap(fileName, file);
        }
        for (const path of getScriptRoots()) {
            const filePath = path + fileName;
            [file] = io.open(filePath);
            if (file) {
                return getMap(filePath, file);
            }
        }
    }

    export function get(fileName: string): SourceMap | undefined {
        if (fileName === "[C]") {
            return undefined;
        }

        let sourceMap = cache[fileName];

        if (sourceMap === undefined) {
            sourceMap = findMap(fileName) || false;
            cache[fileName] = sourceMap;
        }

        return sourceMap || undefined;
    }
}
