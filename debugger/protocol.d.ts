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
}
