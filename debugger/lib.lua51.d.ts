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

declare interface LuaThread { readonly ____luaThread: never; }
declare interface LuaUserData { readonly ____luaUserData: never; }
declare interface LuaLightUserData { readonly ____luaLightUserData: never; }

/**
 * Issues an error when the value of its argument `v` is false (i.e., nil or false); otherwise, returns all its
 *   arguments. `message` is an error message; when absent, it defaults to "assertion failed!"
*/
declare function assert<V>(this: void, v: V): Exclude<V, undefined | null | false>;

/**
 * Issues an error when the value of its argument `v` is false (i.e., nil or false); otherwise, returns all its
 *   arguments. `message` is an error message; when absent, it defaults to "assertion failed!"
*/
/** @tupleReturn */
declare function assert<V extends [unknown, ...unknown[]]>(
    this: void,
    ...v: V
): { [I in keyof V]: I extends "0" ? Exclude<V[I], undefined | null | false> : V[I] };

/**
 * This function is a generic interface to the garbage collector. It performs different functions according to its first
 *   argument, `opt`:
 *
 * - "collect": performs a full garbage-collection cycle. This is the default option.
 * - "stop": stops the garbage collector.
 * - "restart": restarts the garbage collector.
 * - "count": returns the total memory in use by Lua (in Kbytes).
 * - "step": performs a garbage-collection step. The step "size" is controlled by `arg` (larger values mean more steps)
 *   in a non-specified way. If you want to control the step size you must experimentally tune the value of `arg`.
 *   Returns true if the step finished a collection cycle.
 * - "setpause": sets `arg` as the new value for the pause of the collector (see 2.10). Returns the previous value for
 *   pause.
 * - "setstepmul": sets `arg` as the new value for the step multiplier of the collector (see 2.10). Returns the previous
 *   value for step.
*/
declare function collectgarbage(this: void, opt?: "collect" | "stop" | "restart"): void;

/**
 * This function is a generic interface to the garbage collector. It performs different functions according to its first
 *   argument, `opt`:
 *
 * - "collect": performs a full garbage-collection cycle. This is the default option.
 * - "stop": stops the garbage collector.
 * - "restart": restarts the garbage collector.
 * - "count": returns the total memory in use by Lua (in Kbytes).
 * - "step": performs a garbage-collection step. The step "size" is controlled by `arg` (larger values mean more steps)
 *   in a non-specified way. If you want to control the step size you must experimentally tune the value of `arg`.
 *   Returns true if the step finished a collection cycle.
 * - "setpause": sets `arg` as the new value for the pause of the collector (see 2.10). Returns the previous value for
 *   pause.
 * - "setstepmul": sets `arg` as the new value for the step multiplier of the collector (see 2.10). Returns the previous
 *   value for step.
*/
declare function collectgarbage(this: void, opt: "count"): number;

/**
 * This function is a generic interface to the garbage collector. It performs different functions according to its first
 *   argument, `opt`:
 *
 * - "collect": performs a full garbage-collection cycle. This is the default option.
 * - "stop": stops the garbage collector.
 * - "restart": restarts the garbage collector.
 * - "count": returns the total memory in use by Lua (in Kbytes).
 * - "step": performs a garbage-collection step. The step "size" is controlled by `arg` (larger values mean more steps)
 *   in a non-specified way. If you want to control the step size you must experimentally tune the value of `arg`.
 *   Returns true if the step finished a collection cycle.
 * - "setpause": sets `arg` as the new value for the pause of the collector (see 2.10). Returns the previous value for
 *   pause.
 * - "setstepmul": sets `arg` as the new value for the step multiplier of the collector (see 2.10). Returns the previous
 *   value for step.
*/
declare function collectgarbage(this: void, opt: "step", arg: number): boolean;

/**
 * This function is a generic interface to the garbage collector. It performs different functions according to its first
 *   argument, `opt`:
 *
 * - "collect": performs a full garbage-collection cycle. This is the default option.
 * - "stop": stops the garbage collector.
 * - "restart": restarts the garbage collector.
 * - "count": returns the total memory in use by Lua (in Kbytes).
 * - "step": performs a garbage-collection step. The step "size" is controlled by `arg` (larger values mean more steps)
 *   in a non-specified way. If you want to control the step size you must experimentally tune the value of `arg`.
 *   Returns true if the step finished a collection cycle.
 * - "setpause": sets `arg` as the new value for the pause of the collector (see 2.10). Returns the previous value for
 *   pause.
 * - "setstepmul": sets `arg` as the new value for the step multiplier of the collector (see 2.10). Returns the previous
 *   value for step.
*/
declare function collectgarbage(this: void, opt: "setpause" | "setstepmul", arg: number): number;

/**
 * Opens the named file and executes its contents as a Lua chunk. When called without arguments, `dofile` executes the
 *   contents of the standard input (`stdin`). Returns all values returned by the chunk. In case of errors, `dofile`
 *   propagates the error to its caller (that is, `dofile` does not run in protected mode).
*/
/** @tupleReturn */
declare function dofile(this: void, filename?: string): unknown[];

/**
 * Terminates the last protected function called and returns `message` as the error message. Function `error` never
 *   returns. Usually, `error` adds some information about the error position at the beginning of the message. The
 *   `level` argument specifies how to get the error position. With level 1 (the default), the error position is where
 *   the `error` function was called. Level 2 points the error to where the function that called `error` was called; and
 *   so on. Passing a level 0 avoids the addition of error position information to the message.
*/
declare function error(this: void, message: string, level?: number): never;

/**
 * A global variable (not a function) that holds the global environment (that is, `_G._G = _G`). Lua itself does not use
 *   this variable; changing its value does not affect any environment, nor vice-versa. (Use `setfenv` to change
 *   environments.)
*/
declare const _G: typeof globalThis & Record<string, unknown>;

/**
 * Returns the current environment in use by the function. `f` can be a Lua function or a number that specifies the
 *   function at that stack level: Level 1 is the function calling `getfenv`. If the given function is not a Lua
 *   function, or if `f` is 0, `getfenv` returns the global environment. The default for `f` is 1.
*/
declare function getfenv(this: void, f: Function | number): unknown;

/**
 * If `object` does not have a metatable, returns nil. Otherwise, if the object's metatable has a `"__metatable"` field,
 *   returns the associated value. Otherwise, returns the metatable of the given object.
*/
declare function getmetatable(this: void, object: unknown): unknown;

/** @luaIterator @tupleReturn */
declare interface LuaIpairsIterable<T> extends Array<[number, T]> {}

/**
 * Returns three values: an iterator function, the table `t`, and 0, so that the construction
 *
 *      for i,v in ipairs(t) do body end
 *
 * will iterate over the pairs (`1,t[1]`), (`2,t[2]`), ..., up to the first integer key absent from the table.
*/
declare function ipairs<T>(this: void, t: T[]): LuaIpairsIterable<T>;

/**
 * Loads a chunk using function `func` to get its pieces. Each call to `func` must return a string that concatenates
 *   with previous results. A return of an empty string, nil, or no value signals the end of the chunk.
 *
 * If there are no errors, returns the compiled chunk as a function; otherwise, returns nil plus the error message. The
 *   environment of the returned function is the global environment.
 *
 * `chunkname` is used as the chunk name for error messages and debug information. When absent, it defaults to
 *   "`=(load)`".
*/
/** @tupleReturn */
declare function load(
    this: void,
    func: { (this: void): string | undefined; },
    chunkname?: string
): [{ (this: void): unknown; }, undefined] | [undefined, string];

/**
 * Similar to `load`, but gets the chunk from file `filename` or from the standard input, if no file name is given.
*/
/** @tupleReturn */
declare function loadfile(this: void, filename?: string): [{ (this: void): unknown; }, undefined] | [undefined, string];

/**
 * Similar to `load`, but gets the chunk from the given string.
 *
 * To load and run a given string, use the idiom
 *
 *      assert(loadstring(s))()
 *
 * When absent, `chunkname` defaults to the given string.
*/
/** @tupleReturn */
declare function loadstring(
    this: void,
    string_?: string,
    chunkname?: string
): [{ (this: void): unknown; }, undefined] | [undefined, string];

/**
 * Allows a program to traverse all fields of a table. Its first argument is a table and its second argument is an index
 *   in this table. `next` returns the next index of the table and its associated value. When called with nil as its
 *   second argument, `next` returns an initial index and its associated value. When called with the last index, or with
 *   nil in an empty table, `next` returns nil. If the second argument is absent, then it is interpreted as nil. In
 *   particular, you can use `next(t)` to check whether a table is empty.
 *
 * The order in which the indices are enumerated is not specified, even for numeric indices. (To traverse a table in
 *   numeric order, use a numerical for or the `ipairs` function.)
 *
 * The behavior of `next` is undefined if, during the traversal, you assign any value to a non-existent field in the
 *   table. You may however modify existing fields. In particular, you may clear existing fields.
*/
/** @tupleReturn */
declare function next<T extends object>(this: void, table: T, index?: keyof T): [keyof T, T[keyof T]];

/** @luaIterator @tupleReturn */
declare interface LuaPairsIterable<T> extends Array<[keyof T, T[keyof T]]> {}

