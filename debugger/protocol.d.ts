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
        breakType: "breakpoint" | "error";
    }

    interface Result extends MessageBase {
        type: "result";
        result: unknown;
    }

    interface Frame {
        source: string;
        line: number;
        func?: string;
        active?: boolean;
        mappedSource?: string;
        mappedLine?: number;
    }

    interface Stack extends MessageBase {
        type: "stack";
        frames: Frame[];
    }

    interface TableRef {
        name: string;
        index: number;
    }

    interface Value {
        name: string;
        type: string;
        value?: string;
    }

    type Variable = Value | TableRef;

    interface Table {
        properties: Variable[];
    }

    interface Variables extends MessageBase {
        type: "variables";
        tables: Table[];
        variables: Variable[];
    }

    interface Breakpoint {
        line: number;
        file: string;
        pattern: string;
        enabled: boolean;
    }

    interface Breakpoints extends MessageBase {
        type: "breakpoints";
        breakpoints: Breakpoint[];
    }

    type Message = Error | DebugBreak | Result | Stack | Variables | Breakpoints;
}
