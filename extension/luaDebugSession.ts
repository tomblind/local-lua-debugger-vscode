/// <reference path = "../debugger/protocol.d.ts" />
import {DebugProtocol} from "vscode-debugprotocol";
import {
    Breakpoint,
    InitializedEvent,
    LoggingDebugSession,
    Scope,
    StackFrame,
    Source,
    Thread,
    OutputEvent,
    TerminatedEvent,
    StoppedEvent,
    Variable
} from "vscode-debugadapter";
import * as child_process from "child_process";
import {Message} from "./message";
import * as path from "path";
import * as fs from "fs";

type LaunchRequestArguments = DebugProtocol.LaunchRequestArguments & (LuaProgramConfig | CustomProgramConfig) & {
    cwd?: string;
    extensionPath?: string;
};

function isLuaProgramConfig(config: LuaProgramConfig | CustomProgramConfig): config is LuaProgramConfig {
    return (config as LuaProgramConfig).lua !== undefined;
}

type MessageTypeName = LuaDebug.Message["type"];

type MessageTypeOf<T extends MessageTypeName> = Extract<LuaDebug.Message, { type: T }>;

interface MessageHandler<T extends LuaDebug.Message = LuaDebug.Message> {
    (msg: T): void;
}

function isTableRef(variable: LuaDebug.Variable): variable is LuaDebug.TableRef {
    return (variable as LuaDebug.TableRef).index !== undefined;
}

const enum ScopeType {
    Local = 1,
    Upvalue,
    Global
}

const scopeShift = 29;
const scopeMask = 3 << scopeShift;

const mainThreadId = 1;

export class LuaDebugSession extends LoggingDebugSession {
    private readonly fileBreakpointLines: { [file: string]: number[] } = {};
    private process?: child_process.ChildProcess;
    private cwd?: string;
    private outputText = "";

    private onConfigurationDone?: () => void;

    private readonly handlers: { [T in MessageTypeName]?: MessageHandler<MessageTypeOf<T>>; } = {
        debugBreak: msg => {
            if (msg.breakType === "error") {
                this.sendEvent(new StoppedEvent("exception", mainThreadId, msg.message));
            } else {
                this.sendEvent(new StoppedEvent("breakpoint", mainThreadId));
            }
        }
    };

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
        response.body.supportsSetVariable = true;