/**
 * Returns three values: the `next` function, the table `t`, and nil, so that the construction
 *
 *      for k,v in pairs(t) do body end
 *
 * will iterate over all key-value pairs of table `t`.
 *
 * See function `next` for the caveats of modifying the table during its traversal.
*/
declare function pairs<T extends object>(this: void, t: T): LuaPairsIterable<T>;

/**
 * Calls function `f` with the given arguments in protected mode. This means that any error inside `f` is not
 *   propagated; instead, `pcall` catches the error and returns a status code. Its first result is the status code (a
 *   boolean), which is true if the call succeeds without errors. In such case, `pcall` also returns all results from
 *   the call, after this first result. In case of any error, `pcall` returns false plus the error message.
*/
/** @tupleReturn */
declare function pcall<T, A extends unknown[], R>(
    this: void,
    f: { (this: T, ...args: A): R; },
    self: T,
    ...args: A
): [true, R] | [false, string];

/**
 * Calls function `f` with the given arguments in protected mode. This means that any error inside `f` is not
 *   propagated; instead, `pcall` catches the error and returns a status code. Its first result is the status code (a
 *   boolean), which is true if the call succeeds without errors. In such case, `pcall` also returns all results from
 *   the call, after this first result. In case of any error, `pcall` returns false plus the error message.
*/
/** @tupleReturn */
declare function pcall<A extends unknown[], R>(
    this: void,
    f: { (this: void, ...args: A): R; },
    ...args: A
): [true, R] | [false, string];

/**
 * Receives any number of arguments, and prints their values to `stdout`, using the `tostring` function to convert them
 *   to strings. `print` is not intended for formatted output, but only as a quick way to show a value, typically for
 *   debugging. For formatted output, use `string.format`.
*/
declare function print(this: void, ...args: unknown[]): void;

/**
 * Checks whether `v1` is equal to `v2`, without invoking any metamethod. Returns a boolean.
*/
declare function rawequal(this: void, v1: unknown, v2: unknown): boolean;

/**
 * Gets the real value of `table[index]`, without invoking any metamethod. `table` must be a table; `index` may be any
 *   value.
*/
declare function rawget<T extends object, I extends keyof T>(this: void, table: T, index: I): T[I];

/**
 * Sets the real value of `table[index]` to `value`, without invoking any metamethod. `table` must be a table, `index`
 *   any value different from nil, and `value` any Lua value. This function returns `table`.
*/
declare function rawset<T extends object, I extends keyof T>(this: void, table: T, index: I, value: T[I]): void;

/**
 * If `index` is a number, returns all arguments after argument number `index`. Otherwise, `index` must be the string
 *   `"#"`, and `select` returns the total number of extra arguments it received.
*/
/** @tupleReturn */
declare function select<A extends unknown[]>(this: void, index: number, ...args: A): A[number][];

/**
 * If `index` is a number, returns all arguments after argument number `index`. Otherwise, `index` must be the string
 *   `"#"`, and `select` returns the total number of extra arguments it received.
*/
declare function select(this: void, index: "#", ...args: unknown[]): number;

/**
 * Sets the environment to be used by the given function. `f` can be a Lua function or a number that specifies the
 *   function at that stack level: Level 1 is the function calling `setfenv`. `setfenv` returns the given function.
 *
 * As a special case, when `f` is 0 `setfenv` changes the environment of the running thread. In this case, `setfenv`
 *   returns no values.
*/
declare function setfenv<T extends object>(this: void, f: 0, table: T): void;

/**
 * Sets the environment to be used by the given function. `f` can be a Lua function or a number that specifies the
 *   function at that stack level: Level 1 is the function calling `setfenv`. `setfenv` returns the given function.
 *
 * As a special case, when `f` is 0 `setfenv` changes the environment of the running thread. In this case, `setfenv`
 *   returns no values.
*/
declare function setfenv<T extends object>(this: void, f: Function | number, table: T): Function | undefined;

declare interface LuaNewIndexMetaMethod<K extends string, V> {
    __newindex(this: unknown, key: K, value: V): void;
}

declare interface LuaIndexMetaMethod<K extends string, V> {
    __index(this: unknown, key: K): V;
}

declare interface LuaIndexMetaTable<T> {
    __index: T;
}

type LuaIndexMeta<M> = M extends LuaIndexMetaMethod<infer K, infer V>
    ? { [I in K]: V }
    : M extends LuaIndexMetaTable<infer T> ? T : {};

type LuaMetaExtractReadonly<I, E> = {
    +readonly [K in Exclude<keyof I, E>]: I[K]
};

type LuaMeta<M> = M extends LuaNewIndexMetaMethod<infer K, infer V>
    ? { [I in K]: V } & LuaMetaExtractReadonly<LuaIndexMeta<M>, K>
    : LuaIndexMeta<M>;

/**
 * Sets the metatable for the given table. (You cannot change the metatable of other types from Lua, only from C.) If
 *   `metatable` is nil, removes the metatable of the given table. If the original metatable has a `"__metatable"`
 *   field, raises an error.
 *
 * This function returns `table`.
*/
declare function setmetatable<T extends object, M extends object>(this: void, table: T, metatable?: M): T & LuaMeta<M>;

/**
 * Tries to convert its argument to a number. If the argument is already a number or a string convertible to a number,
 *   then `tonumber` returns this number; otherwise, it returns nil. An optional argument specifies the base to
 *   interpret the numeral. The base may be any integer between 2 and 36, inclusive. In bases above 10, the letter '`A`'
 *   (in either upper or lower case) represents 10, '`B`' represents 11, and so forth, with '`Z`' representing 35. In
 *   base 10 (the default), the number can have a decimal part, as well as an optional exponent part (see 2.1). In other
 *   bases, only unsigned integers are accepted.
*/
declare function tonumber(this: void, e: unknown): number | undefined;

/**
 * Tries to convert its argument to a number. If the argument is already a number or a string convertible to a number,
 *   then `tonumber` returns this number; otherwise, it returns nil. An optional argument specifies the base to
 *   interpret the numeral. The base may be any integer between 2 and 36, inclusive. In bases above 10, the letter '`A`'
 *   (in either upper or lower case) represents 10, '`B`' represents 11, and so forth, with '`Z`' representing 35. In
 *   base 10 (the default), the number can have a decimal part, as well as an optional exponent part (see 2.1). In other
 *   bases, only unsigned integers are accepted.
*/
declare function tonumber(this: void, e: string, base: number): number | undefined;

/**
 * Receives an argument of any type and converts it to a string in a reasonable format. For complete control of how
 *   numbers are converted, use `string.format`. If the metatable of `e` has a `"__tostring"` field, then `tostring`
 *   calls the corresponding value with `e` as argument, and uses the result of the call as its result.
*/
declare function tostring(this: void, e: unknown): string;

/**
 * Returns the type of its only argument, coded as a string. The possible results of this function are "`nil`" (a
 *   string, not the value nil), "`number`", "`string`", "`boolean`", "`table`", "`function`", "`thread`", and
 *   "`userdata`".
*/
declare function type(
    this: void,
    v: unknown
): "nil" | "number" | "string" | "boolean" | "table" | "function" | "thread" | "userdata";

/**
 * Returns the elements from the given table. This function is equivalent to
 *        return list[i], list[i+1], ..., list[j]
 *
 * except that the above code can be written only for a fixed number of elements. By default, `i` is 1 and `j` is the
 *   length of the list, as defined by the length operator (see 2.5.5).
*/
/** @tupleReturn */
declare function unpack<A extends unknown[]>(this: void, list: A): A;

/**
 * Returns the elements from the given table. This function is equivalent to
 *        return list[i], list[i+1], ..., list[j]
 *
 * except that the above code can be written only for a fixed number of elements. By default, `i` is 1 and `j` is the
 *   length of the list, as defined by the length operator (see 2.5.5).
*/
/** @tupleReturn */
declare function unpack<T>(this: void, list: T[], i: number, j?: number): T[];

/**
 * A global variable (not a function) that holds a string containing the current interpreter version. The current
 *   contents of this variable is "`Lua 5.1`".
*/
declare const _VERSION: "Lua 5.1";

/**
 * This function is similar to `pcall`, except that you can set a new error handler.
 *
 * `xpcall` calls function `f` in protected mode, using `err` as the error handler. Any error inside `f` is not
 *   propagated; instead, `xpcall` catches the error, calls the `err` function with the original error object, and
 *   returns a status code. Its first result is the status code (a boolean), which is true if the call succeeds without
 *   errors. In this case, `xpcall` also returns all results from the call, after this first result. In case of any
 *   error, `xpcall` returns false plus the result from `err`.
*/
/** @tupleReturn */
declare function xpcall<R>(
    this: void,
    f: { (this: void): R; },
    err: { (this: void, msg: string): void; }
): [true, R] | [false, string];

declare namespace coroutine {
    /**
     * Creates a new coroutine, with body `f`. `f` must be a Lua function. Returns this new coroutine, an object with
     *   type `"thread"`.
    */
    export function create(this: void, f: Function): LuaThread;

    /**
     * Starts or continues the execution of coroutine `co`. The first time you resume a coroutine, it starts running its
     *   body. The values `val1`, ... are passed as the arguments to the body function. If the coroutine has yielded,
     *   `resume` restarts it; the values `val1`, ... are passed as the results from the yield.
     *
     * If the coroutine runs without any errors, `resume` returns true plus any values passed to `yield` (if the
     *   coroutine yields) or any values returned by the body function (if the coroutine terminates). If there is any
     *   error, `resume` returns false plus the error message.
    */
    /** @tupleReturn */
    export function resume(this: void, co: LuaThread, ...args: unknown[]): [true, ...unknown[]] | [false, string];

