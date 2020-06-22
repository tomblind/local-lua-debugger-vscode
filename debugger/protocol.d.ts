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

declare namespace LuaDebug {
    interface MessageBase {
        tag: "$luaDebug";
    }

    interface Error extends MessageBase {
        type: "error";
        error: string;
    }

    interface DebugBreak extends MessageBase {
        type: "debugBreak";
        message: string;
        breakType: "step" | "breakpoint" | "error";
        threadId: number;
    }

    interface MappedLocation {
        source: string;
        line: number;
        column: number;
    }

    interface Frame {
        source: string;
        line: number;
        func?: string;
        active?: boolean;
        mappedLocation?: MappedLocation;
    }

    interface Stack extends MessageBase {
        type: "stack";
        frames: Frame[];
    }

    interface Value {
        type: string;
        value?: string;
        length?: number;
    }

    interface Variable extends Value {
        name: string;
    }

    interface Variables extends MessageBase {
        type: "variables";
        variables: Variable[];
    }

    interface Properties extends MessageBase {
        type: "properties";
        properties: Variable[];
        metatable?: Value;
        length?: number;
    }

    interface Result extends MessageBase {
        type: "result";
        result: Value;
    }

    interface Breakpoint {
        line: number;
        file: string;
        enabled: boolean;
        condition?: string;
    }

    interface Breakpoints extends MessageBase {
        type: "breakpoints";
        breakpoints: Breakpoint[];
    }

    interface Thread {
        name: string;
        id: number;
        active?: boolean;
    }

    interface Threads extends MessageBase {
        type: "threads",
        threads: Thread[];
    }

    type Message = Error | DebugBreak | Result | Stack | Variables | Properties | Breakpoints | Threads;

    type ScriptRootsEnv = "LOCAL_LUA_DEBUGGER_SCRIPT_ROOTS";
}