        this.sendEvent(new OutputEvent("[request] initializeRequest"));
        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
    }

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        super.configurationDoneRequest(response, args);

        this.sendEvent(new OutputEvent("[request] configurationDoneRequest"));

        if (this.onConfigurationDone !== undefined) {
            this.onConfigurationDone();
        }
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
        this.sendEvent(new OutputEvent(`[request] launchRequest ${process.cwd()}`));
        await this.waitForConfiguration();

        if (isLuaProgramConfig(args)) {
            this.cwd = this.assert(args.cwd);
            const options/* : child_process.SpawnOptions */ = {
                env: {} as NodeJS.ProcessEnv,
                cwd: this.cwd,
                shell: true
            };
            for (const key in process.env) {
                options.env[key.toUpperCase()] = process.env[key];
            }

            const extensionPath = this.assert(args.extensionPath);
            const luaPath = `${extensionPath}/?.lua`;
            if (options.env.LUA_PATH !== undefined && options.env.LUA_PATH.length > 0) {
                options.env.LUA_PATH = `${options.env.LUA_PATH};${luaPath}`;
            } else {
                options.env.LUA_PATH = luaPath;
            }
            this.process = child_process.spawn(
                args.lua,
                ["-e", `"require('debugger').start([[${args.file}]])"`],
                // [`"${args.file}"`],
                options
            );
            this.assert(this.process.stdout).on("data", data => this.onDebuggerOutput(data, false));
            this.assert(this.process.stderr).on("data", data => this.onDebuggerOutput(data, true));
            this.process.on("close", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));
            this.process.on("disconnect", () => this.onDebuggerTerminated(`disconnected`));
            this.process.on("error", err => this.onDebuggerTerminated(`error: ${err}`));
            this.process.on("exit", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));

        } else {
            this.sendEvent(new OutputEvent(`[request] launchRequest exe ${args.executable} ${args.args}`));

        }

        this.sendEvent(new OutputEvent("[request] launchRequest response"));
        this.sendResponse(response);
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        const filePath = args.source.path as string;
        const lines = args.lines !== undefined ? args.lines : [];
        this.fileBreakpointLines[filePath] = lines;

        const breakpoints: Breakpoint[] = lines.map(line => new Breakpoint(true, line));
        response.body = {breakpoints};
        this.sendEvent(new OutputEvent(`[request] setBreakPointsRequest`));
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {threads: [new Thread(mainThreadId, "main thread")]};
        this.sendEvent(new OutputEvent("[request] threadsRequest"));
        this.sendResponse(response);
    }

    protected async stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ) {
        this.sendEvent(new OutputEvent(`[request] stackTraceRequest ${args.startFrame}/${args.levels}`));

        this.sendCommand("stack");

        const msg = await this.waitForMessages("stack", "error");

        const startFrame = args.startFrame !== undefined ? args.startFrame : 0;
        const maxLevels = args.levels !== undefined ? args.levels : 100;
        if (msg.type === "stack") {
            const frames: StackFrame[] = [];
            const endFrame = Math.min(startFrame + maxLevels, msg.frames.length);
            for (let i = startFrame; i < endFrame; ++i) {
                const frame = msg.frames[i];
                let source: Source;
                let line: number;
                // if (frame.mappedSource !== undefined) {
                //     source = new Source(path.basename(frame.mappedSource), frame.mappedSource, undefined, frame.source);
                //     line = frame.mappedLine !== undefined ? frame.mappedLine : -1;
                // } else {
                    const fullPath = path.isAbsolute(frame.source)
                        ? frame.source
                        : path.resolve(this.assert(this.cwd), frame.source);
                    source = new Source(path.basename(frame.source), fs.existsSync(fullPath) ? fullPath : frame.source);
                    line = frame.line;
                // }

                frames.push(new StackFrame(i, frame.func !== undefined ? frame.func : "???", source, line));
            }
            response.body = {stackFrames: frames, totalFrames: msg.frames.length};

        } else {
            response.body = {stackFrames: [], totalFrames: 0};
        }
        this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        this.sendEvent(new OutputEvent(`[request] scopesRequest ${args.frameId}`));
        this.sendCommand(`frame ${args.frameId + 1}`);

        const scopes: Scope[] = [
            new Scope("Local", ScopeType.Local, false),
            new Scope("Upvalue", ScopeType.Upvalue, false),
            new Scope("Global", ScopeType.Global, false)
        ];
        response.body = {scopes};
        this.sendResponse(response);
    }

    private localVariables?: LuaDebug.Variables;
    private upvalueVariables?: LuaDebug.Variables;
    private globalVariables?: LuaDebug.Variables;

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments
    ) {
        let luaVariables: LuaDebug.Variable[] | undefined;
        let scopeFlags = 0;

        switch (args.variablesReference) {
        case ScopeType.Local:
            this.sendEvent(new OutputEvent(`[request] variablesRequest locals`));
            scopeFlags = ScopeType.Local << scopeShift;
            this.sendCommand("locals");
            const locals = await this.waitForMessages("variables", "error");
            if (locals.type === "variables") {
                luaVariables = locals.variables;
                this.localVariables = locals;
            } else {
                this.localVariables = undefined;
            }
            break;

        case ScopeType.Upvalue:
            this.sendEvent(new OutputEvent("[request] variablesRequest ups"));
            scopeFlags = ScopeType.Upvalue << scopeShift;
            this.sendCommand("ups");
            const ups = await this.waitForMessages("variables", "error");
            if (ups.type === "variables") {
                luaVariables = ups.variables;
                this.upvalueVariables = ups;
            } else {
                this.upvalueVariables = undefined;
            }
            break;

        case ScopeType.Global:
            this.sendEvent(new OutputEvent("[request] variablesRequest globals"));
            scopeFlags = ScopeType.Global << scopeShift;
            this.sendCommand("globals");
            const globals = await this.waitForMessages("variables", "error");
            if (globals.type === "variables") {
                luaVariables = globals.variables;
                this.globalVariables = globals;
            } else {
                this.globalVariables = undefined;
            }
            break;

        default:
            const scopeType = (args.variablesReference & scopeMask) >> scopeShift;
            const index = args.variablesReference & (~scopeMask);
            if (scopeType === ScopeType.Local) {
                scopeFlags = ScopeType.Local << scopeShift;
                luaVariables = this.assert(this.assert(this.localVariables).tables[index - 1]).properties;
            } else if (scopeType === ScopeType.Upvalue) {
                scopeFlags = ScopeType.Upvalue << scopeShift;
                luaVariables = this.assert(this.assert(this.upvalueVariables).tables[index - 1]).properties;
            } else {
                luaVariables = this.assert(this.assert(this.globalVariables).tables[index - 1]).properties;
            }
            scopeFlags = scopeType << scopeShift;
            this.sendEvent(new OutputEvent(`[request] variablesRequest ${scopeType === ScopeType.Local ? "local" : scopeType === ScopeType.Upvalue ? "up" : "global"} ${index}`));
            break;
        }

        const variables: Variable[] = [];
        if (luaVariables !== undefined) {
            for (const variable of luaVariables) {
                let value: string;
                let ref: number | undefined;
                if (isTableRef(variable)) {
                    ref = variable.index | scopeFlags;
                    value = "[table]";
                } else if (variable.value === undefined) {
                    value = `[${variable.type}]`;
                } else {
                    value = variable.value;
                }
                variables.push(new Variable(variable.name, value, ref));
            }
        }

        response.body = {variables};
        this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.sendEvent(new OutputEvent("[request] continueRequest"));
        this.sendCommand("cont");
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.sendEvent(new OutputEvent("[request] nextRequest"));
        this.sendCommand("step");
        this.sendResponse(response);
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this.sendEvent(new OutputEvent("[request] stepInRequest"));
        this.sendCommand("stepin");
        this.sendResponse(response);
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        this.sendEvent(new OutputEvent("[request] stepOutRequest"));
        this.sendCommand("stepout");
        this.sendResponse(response);
    }

    protected setVariableRequest(
        response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments
    ): void {
        // TODO : set var
        this.sendEvent(new OutputEvent("[request] setVariableRequest"));
        this.sendResponse(response);
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        // const ctx = args.context;
        // const exp = args.expression;

        // TODO : eval
        const result = "";

        response.body = {result, variablesReference: 0};
        this.sendEvent(new OutputEvent("[request] evaluateRequest"));
        this.sendResponse(response);
    }

    private waitForConfiguration() {
        return new Promise(resolve => this.onConfigurationDone = resolve);
    }

    private assert<T>(value: T | null | undefined, message?: string): T {
        if (value === null || value === undefined) {
            if (message === undefined) {
                message = "assertion failed";
            }
            this.sendEvent(new OutputEvent(message));
            throw new Error(message);
        }
        return value;
    }

    private onDebuggerOutput(data: unknown, isError: boolean) {
        const dataStr = `${data}`;
        if (isError) {
            this.sendEvent(new OutputEvent(`[stderr] ${dataStr}`));
            return;
        }

        this.outputText += dataStr;

        const [messages, processed, unprocessed] = Message.parse(this.outputText);
        for (const msg of messages) {
            const handler = this.handlers[msg.type] as MessageHandler | undefined;
            if (handler !== undefined) {
                handler(msg);
            }
            this.sendEvent(new OutputEvent(`[message] ${JSON.stringify(msg)}`));
        }

        this.sendEvent(new OutputEvent(`[stdout] ${processed}`));

        this.outputText = unprocessed;
    }

    private onDebuggerTerminated(result: string) {
        if (this.process === undefined) {
            return;
        }

        this.sendEvent(new OutputEvent(`debugging ended: ${result}`));
        this.sendEvent(new TerminatedEvent());
        this.process = undefined;
    }

    private sendCommand(cmd: string) {
        this.sendEvent(new OutputEvent(`[command] ${cmd}`));
        this.assert(this.assert(this.process).stdin).write(`${cmd}\n`);
    }

    private waitForMessages<A extends MessageTypeName[]>(...msgTypes: A): Promise<MessageTypeOf<A[number]>> {
        return new Promise(
            resolve => {
                const cleanupAndResolve = (msg: LuaDebug.Message) => {
                    for (const msgType of msgTypes) {
                        this.handlers[msgType] = undefined;
                    }
                    resolve(msg as MessageTypeOf<A[number]>);
                };
                for (const msgType of msgTypes) {
                    this.handlers[msgType] = cleanupAndResolve;
                }
            }
        );
    }
}