    /**
     * Returns the running coroutine, or nil when called by the main thread.
    */
    export function running(this: void): LuaThread | undefined;

    /**
     * Returns the status of coroutine `co`, as a string: `"running"`, if the coroutine is running (that is, it called
     *   `status`); `"suspended"`, if the coroutine is suspended in a call to `yield`, or if it has not started running
     *   yet; `"normal"` if the coroutine is active but not running (that is, it has resumed another coroutine); and
     *   `"dead"` if the coroutine has finished its body function, or if it has stopped with an error.
    */
    export function status(this: void, co: LuaThread): "running" | "suspended" | "normal" | "dead";

    /** @tupleReturn */
    export interface WrappedFunction { (this: void, ...args: unknown[]): unknown[]; }

    /**
     * Creates a new coroutine, with body `f`. `f` must be a Lua function. Returns a function that resumes the coroutine
     *   each time it is called. Any arguments passed to the function behave as the extra arguments to `resume`. Returns
     *   the same values returned by `resume`, except the first boolean. In case of error, propagates the error.
    */
    export function wrap(this: void, f: Function): WrappedFunction;

    /**
     * Suspends the execution of the calling coroutine. The coroutine cannot be running a C function, a metamethod, or
     *   an iterator. Any arguments to `yield` are passed as extra results to `resume`.
    */
    export function yield(this: void, ...args: unknown[]): unknown;
}

declare type LuaModule = { _NAME: string; _M: LuaModule; } & { [key: string]: unknown; };

/**
 * Creates a module. If there is a table in `package.loaded[name]`, this table is the module. Otherwise, if there is a
 *   global table `t` with the given name, this table is the module. Otherwise creates a new table `t` and sets it as
 *   the value of the global `name` and the value of `package.loaded[name]`. This function also initializes `t._NAME`
 *   with the given name, `t._M` with the module (`t` itself), and `t._PACKAGE` with the package name (the full module
 *   name minus last component; see below). Finally, `module` sets `t` as the new environment of the current function
 *   and the new value of `package.loaded[name]`, so that `require` returns `t`.
 *
 * If `name` is a compound name (that is, one with components separated by dots), `module` creates (or reuses, if they
 *   already exist) tables for each component. For instance, if `name` is `a.b.c`, then `module` stores the module table
 *   in field `c` of field `b` of global `a`.
 *
 * This function can receive optional options after the module name, where each option is a function to be applied over
 *   the module.
*/
declare function module(this: void, name: string, ...args: ({ (this: void, module: LuaModule): void; })[]): void;

/**
 * Loads the given module. The function starts by looking into the `package.loaded` table to determine whether `modname`
 *   is already loaded. If it is, then `require` returns the value stored at `package.loaded[modname]`. Otherwise, it
 *   tries to find a loader for the module.
 *
 * To find a loader, `require` is guided by the `package.loaders` array. By changing this array, we can change how
 *   `require` looks for a module. The following explanation is based on the default configuration for
 *   `package.loaders`.
 *
 * First `require` queries `package.preload[modname]`. If it has a value, this value (which should be a function) is the
 *   loader. Otherwise `require` searches for a Lua loader using the path stored in `package.path`. If that also fails,
 *   it searches for a C loader using the path stored in `package.cpath`. If that also fails, it tries an all-in-one
 *   loader (see `package.loaders`).
 *
 * Once a loader is found, `require` calls the loader with a single argument, `modname`. If the loader returns any
 *   value, `require` assigns the returned value to `package.loaded[modname]`. If the loader returns no value and has
 *   not assigned any value to `package.loaded[modname]`, then `require` assigns true to this entry. In any case,
 *   `require` returns the final value of `package.loaded[modname]`.
 *
 * If there is any error loading or running the module, or if it cannot find any loader for the module, then `require`
 *   signals an error.
*/
declare function require(this: void, modname: string): unknown;

declare namespace package {
    /**
     * The path used by `require` to search for a C loader.
     *
     * Lua initializes the C path `package.cpath` in the same way it initializes the Lua path `package.path`, using the
     *   environment variable `LUA_CPATH` or a default path defined in `luaconf.h`.
    */
    export let cpath: string;

    /**
     * A table used by `require` to control which modules are already loaded. When you require a module `modname` and
     *   `package.loaded[modname]` is not false, `require` simply returns the value stored there.
    */
    export const loaded: Record<string, unknown>;

    export interface Loader { (this: void, modname: string): unknown; }
    export interface Searcher { (this: void, modname: string): Loader | string | undefined; }

    /**
     * A table used by `require` to control how to load modules.
     *
     * Each entry in this table is a searcher function. When looking for a module, `require` calls each of these
     *   searchers in ascending order, with the module name (the argument given to `require`) as its sole parameter. The
     *   function can return another function (the module loader) or a string explaining why it did not find that module
     *   (or nil if it has nothing to say). Lua initializes this table with four functions.
     *
     * The first searcher simply looks for a loader in the `package.preload` table.
     *
     * The second searcher looks for a loader as a Lua library, using the path stored at `package.path`. A path is a
     *   sequence of templates separated by semicolons. For each template, the searcher will change each interrogation
     *   mark in the template by `filename`, which is the module name with each dot replaced by a "directory separator"
     *   (such as "`/`" in Unix); then it will try to open the resulting file name. So, for instance, if the Lua path is
     *   the string
     *
     *      "./?.lua;./?.lc;/usr/local/?/init.lua"
     *
     * the search for a Lua file for module `foo` will try to open the files `./foo.lua`, `./foo.lc`, and
     *   `/usr/local/foo/init.lua`, in that order.
     *
     * The third searcher looks for a loader as a C library, using the path given by the variable `package.cpath`. For
     *   instance, if the C path is the string
     *
     *      "./?.so;./?.dll;/usr/local/?/init.so"
     *
     * the searcher for module `foo` will try to open the files `./foo.so`, `./foo.dll`, and `/usr/local/foo/init.so`,
     *   in that order. Once it finds a C library, this searcher first uses a dynamic link facility to link the
     *   application with the library. Then it tries to find a C function inside the library to be used as the loader.
     *   The name of this C function is the string "`luaopen_`" concatenated with a copy of the module name where each
     *   dot is replaced by an underscore. Moreover, if the module name has a hyphen, its prefix up to (and including)
     *   the first hyphen is removed. For instance, if the module name is `a.v1-b.c`, the function name will be
     *   `luaopen_b_c`.
     *
     * The fourth searcher tries an all-in-one loader. It searches the C path for a library for the root name of the
     *   given module. For instance, when requiring `a.b.c`, it will search for a C library for `a`. If found, it looks
     *   into it for an open function for the submodule; in our example, that would be `luaopen_a_b_c`. With this
     *   facility, a package can pack several C submodules into one single library, with each submodule keeping its
     *   original open function.
    */
    export const loaders: Searcher[];

    /**
     * Dynamically links the host program with the C library `libname`. Inside this library, looks for a function
     *   `funcname` and returns this function as a C function. (So, `funcname` must follow the protocol (see
     *   `lua_CFunction`)).
     *
     * This is a low-level function. It completely bypasses the package and module system. Unlike `require`, it does not
     *   perform any path searching and does not automatically adds extensions. `libname` must be the complete file name
     *   of the C library, including if necessary a path and extension. `funcname` must be the exact name exported by
     *   the C library (which may depend on the C compiler and linker used).
     *
     * This function is not supported by ANSI C. As such, it is only available on some platforms (Windows, Linux, Mac OS
     *   X, Solaris, BSD, plus other Unix systems that support the `dlfcn` standard).
    */
    export function loadlib(this: void, libname: string, funcname: string): Function;

    /**
     * The path used by `require` to search for a Lua loader.
     *
     * At start-up, Lua initializes this variable with the value of the environment variable `LUA_PATH` or with a
     *   default path defined in `luaconf.h`, if the environment variable is not defined. Any "`;;`" in the value of the
     *   environment variable is replaced by the default path.
    */
    export let path: string;

    /**
     * A table to store loaders for specific modules (see `require`).
    */
    export const preload: Record<string, Loader>;

    /**
     * Sets a metatable for `module` with its `__index` field referring to the global environment, so that this module
     *   inherits values from the global environment. To be used as an option to function `module`.
    */
    export function seeall(this: void, module: unknown): unknown;
}

declare namespace string {
    /**
     * Returns the internal numerical codes of the characters `s[i]`, `s[i+1]`, ..., `s[j]`. The default value for `i`
     *   is 1; the default value for `j` is `i`. Note that numerical codes are not necessarily portable across
     *   platforms.
    */
    /** @tupleReturn */
    export function byte(this: void, s: string, i?: string, j?: string): number[];

    /**
     * Receives zero or more integers. Returns a string with length equal to the number of arguments, in which each
     *   character has the internal numerical code equal to its corresponding argument. Note that numerical codes are
     *   not necessarily portable across platforms.
    */
    export function char(this: void, ...args: number[]): string;

    /**
     * Returns a string containing a binary representation of the given function, so that a later `loadstring` on this
     *   string returns a copy of the function. `function` must be a Lua function without upvalues.
    */
    export function dump(this: void, function_: Function): string;

