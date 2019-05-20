declare namespace LuaDebug {
    type Tag = "$luaDebug";

    interface MessageBase {
        tag: Tag;
    }

    interface Error extends MessageBase {
        type: "error";
        error: string;
    }

    interface DebugBreak extends MessageBase {
        type: "debugBreak";
        message: string;
        breakType: "step" | "breakpoint" | "error";
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
    }

    interface Breakpoints extends MessageBase {
        type: "breakpoints";
        breakpoints: Breakpoint[];
    }

    type Message = Error | DebugBreak | Result | Stack | Variables | Properties | Breakpoints;
}
