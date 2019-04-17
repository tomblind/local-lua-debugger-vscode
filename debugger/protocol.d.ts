declare namespace LuaDebug {
    interface Error {
        error: string;
    }

    interface DebugBreak {
        debugBreak: {
            message: string;
            type: "breakpoint" | "error";
        }
    }

    interface Result {
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

    interface Stack {
        frames: Frame[];
    }

    interface Variable {
        name: string;
        type: string;
    }

    interface Variables {
        variables: Variable[];
    }

    interface Breakpoint {
        line: number;
        file: string;
        pattern: string;
        enabled: boolean;
    }

    interface Breakpoints {
        breakpoints: Breakpoint[];
    }
}