    /**
     * Looks for the first match of `pattern` in the string `s`. If it finds a match, then `find` returns the indices of
     *   `s` where this occurrence starts and ends; otherwise, it returns nil. A third, optional numerical argument
     *   `init` specifies where to start the search; its default value is 1 and can be negative. A value of true as a
     *   fourth, optional argument `plain` turns off the pattern matching facilities, so the function does a plain "find
     *   substring" operation, with no characters in `pattern` being considered "magic". Note that if `plain` is given,
     *   then `init` must be given as well. If the pattern has captures, then in a successful match the captured values
     *   are also returned, after the two indices.
    */
    /** @tupleReturn */
    export function find(
        this: void,
        s: string,
        pattern: string,
        init?: number,
        plain?: boolean
    ): [number, number, ...string[]] | [undefined];

    /**
     * Returns a formatted version of its variable number of arguments following the description given in its first
     *   argument (which must be a string). The format string follows the same rules as the `printf` family of standard
     *   C functions. The only differences are that the options/modifiers `*`, `l`, `L`, `n`, `p`, and `h` are not
     *   supported and that there is an extra option, `q`. The `q` option formats a string in a form suitable to be
     *   safely read back by the Lua interpreter: the string is written between double quotes, and all double quotes,
     *   newlines, embedded zeros, and backslashes in the string are correctly escaped when written. For instance, the
     *   call      string.format('%q', 'a string with "quotes" and \n new line')
     *
     * will produce the string:
     *
     *      "a string with \"quotes\" and \
     *       new line"
     *
     * The options `c`, `d`, `E`, `e`, `f`, `g`, `G`, `i`, `o`, `u`, `X`, and `x` all expect a number as argument,
     *   whereas `q` and `s` expect a string.
     *
     * This function does not accept string values containing embedded zeros, except as arguments to the `q` option.
    */
    export function format(this: void, formatstring: string, ...args: unknown[]): string;

    /** @luaIterator @tupleReturn */
    export interface GmatchIterable extends Array<string[]> {}

    /**
     * Returns an iterator function that, each time it is called, returns the next captures from `pattern` over string
     *   `s`. If `pattern` specifies no captures, then the whole match is produced in each call. As an example, the
     *   following loop
     *
     *      s = "hello world from Lua"
     *      for w in string.gmatch(s, "%a+") do
     *        print(w)
     *      end
     *
     * will iterate over all the words from string `s`, printing one per line. The next example collects all pairs
     *   `key=value` from the given string into a table:
     *
     *      t = {}
     *      s = "from=world, to=Lua"
     *      for k, v in string.gmatch(s, "(%w+)=(%w+)") do
     *        t[k] = v
     *      end
     *
     * For this function, a '`^`' at the start of a pattern does not work as an anchor, as this would prevent the
     *   iteration.
    */
    export function gmatch(this: void, s: string, pattern: string): string.GmatchIterable;

    /**
     * Returns a copy of `s` in which all (or the first `n`, if given) occurrences of the `pattern` have been replaced
     *   by a replacement string specified by `repl`, which can be a string, a table, or a function. `gsub` also
     *   returns, as its second value, the total number of matches that occurred. If `repl` is a string, then its value
     *   is used for replacement. The character `%` works as an escape character: any sequence in `repl` of the form
     *   `%n`, with n between 1 and 9, stands for the value of the n-th captured substring (see below). The sequence
     *   `%0` stands for the whole match. The sequence `%%` stands for a single `%`.
     *
     * If `repl` is a table, then the table is queried for every match, using the first capture as the key; if the
     *   pattern specifies no captures, then the whole match is used as the key.
     *
     * If `repl` is a function, then this function is called every time a match occurs, with all captured substrings
     *   passed as arguments, in order; if the pattern specifies no captures, then the whole match is passed as a sole
     *   argument.
     *
     * If the value returned by the table query or by the function call is a string or a number, then it is used as the
     *   replacement string; otherwise, if it is false or nil, then there is no replacement (that is, the original match
     *   is kept in the string).
     *
     * Here are some examples:
     *
     *      x = string.gsub("hello world", "(%w+)", "%1 %1")
     *      -->; x="hello hello world world"
     *
     *      x = string.gsub("hello world", "%w+", "%0 %0", 1)
     *      -->; x="hello hello world"
     *
     *      x = string.gsub("hello world from Lua", "(%w+)%s*(%w+)", "%2 %1")
     *      -->; x="world hello Lua from"
     *
     *      x = string.gsub("home = $HOME, user = $USER", "%$(%w+)", os.getenv)
     *      -->; x="home = /home/roberto, user = roberto"
     *
     *      x = string.gsub("4+5 = $return 4+5$", "%$(.-)%$", function (s)
     *            return loadstring(s)()
     *          end)
     *      -->; x="4+5 = 9"
     *
     *      local t = {name="lua", version="5.1"}
     *      x = string.gsub("$name-$version.tar.gz", "%$(%w+)", t)
     *      -->; x="lua-5.1.tar.gz"
    */
    /** @tupleReturn */
    export function gsub(
        this: void,
        s: string,
        pattern: string,
        repl: string | Record<string, string | number> | { (this: void, ...args: string[]): string | number; },
        n?: number
    ): [string, number];

    /**
     * Receives a string and returns its length. The empty string `""` has length 0. Embedded zeros are counted, so
     *   `"a\000bc\000"` has length 5.
    */
    export function len(this: void, s: string): number;

    /**
     * Receives a string and returns a copy of this string with all uppercase letters changed to lowercase. All other
     *   characters are left unchanged. The definition of what an uppercase letter is depends on the current locale.
    */
    export function lower(this: void, s: string): string;

    /**
     * Looks for the first match of `pattern` in the string `s`. If it finds one, then `match` returns the captures from
     *   the pattern; otherwise it returns nil. If `pattern` specifies no captures, then the whole match is returned. A
     *   third, optional numerical argument `init` specifies where to start the search; its default value is 1 and can
     *   be negative.
    */
    /** @tupleReturn */
    export function match(this: void, s: string, pattern: string, init?: number): string[] | [undefined];

    /**
     * Returns a string that is the concatenation of `n` copies of the string `s`.
    */
    export function rep(this: void, s: string, n: number): string;

    /**
     * Returns a string that is the string `s` reversed.
    */
    export function reverse(this: void, s: string): string;

    /**
     * Returns the substring of `s` that starts at `i` and continues until `j`; `i` and `j` can be negative. If `j` is
     *   absent, then it is assumed to be equal to -1 (which is the same as the string length). In particular, the call
     *   `string.sub(s,1,j)` returns a prefix of `s` with length `j`, and `string.sub(s, -i)` returns a suffix of `s`
     *   with length `i`.
    */
    export function sub(this: void, s: string, i: number, j?: number): string;

    /**
     * Receives a string and returns a copy of this string with all lowercase letters changed to uppercase. All other
     *   characters are left unchanged. The definition of what a lowercase letter is depends on the current locale.
    */
    export function upper(this: void, s: string): string;
}

declare namespace table {
    /**
     * Given an array where all elements are strings or numbers, returns `table[i]..sep..table[i+1] ... sep..table[j]`.
     *   The default value for `sep` is the empty string, the default for `i` is 1, and the default for `j` is the
     *   length of the table. If `i` is greater than `j`, returns the empty string.
    */
    export function concat(this: void, table: (string | number)[], sep?: string, i?: number, j?: number): string;

    /**
     * Inserts element `value` at position `pos` in `table`, shifting up other elements to open space, if necessary. The
     *   default value for `pos` is `n+1`, where `n` is the length of the table (see 2.5.5), so that a call
     *   `table.insert(t,x)` inserts `x` at the end of table `t`.
    */
    export function insert<T>(this: void, table: T[], pos: number, value: T): void;

    /**
     * Inserts element `value` at position `pos` in `table`, shifting up other elements to open space, if necessary. The
     *   default value for `pos` is `n+1`, where `n` is the length of the table (see 2.5.5), so that a call
     *   `table.insert(t,x)` inserts `x` at the end of table `t`.
    */
    export function insert<T>(this: void, table: T[], value: T): void;

    /**
     * Returns the largest positive numerical index of the given table, or zero if the table has no positive numerical
     *   indices. (To do its job this function does a linear traversal of the whole table.)
    */
    export function maxn<T extends object>(this: void, table: T): number;

    /**
     * Removes from `table` the element at position `pos`, shifting down other elements to close the space, if
     *   necessary. Returns the value of the removed element. The default value for `pos` is `n`, where `n` is the
     *   length of the table, so that a call `table.remove(t)` removes the last element of table `t`.
    */
    export function remove<T>(this: void, table: T[], pos?: number): T | undefined;

    /**
     * Sorts table elements in a given order, in-place, from `table[1]` to `table[n]`, where `n` is the length of the
     *   table. If `comp` is given, then it must be a function that receives two table elements, and returns true when
     *   the first is less than the second (so that `not comp(a[i+1],a[i])` will be true after the sort). If `comp` is
     *   not given, then the standard Lua operator `<;` is used instead. The sort algorithm is not stable; that is,
     *   elements considered equal by the given order may have their relative positions changed by the sort.
    */
    export function sort<T>(this: void, table: T[], comp?: { (this: void, a: T, b: T): boolean; }): void;
}

