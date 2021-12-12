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

// Lua 5.2+ versions
declare function rawlen<T extends AnyTable>(this: void, v: T | string): number;

declare function load(
    this: void,
    chunk: string,
    chunkname?: string,
    mode?: "b" | "t" | "bt",
    env?: AnyTable
): LuaMultiReturn<[{ (this: void): LuaMultiReturn<unknown[]> }, undefined] | [undefined, string]>;

declare function loadfile(
    this: void,
    filename?: string,
    mode?: "b" | "t" | "bt",
    env?: unknown
): LuaMultiReturn<[{ (this: void): unknown }, undefined] | [undefined, string]>;

//Set global `unpack` so tstl generated code always has access to it
_G.unpack ??= (table as typeof table & Record<"unpack", typeof _G["unpack"]>).unpack;

export const luaAssert = _G.assert;
export const luaError = _G.error;
export const luaCoroutineWrap = coroutine.wrap;
export const luaDebugTraceback = debug.traceback;
export const luaCoroutineCreate = coroutine.create;
export const luaCoroutineResume = coroutine.resume;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
export const luaRawLen = rawlen ?? function<T extends AnyTable>(v: T | string): number {
    const mt = getmetatable(v);
    if (!mt || !rawget(mt as {__len?: unknown}, "__len")) {
        return (v as unknown as unknown[]).length;
    } else {
        let len = 1;
        while (rawget(v as Record<string, unknown>, len as unknown as string)) {
            ++len;
        }
        return len - 1;
    }
};

export interface Env {
    [name: string]: unknown;
}

export function loadLuaString(
    str: string,
    env?: Env
): LuaMultiReturn<[{ (this: void): LuaMultiReturn<unknown[]> }, undefined] | [undefined, string]> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (setfenv !== undefined) {
        const [f, e] = loadstring(str, str);
        if (f && env) {
            setfenv(f, env);
        }
        return $multi(f as { (this: void): LuaMultiReturn<unknown[]> }, e as undefined);

    } else {
        return load(str, str, "t", env);
    }
}

export function loadLuaFile(
    filename: string,
    env?: Env
): LuaMultiReturn<[{ (this: void): unknown }, undefined] | [undefined, string]> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (setfenv !== undefined) {
        const [f, e] = loadfile(filename);
        if (f && env) {
            setfenv(f, env);
        }
        return $multi(f as { (this: void): unknown }, e as undefined);

    } else {
        return loadfile(filename, "t", env);
    }
}

export function luaGetEnv(level: number, thread?: LuaThread): Env | undefined {
    const info = thread && debug.getinfo(thread, level, "f") || debug.getinfo(level + 1, "f");
    if (!info || !info.func) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (getfenv !== undefined) {
        return getfenv(info.func) as Env | undefined;
    } else {
        let i = 1;
        while (true) {
            const [name, value] = debug.getupvalue(info.func, i);
            if (!name) {
                break;
            }
            if (name === "_ENV") {
                return value as Env;
            }
            ++i;
        }
    }
}
