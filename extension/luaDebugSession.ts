import {DebugProtocol} from "vscode-debugprotocol";
import {
    Breakpoint,
    InitializedEvent,
    LoggingDebugSession,
    Scope,
    StackFrame,
    Thread
} from "vscode-debugadapter";

type LaunchRequestArguments = DebugProtocol.LaunchRequestArguments & (LuaProgramConfig | CustomProgramConfig);

function isLuaProgramConfig(config: LuaProgramConfig | CustomProgramConfig): config is LuaProgramConfig {
    return (config as LuaProgramConfig).lua !== undefined;
}

const enum ScopeType {
    Global,
    Local,
    Upvalue
}

export class LuaDebugSession extends LoggingDebugSession {
    private onConfigurationDone?: () => void;

    public constructor() {
        super("lldbg-log.txt");
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        if (response.body === undefined) {
            response.body = {};
        }

        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = true;
        // response.body.supportsSetExpression = true; //?
        response.body.supportsSetVariable = true;

        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
    }

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        super.configurationDoneRequest(response, args);

        if (this.onConfigurationDone !== undefined) {
            this.onConfigurationDone();
        }
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
        await this.waitForConfiguration();

        // TODO : launch process
        if (isLuaProgramConfig(args)) {

        } else {

        }

        this.sendResponse(response);
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        // TODO : set breaks
        const filePath = args.source.path as string;
        const lines = args.lines !== undefined ? args.lines : [];

        const actualBreakpoints: Breakpoint[] = [];
        response.body = {breakpoints: actualBreakpoints};
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

        // runtime supports now threads so just return a default thread.
        response.body = {threads: [new Thread(1, "thread 1")]};
        this.sendResponse(response);
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): void {
        const startFrame = typeof args.startFrame === "number" ? args.startFrame : 0;
        const maxLevels = typeof args.levels === "number" ? args.levels : 1000;
        const endFrame = startFrame + maxLevels;

        // TODO : get stack
        const frames: StackFrame[] = [];
        response.body = {stackFrames: frames, totalFrames: frames.length};
        this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        // const frameReference = args.frameId;
        const scopes: Scope[] = [
            new Scope("Local", ScopeType.Local, false),
            new Scope("Upvalue", ScopeType.Upvalue, false),
            new Scope("Global", ScopeType.Global, true)
        ];
        response.body = {scopes};
        this.sendResponse(response);
    }

    protected variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments
    ): void {
        // TODO : get vars
        const variables: DebugProtocol.Variable[] = [];
        // const ref = args.variablesReference;

        response.body = {variables};
        this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        // TODO : cont
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        // TODO : step
        this.sendResponse(response);
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        // TODO : step in
        this.sendResponse(response);
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        // TODO : step out
        this.sendResponse(response);
    }

    protected setVariableRequest(
        response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments
    ): void {
        // TODO : set var
        this.sendResponse(response);
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        // const ctx = args.context;
        // const exp = args.expression;

        // TODO : eval
        const result = "";

        response.body = {result, variablesReference: 0};
        this.sendResponse(response);
    }

    private waitForConfiguration() {
        return new Promise(resolve => this.onConfigurationDone = resolve);
    }
}