declare namespace math {
    /**
     * Returns the absolute value of `x`.
    */
    export function abs(this: void, x: number): number;

    /**
     * Returns the arc cosine of `x` (in radians).
    */
    export function acos(this: void, x: number): number;

    /**
     * Returns the arc sine of `x` (in radians).
    */
    export function asin(this: void, x: number): number;

    /**
     * Returns the arc tangent of `x` (in radians).
    */
    export function atan(this: void, x: number): number;

    /**
     * Returns the arc tangent of `y/x` (in radians), but uses the signs of both parameters to find the quadrant of the
     *   result. (It also handles correctly the case of `x` being zero.)
    */
    export function atan2(this: void, y: number, x: number): number;

    /**
     * Returns the smallest integer larger than or equal to `x`.
    */
    export function ceil(this: void, x: number): number;

    /**
     * Returns the cosine of `x` (assumed to be in radians).
    */
    export function cos(this: void, x: number): number;

    /**
     * Returns the hyperbolic cosine of `x`.
    */
    export function cosh(this: void, x: number): number;

    /**
     * Returns the angle `x` (given in radians) in degrees.
    */
    export function deg(this: void, x: number): number;

    /**
     * Returns the value ex.
    */
    export function exp(this: void, x: number): number;

    /**
     * Returns the largest integer smaller than or equal to `x`.
    */
    export function floor(this: void, x: number): number;

    /**
     * Returns the remainder of the division of `x` by `y` that rounds the quotient towards zero.
    */
    export function fmod(this: void, x: number, y: number): number;

    /**
     * Returns `m` and `e` such that x = m2e, `e` is an integer and the absolute value of `m` is in the range [0.5, 1)
     *   (or zero when `x` is zero).
    */
    export function frexp(this: void, x: number): number;

    /**
     * The value `HUGE_VAL`, a value larger than or equal to any other numerical value.
    */
    export const huge: number;

    /**
     * Returns m2e (`e` should be an integer).
    */
    export function ldexp(this: void, m: number, e: number): number;

    /**
     * Returns the natural logarithm of `x`.
    */
    export function log(this: void, x: number): number;

    /**
     * Returns the base-10 logarithm of `x`.
    */
    export function log10(this: void, x: unknown): unknown;

    /**
     * Returns the maximum value among its arguments.
    */
    export function max(this: void, x: number, ...args: number[]): number;

    /**
     * Returns the minimum value among its arguments.
    */
    export function min(this: void, x: number, ...args: number[]): number;

    /**
     * Returns two numbers, the integral part of `x` and the fractional part of `x`.
    */
    export function modf(this: void, x: number): number;

    /**
     * The value of pi.
    */
    export const pi: number;

    /**
     * Returns xy. (You can also use the expression `x^y` to compute this value.)
    */
    export function pow(this: void, x: number, y: number): number;

    /**
     * Returns the angle `x` (given in degrees) in radians.
    */
    export function rad(this: void, x: number): number;

    /**
     * This function is an interface to the simple pseudo-random generator function `rand` provided by ANSI C. (No
     *   guarantees can be given for its statistical properties.)
     *
     * When called without arguments, returns a uniform pseudo-random real number in the range [0,1). When called with
     *   an integer number `m`, `math.random` returns a uniform pseudo-random integer in the range [1, m]. When called
     *   with two integer numbers `m` and `n`, `math.random` returns a uniform pseudo-random integer in the range [m,
     *   n].
    */
    export function random(this: void, m?: number, n?: number): number;

    /**
     * Sets `x` as the "seed" for the pseudo-random generator: equal seeds produce equal sequences of numbers.
    */
    export function randomseed(this: void, x: number): void;

    /**
     * Returns the sine of `x` (assumed to be in radians).
    */
    export function sin(this: void, x: number): number;

    /**
     * Returns the hyperbolic sine of `x`.
    */
    export function sinh(this: void, x: number): number;

    /**
     * Returns the square root of `x`. (You can also use the expression `x^0.5` to compute this value.)
    */
    export function sqrt(this: void, x: number): number;

    /**
     * Returns the tangent of `x` (assumed to be in radians).
    */
    export function tan(this: void, x: number): number;

    /**
     * Returns the hyperbolic tangent of `x`.
    */
    export function tanh(this: void, x: number): number;
}

declare namespace io {
    /**
     * Equivalent to `file:close()`. Without a `file`, closes the default output file.
    */
    export function close(this: void, file?: LuaFile): void;

    /**
     * Equivalent to `file:flush` over the default output file.
    */
    export function flush(this: void): void;

    /**
     * When called with a file name, it opens the named file (in text mode), and sets its handle as the default input
     *   file. When called with a file handle, it simply sets this file handle as the default input file. When called
     *   without parameters, it returns the current default input file.
     *
     * In case of errors this function raises the error, instead of returning an error code.
    */
    export function input(this: void, file?: string | LuaFile): LuaFile;

    /** @luaIterator */
    export interface FileLinesIterable extends Array<string> {}

    /**
     * Opens the given file name in read mode and returns an iterator function that, each time it is called, returns a
     *   new line from the file. Therefore, the construction
     *
     *      for line in io.lines(filename) do body end
     *
     * will iterate over all lines of the file. When the iterator function detects the end of file, it returns nil (to
     *   finish the loop) and automatically closes the file.
     *
     * The call `io.lines()` (with no file name) is equivalent to `io.input():lines()`; that is, it iterates over the
     *   lines of the default input file. In this case it does not close the file when the loop ends.
    */
    export function lines(this: void, filename?: string): FileLinesIterable;

    /**
     * This function opens a file, in the mode specified in the string `mode`. It returns a new file handle, or, in case
     *   of errors, nil plus an error message.
     *
     * The `mode` string can be any of the following:
     *
     * - "r": read mode (the default);
     * - "w": write mode;
     * - "a": append mode;
     * - "r+": update mode, all previous data is preserved;
     * - "w+": update mode, all previous data is erased;
     * - "a+": append update mode, previous data is preserved, writing is only allowed at the end of file.
     * The `mode` string can also have a '`b`' at the end, which is needed in some systems to open the file in binary
     *   mode. This string is exactly what is used in the standard C function `fopen`.
    */
    /** @tupleReturn */
    export function open(
        this: void,
        filename: string,
        mode?: "r" | "w" | "a" | "r+" | "w+" | "a+" | "rb" | "wb" | "ab" | "r+b" | "w+b" | "a+b"
    ): [LuaFile] | [undefined, string];

    /**
     * Similar to `io.input`, but operates over the default output file.
    */
    export function output(this: void, file?: string | LuaFile): LuaFile;

    /**
     * Starts program `prog` in a separated process and returns a file handle that you can use to read data from this
     *   program (if `mode` is `"r"`, the default) or to write data to this program (if `mode` is `"w"`).
     *
     * This function is system dependent and is not available on all platforms.
    */
    /** @tupleReturn */
    export function popen(this: void, prog: string, mode?: "r" | "w"): [LuaFile] | [undefined, string];

    export type FileReadFormat = "*n" | "*a" | "*l" | number;

    export type FileReadFormatType<F extends FileReadFormat> = F extends "*n" ? number : string;

    export type FileReadFormatTypeTuple<A extends FileReadFormat[]> = {
        [I in keyof A]: A[I] extends "*n" ? number : string
    };

    /**
     * Equivalent to `io.input():read`.
    */
    export function read<F extends FileReadFormat = "*l">(this: void, format?: F): FileReadFormatType<F>;

    /**
     * Equivalent to `io.input():read`.
    */
    /** @tupleReturn */
    export function read<A extends FileReadFormat[]>(this: void, ...formats: A): FileReadFormatTypeTuple<A>;

    export const stderr: LuaFile;

    export const stdin: LuaFile;

    export const stdout: LuaFile;

    /**
     * Returns a handle for a temporary file. This file is opened in update mode and it is automatically removed when
     *   the program ends.
    */
    export function tmpfile(this: void): LuaFile | undefined;

    /**
     * Checks whether `obj` is a valid file handle. Returns the string `"file"` if `obj` is an open file handle,
     *   `"closed file"` if `obj` is a closed file handle, or nil if `obj` is not a file handle.
    */
    export function type(this: void): "file" | "closed file" | undefined;

    /**
     * Equivalent to `io.output():write`.
    */
    /** @tupleReturn */
    export function write(this: void, ...args: (string | number)[]): [LuaFile] | [undefined, string];
}

declare interface LuaFile {
    /**
     * Closes `file`. Note that files are automatically closed when their handles are garbage collected, but that takes
     *   an unpredictable amount of time to happen.
    */
    close(this: this): void;

    /**
     * Saves any written data to `file`.
    */
    flush(this: this): void;

    /**
     * Returns an iterator function that, each time it is called, returns a new line from the file. Therefore, the
     *   construction
     *
     *      for line in file:lines() do body end
     *
     * will iterate over all lines of the file. (Unlike `io.lines`, this function does not close the file when the loop
     *   ends.)
    */
    lines(this: this): io.FileLinesIterable;

    /**
     * Reads the file `file`, according to the given formats, which specify what to read. For each format, the function
     *   returns a string (or a number) with the characters read, or nil if it cannot read data with the specified
     *   format. When called without formats, it uses a default format that reads the entire next line (see below).
     *
     * The available formats are
     *
     * - "*n": reads a number; this is the only format that returns a number instead of a string.
     * - "*a": reads the whole file, starting at the current position. On end of file, it returns the empty string.
     * - "*l": reads the next line (skipping the end of line), returning nil on end of file. This is the default format.
     * - number: reads a string with up to this number of characters, returning nil on end of file. If number is zero,
     *   it reads nothing and returns an empty string, or nil on end of file.
    */
    read<F extends io.FileReadFormat = "*l">(this: this, format?: F): io.FileReadFormatType<F>;

    /**
     * Reads the file `file`, according to the given formats, which specify what to read. For each format, the function
     *   returns a string (or a number) with the characters read, or nil if it cannot read data with the specified
     *   format. When called without formats, it uses a default format that reads the entire next line (see below).
     *
     * The available formats are
     *
     * - "*n": reads a number; this is the only format that returns a number instead of a string.
     * - "*a": reads the whole file, starting at the current position. On end of file, it returns the empty string.
     * - "*l": reads the next line (skipping the end of line), returning nil on end of file. This is the default format.
     * - number: reads a string with up to this number of characters, returning nil on end of file. If number is zero,
     *   it reads nothing and returns an empty string, or nil on end of file.
    */
    /** @tupleReturn */
    read<A extends io.FileReadFormat[]>(this: this, ...formats: A): io.FileReadFormatTypeTuple<A>;

    /**
     * Sets and gets the file position, measured from the beginning of the file, to the position given by `offset` plus
     *   a base specified by the string `whence`, as follows:
     *
     * - "set": base is position 0 (beginning of the file);
     * - "cur": base is current position;
     * - "end": base is end of file;
     * In case of success, function `seek` returns the final file position, measured in bytes from the beginning of the
     *   file. If this function fails, it returns nil, plus a string describing the error.
     *
     * The default value for `whence` is `"cur"`, and for `offset` is 0. Therefore, the call `file:seek()` returns the
     *   current file position, without changing it; the call `file:seek("set")` sets the position to the beginning of
     *   the file (and returns 0); and the call `file:seek("end")` sets the position to the end of the file, and returns
     *   its size.
    */
    /** @tupleReturn */
    seek(this: this, whence?: "set" | "cur" | "end", offset?: number): [number] | [undefined, string];

    /**
     * Sets the buffering mode for an output file. There are three available modes:
     *
     * - "no": no buffering; the result of any output operation appears immediately.
     * - "full": full buffering; output operation is performed only when the buffer is full (or when you explicitly
     *   `flush` the file (see `io.flush`)).
     * - "line": line buffering; output is buffered until a newline is output or there is any input from some special
     *   files (such as a terminal device).
     * For the last two cases, `size` specifies the size of the buffer, in bytes. The default is an appropriate size.
    */
    setvbuf(this: this, mode: "no"): void;

    /**
     * Sets the buffering mode for an output file. There are three available modes:
     *
     * - "no": no buffering; the result of any output operation appears immediately.
     * - "full": full buffering; output operation is performed only when the buffer is full (or when you explicitly
     *   `flush` the file (see `io.flush`)).
     * - "line": line buffering; output is buffered until a newline is output or there is any input from some special
     *   files (such as a terminal device).
     * For the last two cases, `size` specifies the size of the buffer, in bytes. The default is an appropriate size.
    */
    setvbuf(this: this, mode: "full" | "line", size?: number): void;

    /**
     * Writes the value of each of its arguments to the `file`. The arguments must be strings or numbers. To write other
     *   values, use `tostring` or `string.format` before `write`.
    */
    /** @tupleReturn */
    write(this: this, ...args: (string | number)[]): [LuaFile] | [undefined, string];
}

declare namespace os {
    /**
     * Returns an approximation of the amount in seconds of CPU time used by the program.
    */
    export function clock(this: void): number;

    export interface Time {
        year: number;
        month: number;
        day: number;
        hour?: number;
        min?: number;
        sec?: number;
        isdst?: boolean;
    }

    export interface Date extends Time {
        hour: number;
        min: number;
        sec: number;
        wday: number;
        yday: number;
    }

    /**
     * Returns a string or a table containing date and time, formatted according to the given string `format`.
     *
     * If the `time` argument is present, this is the time to be formatted (see the `os.time` function for a description
     *   of this value). Otherwise, `date` formats the current time.
     *
     * If `format` starts with '`!`', then the date is formatted in Coordinated Universal Time. After this optional
     *   character, if `format` is the string "`*t`", then `date` returns a table with the following fields: `year`
     *   (four digits), `month` (1--12), `day` (1--31), `hour` (0--23), `min` (0--59), `sec` (0--61), `wday` (weekday,
     *   Sunday is 1), `yday` (day of the year), and `isdst` (daylight saving flag, a boolean).
     *
     * If `format` is not "`*t`", then `date` returns the date as a string, formatted according to the same rules as the
     *   C function `strftime`.
     *
     * When called without arguments, `date` returns a reasonable date and time representation that depends on the host
     *   system and on the current locale (that is, `os.date()` is equivalent to `os.date("%c")`).
    */
    export function date(this: void, format: "!*t" | "*t", time?: Time): Date;

    /**
     * Returns a string or a table containing date and time, formatted according to the given string `format`.
     *
     * If the `time` argument is present, this is the time to be formatted (see the `os.time` function for a description
     *   of this value). Otherwise, `date` formats the current time.
     *
     * If `format` starts with '`!`', then the date is formatted in Coordinated Universal Time. After this optional
     *   character, if `format` is the string "`*t`", then `date` returns a table with the following fields: `year`
     *   (four digits), `month` (1--12), `day` (1--31), `hour` (0--23), `min` (0--59), `sec` (0--61), `wday` (weekday,
     *   Sunday is 1), `yday` (day of the year), and `isdst` (daylight saving flag, a boolean).
     *
     * If `format` is not "`*t`", then `date` returns the date as a string, formatted according to the same rules as the
     *   C function `strftime`.
     *
     * When called without arguments, `date` returns a reasonable date and time representation that depends on the host
     *   system and on the current locale (that is, `os.date()` is equivalent to `os.date("%c")`).
    */
    export function date(this: void, format?: string, time?: Time): string;

    /**
     * Returns the number of seconds from time `t1` to time `t2`. In POSIX, Windows, and some other systems, this value
     *   is exactly `t2`-`t1`.
    */
    export function difftime(this: void, t2: number, t1: number): number;

    /**
     * This function is equivalent to the C function `system`. It passes `command` to be executed by an operating system
     *   shell. It returns a status code, which is system-dependent. If `command` is absent, then it returns nonzero if
     *   a shell is available and zero otherwise.
    */
    export function execute(this: void, command?: string): number;

    /**
     * Calls the C function `exit`, with an optional `code`, to terminate the host program. The default value for `code`
     *   is the success code.
    */
    export function exit(this: void, code?: number | boolean): void;

    /**
     * Returns the value of the process environment variable `varname`, or nil if the variable is not defined.
    */
    export function getenv(this: void, varname: string): string;

    /**
     * Deletes the file or directory with the given name. Directories must be empty to be removed. If this function
     *   fails, it returns nil, plus a string describing the error.
    */
    /** @tupleReturn */
    export function remove(this: void, filename: string): [true] | [undefined, string, number];

    /**
     * Renames file or directory named `oldname` to `newname`. If this function fails, it returns nil, plus a string
     *   describing the error.
    */
    /** @tupleReturn */
    export function rename(this: void, oldname: string, newname: string): [true] | [undefined, string];

    /**
     * Sets the current locale of the program. `locale` is a string specifying a locale; `category` is an optional
     *   string describing which category to change: `"all"`, `"collate"`, `"ctype"`, `"monetary"`, `"numeric"`, or
     *   `"time"`; the default category is `"all"`. The function returns the name of the new locale, or nil if the
     *   request cannot be honored.
     *
     * If `locale` is the empty string, the current locale is set to an implementation-defined native locale. If
     *   `locale` is the string "`C`", the current locale is set to the standard C locale.
     *
     * When called with nil as the first argument, this function only returns the name of the current locale for the
     *   given category.
    */
    export function setlocale(
        this: void,
        locale?: string,
        category?: "all" | "collate" | "ctype" | "monetary" | "numeric" | "time"
    ): string | undefined;

    /**
     * Returns the current time when called without arguments, or a time representing the date and time specified by the
     *   given table. This table must have fields `year`, `month`, and `day`, and may have fields `hour`, `min`, `sec`,
     *   and `isdst` (for a description of these fields, see the `os.date` function).
     *
     * The returned value is a number, whose meaning depends on your system. In POSIX, Windows, and some other systems,
     *   this number counts the number of seconds since some given start time (the "epoch"). In other systems, the
     *   meaning is not specified, and the number returned by `time` can be used only as an argument to `date` and
     *   `difftime`.
    */
    export function time(this: void, table?: Time): number;

    /**
     * Returns a string with a file name that can be used for a temporary file. The file must be explicitly opened
     *   before its use and explicitly removed when no longer needed.
     *
     * On some systems (POSIX), this function also creates a file with that name, to avoid security risks. (Someone else
     *   might create the file with wrong permissions in the time between getting the name and creating the file.) You
     *   still have to open the file to use it and to remove it (even if you do not use it).
     *
     * When possible, you may prefer to use `io.tmpfile`, which automatically removes the file when the program ends.
    */
    export function tmpname(this: void): string;
}

declare namespace debug {
    /**
     * Enters an interactive mode with the user, running each string that the user enters. Using simple commands and
     *   other debug facilities, the user can inspect global and local variables, change their values, evaluate
     *   expressions, and so on. A line containing only the word `cont` finishes this function, so that the caller
     *   continues its execution.
     *
     * Note that commands for `debug.debug` are not lexically nested within any function, and so have no direct access
     *   to local variables.
    */
    export function debug(this: void): void;

    /**
     * Returns the environment of object `o`.
    */
    export function getfenv(this: void, o: unknown): unknown;

    export interface Hook {
    	(this: void, event: "call" | "return" | "tail return" | "line" | "count", line?: number): void;
    }

    /**
     * Returns the current hook settings of the thread, as three values: the current hook function, the current hook
     *   mask, and the current hook count (as set by the `debug.sethook` function).
    */
    /** @tupleReturn */
    export function gethook(this: void, thread?: LuaThread): [Hook, string, number];

    export interface FunctionInfo {
        name?: string;
        namewhat?: "global" | "local" | "method" | "field" | "upvalue" | "";
        what?: "Lua" | "C" | "main";
        source?: string;
        currentline?: number;
        nups?: number;
        linedefined?: number;
        lastlinedefined?: number;
        short_src?: string;
        func?: Function;
        activelines?: number[];
    }

    /**
     * Returns a table with information about a function. You can give the function directly, or you can give a number
     *   as the value of `function`, which means the function running at level `function` of the call stack of the given
     *   thread: level 0 is the current function (`getinfo` itself); level 1 is the function that called `getinfo`; and
     *   so on. If `function` is a number larger than the number of active functions, then `getinfo` returns nil.
     *
     * The returned table can contain all the fields returned by `lua_getinfo`, with the string `what` describing which
     *   fields to fill in. The default for `what` is to get all information available, except the table of valid lines.
     *   If present, the option '`f`' adds a field named `func` with the function itself. If present, the option '`L`'
     *   adds a field named `activelines` with the table of valid lines.
     *
     * For instance, the expression `debug.getinfo(1,"n").name` returns a table with a name for the current function, if
     *   a reasonable name can be found, and the expression `debug.getinfo(print)` returns a table with all available
     *   information about the `print` function.
    */
    export function getinfo(this: void, function_: Function | number, what?: string): FunctionInfo;

    /**
     * Returns a table with information about a function. You can give the function directly, or you can give a number
     *   as the value of `function`, which means the function running at level `function` of the call stack of the given
     *   thread: level 0 is the current function (`getinfo` itself); level 1 is the function that called `getinfo`; and
     *   so on. If `function` is a number larger than the number of active functions, then `getinfo` returns nil.
     *
     * The returned table can contain all the fields returned by `lua_getinfo`, with the string `what` describing which
     *   fields to fill in. The default for `what` is to get all information available, except the table of valid lines.
     *   If present, the option '`f`' adds a field named `func` with the function itself. If present, the option '`L`'
     *   adds a field named `activelines` with the table of valid lines.
     *
     * For instance, the expression `debug.getinfo(1,"n").name` returns a table with a name for the current function, if
     *   a reasonable name can be found, and the expression `debug.getinfo(print)` returns a table with all available
     *   information about the `print` function.
    */
    export function getinfo(this: void, thread: LuaThread, function_: Function | number, what?: string): FunctionInfo;

    /**
     * This function returns the name and the value of the local variable with index `local` of the function at level
     *   `level` of the stack. (The first parameter or local variable has index 1, and so on, until the last active
     *   local variable.) The function returns nil if there is no local variable with the given index, and raises an
     *   error when called with a `level` out of range. (You can call `debug.getinfo` to check whether the level is
     *   valid.)
     *
     * Variable names starting with '`(`' (open parentheses) represent internal variables (loop control variables,
     *   temporaries, and C function locals).
    */
    /** @tupleReturn */
    export function getlocal(this: void, level: number, local: number): [string, unknown] | [undefined];

    /**
     * This function returns the name and the value of the local variable with index `local` of the function at level
     *   `level` of the stack. (The first parameter or local variable has index 1, and so on, until the last active
     *   local variable.) The function returns nil if there is no local variable with the given index, and raises an
     *   error when called with a `level` out of range. (You can call `debug.getinfo` to check whether the level is
     *   valid.)
     *
     * Variable names starting with '`(`' (open parentheses) represent internal variables (loop control variables,
     *   temporaries, and C function locals).
    */
    /** @tupleReturn */
    export function getlocal(
        this: void,
        thread: LuaThread,
        level: number,
        local: number
    ): [string, unknown] | [undefined];

    /**
     * Returns the metatable of the given `object` or nil if it does not have a metatable.
    */
    export function getmetatable(this: void, object: unknown): unknown;

    /**
     * Returns the registry table (see 3.5).
    */
    export function getregistry(this: void): { [key: string]: unknown; };

    /**
     * This function returns the name and the value of the upvalue with index `up` of the function `func`. The function
     *   returns nil if there is no upvalue with the given index.
    */
    /** @tupleReturn */
    export function getupvalue(this: void, func: Function, up: number): [string, unknown] | [undefined];

    /**
     * Sets the environment of the given `object` to the given `table`. Returns `object`.
    */
    export function setfenv<O, T extends object>(this: void, o: O, table: T): O;

    /**
     * Sets the given function as a hook. The string `mask` and the number `count` describe when the hook will be
     *   called. The string mask may have the following characters, with the given meaning:
     *
     * - `"c"`: the hook is called every time Lua calls a function;
     * - `"r"`: the hook is called every time Lua returns from a function;
     * - `"l"`: the hook is called every time Lua enters a new line of code.
     * With a `count` different from zero, the hook is called after every `count` instructions.
     *
     * When called without arguments, `debug.sethook` turns off the hook.
     *
     * When the hook is called, its first parameter is a string describing the event that has triggered its call:
     *   `"call"`, `"return"` (or `"tail return"`, when simulating a return from a tail call), `"line"`, and `"count"`.
     *   For line events, the hook also gets the new line number as its second parameter. Inside a hook, you can call
     *   `getinfo` with level 2 to get more information about the running function (level 0 is the `getinfo` function,
     *   and level 1 is the hook function), unless the event is `"tail return"`. In this case, Lua is only simulating
     *   the return, and a call to `getinfo` will return invalid data.
    */
    export function sethook(this: void): void;

    /**
     * Sets the given function as a hook. The string `mask` and the number `count` describe when the hook will be
     *   called. The string mask may have the following characters, with the given meaning:
     *
     * - `"c"`: the hook is called every time Lua calls a function;
     * - `"r"`: the hook is called every time Lua returns from a function;
     * - `"l"`: the hook is called every time Lua enters a new line of code.
     * With a `count` different from zero, the hook is called after every `count` instructions.
     *
     * When called without arguments, `debug.sethook` turns off the hook.
     *
     * When the hook is called, its first parameter is a string describing the event that has triggered its call:
     *   `"call"`, `"return"` (or `"tail return"`, when simulating a return from a tail call), `"line"`, and `"count"`.
     *   For line events, the hook also gets the new line number as its second parameter. Inside a hook, you can call
     *   `getinfo` with level 2 to get more information about the running function (level 0 is the `getinfo` function,
     *   and level 1 is the hook function), unless the event is `"tail return"`. In this case, Lua is only simulating
     *   the return, and a call to `getinfo` will return invalid data.
    */
    export function sethook(this: void, hook: Hook, mask: string, count?: number): void;

    /**
     * Sets the given function as a hook. The string `mask` and the number `count` describe when the hook will be
     *   called. The string mask may have the following characters, with the given meaning:
     *
     * - `"c"`: the hook is called every time Lua calls a function;
     * - `"r"`: the hook is called every time Lua returns from a function;
     * - `"l"`: the hook is called every time Lua enters a new line of code.
     * With a `count` different from zero, the hook is called after every `count` instructions.
     *
     * When called without arguments, `debug.sethook` turns off the hook.
     *
     * When the hook is called, its first parameter is a string describing the event that has triggered its call:
     *   `"call"`, `"return"` (or `"tail return"`, when simulating a return from a tail call), `"line"`, and `"count"`.
     *   For line events, the hook also gets the new line number as its second parameter. Inside a hook, you can call
     *   `getinfo` with level 2 to get more information about the running function (level 0 is the `getinfo` function,
     *   and level 1 is the hook function), unless the event is `"tail return"`. In this case, Lua is only simulating
     *   the return, and a call to `getinfo` will return invalid data.
    */
    export function sethook(this: void, thread: LuaThread): void;

    /**
     * Sets the given function as a hook. The string `mask` and the number `count` describe when the hook will be
     *   called. The string mask may have the following characters, with the given meaning:
     *
     * - `"c"`: the hook is called every time Lua calls a function;
     * - `"r"`: the hook is called every time Lua returns from a function;
     * - `"l"`: the hook is called every time Lua enters a new line of code.
     * With a `count` different from zero, the hook is called after every `count` instructions.
     *
     * When called without arguments, `debug.sethook` turns off the hook.
     *
     * When the hook is called, its first parameter is a string describing the event that has triggered its call:
     *   `"call"`, `"return"` (or `"tail return"`, when simulating a return from a tail call), `"line"`, and `"count"`.
     *   For line events, the hook also gets the new line number as its second parameter. Inside a hook, you can call
     *   `getinfo` with level 2 to get more information about the running function (level 0 is the `getinfo` function,
     *   and level 1 is the hook function), unless the event is `"tail return"`. In this case, Lua is only simulating
     *   the return, and a call to `getinfo` will return invalid data.
    */
    export function sethook(this: void, thread: LuaThread, hook: Hook, mask: string, count?: number): void;

    /**
     * This function assigns the value `value` to the local variable with index `local` of the function at level `level`
     *   of the stack. The function returns nil if there is no local variable with the given index, and raises an error
     *   when called with a `level` out of range. (You can call `getinfo` to check whether the level is valid.)
     *   Otherwise, it returns the name of the local variable.
    */
    export function setlocal(this: void, level: number, local: number, value: unknown): string | undefined;

    /**
     * This function assigns the value `value` to the local variable with index `local` of the function at level `level`
     *   of the stack. The function returns nil if there is no local variable with the given index, and raises an error
     *   when called with a `level` out of range. (You can call `getinfo` to check whether the level is valid.)
     *   Otherwise, it returns the name of the local variable.
    */
    export function setlocal(
        this: void,
        thread: LuaThread,
        level: number,
        local: number,
        value: unknown
    ): string | undefined;

    /**
     * Sets the metatable for the given `object` to the given `table` (which can be nil).
    */
    export function setmetatable<M extends object>(this: void, object: unknown, table?: M): boolean;

    /**
     * This function assigns the value `value` to the upvalue with index `up` of the function `func`. The function
     *   returns nil if there is no upvalue with the given index. Otherwise, it returns the name of the upvalue.
    */
    export function setupvalue(this: void, f: Function, up: number, value: unknown): string | undefined;

    /**
     * Returns a string with a traceback of the call stack. An optional `message` string is appended at the beginning of
     *   the traceback. An optional `level` number tells at which level to start the traceback (default is 1, the
     *   function calling `traceback`).
    */
    export function traceback(this: void, message?: string, level?: number): string;

    /**
     * Returns a string with a traceback of the call stack. An optional `message` string is appended at the beginning of
     *   the traceback. An optional `level` number tells at which level to start the traceback (default is 1, the
     *   function calling `traceback`).
    */
    export function traceback(this: void, thread: LuaThread, message?: string, level?: number): string;
}

declare interface String {
    /**
     * Returns the internal numerical codes of the characters `s[i]`, `s[i+1]`, ..., `s[j]`. The default value for `i`
     *   is 1; the default value for `j` is `i`. Note that numerical codes are not necessarily portable across
     *   platforms.
    */
    /** @tupleReturn */
    byte(this: this, i?: string, j?: string): number[];

    /**
     * Looks for the first match of `pattern` in the string `s`. If it finds a match, then `find` returns the indices of
     *   `s` where this occurrence starts and ends; otherwise, it returns nil. A third, optional numerical argument
     *   `init` specifies where to start the search; its default value is 1 and can be negative. A value of true as a
     *   fourth, optional argument `plain` turns off the pattern matching facilities, so the function does a plain "find
     *   substring" operation, with no characters in `pattern` being considered "magic". Note that if `plain` is given,
     *   then `init` must be given as well. If the pattern has captures, then in a successful match the captured values
     *   are also returned, after the two indices.
    */
    /** @tupleReturn */
    find(this: this, pattern: string, init?: number, plain?: boolean): [number, number, ...string[]] | [undefined];

    /**
     * Returns a formatted version of its variable number of arguments following the description given in its first
     *   argument (which must be a string). The format string follows the same rules as the `printf` family of standard
     *   C functions. The only differences are that the options/modifiers `*`, `l`, `L`, `n`, `p`, and `h` are not
     *   supported and that there is an extra option, `q`. The `q` option formats a string in a form suitable to be
     *   safely read back by the Lua interpreter: the string is written between double quotes, and all double quotes,
     *   newlines, embedded zeros, and backslashes in the string are correctly escaped when written. For instance, the
     *   call      string.format('%q', 'a string with "quotes" and \n new line')
     *
     * will produce the string:
     *
     *      "a string with \"quotes\" and \
     *       new line"
     *
     * The options `c`, `d`, `E`, `e`, `f`, `g`, `G`, `i`, `o`, `u`, `X`, and `x` all expect a number as argument,
     *   whereas `q` and `s` expect a string.
     *
     * This function does not accept string values containing embedded zeros, except as arguments to the `q` option.
    */
    format(this: this, ...args: unknown[]): string;

    /**
     * Returns an iterator function that, each time it is called, returns the next captures from `pattern` over string
     *   `s`. If `pattern` specifies no captures, then the whole match is produced in each call. As an example, the
     *   following loop
     *
     *      s = "hello world from Lua"
     *      for w in string.gmatch(s, "%a+") do
     *        print(w)
     *      end
     *
     * will iterate over all the words from string `s`, printing one per line. The next example collects all pairs
     *   `key=value` from the given string into a table:
     *
     *      t = {}
     *      s = "from=world, to=Lua"
     *      for k, v in string.gmatch(s, "(%w+)=(%w+)") do
     *        t[k] = v
     *      end
     *
     * For this function, a '`^`' at the start of a pattern does not work as an anchor, as this would prevent the
     *   iteration.
    */
    gmatch(this: this, pattern: string): string.GmatchIterable;

    /**
     * Returns a copy of `s` in which all (or the first `n`, if given) occurrences of the `pattern` have been replaced
     *   by a replacement string specified by `repl`, which can be a string, a table, or a function. `gsub` also
     *   returns, as its second value, the total number of matches that occurred. If `repl` is a string, then its value
     *   is used for replacement. The character `%` works as an escape character: any sequence in `repl` of the form
     *   `%n`, with n between 1 and 9, stands for the value of the n-th captured substring (see below). The sequence
     *   `%0` stands for the whole match. The sequence `%%` stands for a single `%`.
     *
     * If `repl` is a table, then the table is queried for every match, using the first capture as the key; if the
     *   pattern specifies no captures, then the whole match is used as the key.
     *
     * If `repl` is a function, then this function is called every time a match occurs, with all captured substrings
     *   passed as arguments, in order; if the pattern specifies no captures, then the whole match is passed as a sole
     *   argument.
     *
     * If the value returned by the table query or by the function call is a string or a number, then it is used as the
     *   replacement string; otherwise, if it is false or nil, then there is no replacement (that is, the original match
     *   is kept in the string).
     *
     * Here are some examples:
     *
     *      x = string.gsub("hello world", "(%w+)", "%1 %1")
     *      -->; x="hello hello world world"
     *
     *      x = string.gsub("hello world", "%w+", "%0 %0", 1)
     *      -->; x="hello hello world"
     *
     *      x = string.gsub("hello world from Lua", "(%w+)%s*(%w+)", "%2 %1")
     *      -->; x="world hello Lua from"
     *
     *      x = string.gsub("home = $HOME, user = $USER", "%$(%w+)", os.getenv)
     *      -->; x="home = /home/roberto, user = roberto"
     *
     *      x = string.gsub("4+5 = $return 4+5$", "%$(.-)%$", function (s)
     *            return loadstring(s)()
     *          end)
     *      -->; x="4+5 = 9"
     *
     *      local t = {name="lua", version="5.1"}
     *      x = string.gsub("$name-$version.tar.gz", "%$(%w+)", t)
     *      -->; x="lua-5.1.tar.gz"
    */
    /** @tupleReturn */
    gsub(
        this: this,
        pattern: string,
        repl: string | Record<string, string | number> | { (this: void, ...args: string[]): string | number; },
        n?: number
    ): [string, number];

    /**
     * Receives a string and returns its length. The empty string `""` has length 0. Embedded zeros are counted, so
     *   `"a\000bc\000"` has length 5.
    */
    len(this: this): number;

    /**
     * Receives a string and returns a copy of this string with all uppercase letters changed to lowercase. All other
     *   characters are left unchanged. The definition of what an uppercase letter is depends on the current locale.
    */
    lower(this: this): string;

    /**
     * Looks for the first match of `pattern` in the string `s`. If it finds one, then `match` returns the captures from
     *   the pattern; otherwise it returns nil. If `pattern` specifies no captures, then the whole match is returned. A
     *   third, optional numerical argument `init` specifies where to start the search; its default value is 1 and can
     *   be negative.
    */
    /** @tupleReturn */
    match(this: this, pattern: string, init?: number): string[] | [undefined];

    /**
     * Returns a string that is the concatenation of `n` copies of the string `s`.
    */
    rep(this: this, n: number): string;

    /**
     * Returns a string that is the string `s` reversed.
    */
    reverse(this: this): string;

    /**
     * Returns the substring of `s` that starts at `i` and continues until `j`; `i` and `j` can be negative. If `j` is
     *   absent, then it is assumed to be equal to -1 (which is the same as the string length). In particular, the call
     *   `string.sub(s,1,j)` returns a prefix of `s` with length `j`, and `string.sub(s, -i)` returns a suffix of `s`
     *   with length `i`.
    */
    sub(this: this, i: number, j?: number): string;

    /**
     * Receives a string and returns a copy of this string with all lowercase letters changed to uppercase. All other
     *   characters are left unchanged. The definition of what a lowercase letter is depends on the current locale.
    */
    upper(this: this): string;
}
