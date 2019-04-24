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
    Variable,
    Handles
} from "vscode-debugadapter";
import * as child_process from "child_process";
import {Message} from "./message";
import * as path from "path";
import * as fs from "fs";

type LaunchRequestArguments = DebugProtocol.LaunchRequestArguments & (LuaProgramConfig | CustomProgramConfig) & {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    sourceRoot?: string;
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

function getEnvKey(env: NodeJS.ProcessEnv, searchKey: string) {
    const upperSearchKey = searchKey.toUpperCase();
    for (const key in env) {
        if (key.toUpperCase() === upperSearchKey) {
            return key;
        }
    }
    return searchKey;
}

const enum ScopeType {
    Local = 1,
    Upvalue,
    Global
}

const mainThreadId = 1;

export class LuaDebugSession extends LoggingDebugSession {
    private readonly fileBreakpointLines: { [file: string]: number[] } = {};
    private process?: child_process.ChildProcess;
    private cwd?: string;
    private sourceRoot?: string;
    private outputText = "";
    private onConfigurationDone?: () => void;
    private readonly messageHandlerQueue: MessageHandler[] = [];
    private readonly variableHandles = new Handles<string>(ScopeType.Global + 1);
    private breakpointsPending = false;

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

        this.sourceRoot = args.sourceRoot;

        this.cwd = this.assert(args.cwd);
        const options/* : child_process.SpawnOptions */ = {
            env: Object.assign({}, process.env),
            cwd: this.cwd,
            shell: true
        };

        if (args.env!== undefined) {
            for (const key in args.env) {
                const envKey = getEnvKey(options.env, key);
                options.env[envKey] = args.env[key];
            }
        }

        const luaPathKey = getEnvKey(options.env, "LUA_PATH");
        let luaPath = options.env[luaPathKey];
        if (luaPath === undefined) {
            luaPath = "";
        } else if (luaPath.length > 0 && !luaPath.endsWith(";")) {
            luaPath += ";";
        }
        options.env[luaPathKey] = luaPath + `${this.assert(args.extensionPath)}/?.lua`;

        if (isLuaProgramConfig(args)) {
            this.process = child_process.spawn(
                args.lua,
                ["-e", `"require('debugger').start([[${args.file}]])"`],
                options
            );

        } else {
            this.process = child_process.spawn(
                args.executable,
                [/* TODO */],
                options
            );
        }

        this.assert(this.process.stdout).on("data", data => this.onDebuggerOutput(data, false));
        this.assert(this.process.stderr).on("data", data => this.onDebuggerOutput(data, true));
        this.process.on("close", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));
        this.process.on("disconnect", () => this.onDebuggerTerminated(`disconnected`));
        this.process.on("error", err => this.onDebuggerTerminated(`error: ${err}`));
        this.process.on("exit", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));

        this.sendEvent(new OutputEvent("[request] launchRequest response"));
        this.sendResponse(response);
    }

    protected async setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ) {
        const filePath = args.source.path as string;
        const fileName = path.basename(filePath);

        let newLines = args.breakpoints !== undefined ? args.breakpoints.map(bp => bp.line) : [];

        if (this.process !== undefined) {
            let oldLines = this.fileBreakpointLines[filePath];
            if (oldLines !== undefined) {
                const filteredNewLines = newLines.filter(l => oldLines.indexOf(l) === -1);
                oldLines = oldLines.filter(l => newLines.indexOf(l) === -1);
                newLines = filteredNewLines;
                for (const line of oldLines) {
                    this.sendCommand(`break delete ${fileName}:${line}`);
                    await this.waitForMessage();
                }
            }

            for (const line of newLines) {
                this.sendCommand(`break set ${fileName}:${line}`);
                await this.waitForMessage();
            }
        } else {
            this.breakpointsPending = true;
        }

        this.fileBreakpointLines[filePath] = newLines;

        const breakpoints: Breakpoint[] = this.fileBreakpointLines[filePath].map(line => new Breakpoint(true, line));
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

        const msg = await this.waitForMessage();

        const startFrame = args.startFrame !== undefined ? args.startFrame : 0;
        const maxLevels = args.levels !== undefined ? args.levels : 100;
        if (msg.type === "stack") {
            const frames: StackFrame[] = [];
            const endFrame = Math.min(startFrame + maxLevels, msg.frames.length);
            for (let i = startFrame; i < endFrame; ++i) {
                const frame = msg.frames[i];

                let sourcePath = this.resolvePath(frame.source);
                if (sourcePath === undefined) {
                    sourcePath = frame.source;
                }

                let source: Source | undefined;
                let line: number | undefined;
                if (frame.mappedSource !== undefined) {
                    const mappedPath = this.resolvePath(
                        this.sourceRoot !== undefined
                            ? path.resolve(this.sourceRoot, frame.mappedSource)
                            : frame.mappedSource
                    );
                    if (mappedPath !== undefined) {
                        source = new Source(path.basename(mappedPath), mappedPath, undefined, sourcePath);
                        line = frame.mappedLine !== undefined ? frame.mappedLine : -1;
                    }
                }
                if (source === undefined || line === undefined) {
                    source = new Source(path.basename(sourcePath), sourcePath);
                    line = frame.line;
                }
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

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments
    ) {
        let cmd: string | undefined;
        let baseName: string | undefined;

        switch (args.variablesReference) {
        case ScopeType.Local:
            cmd = "locals";
            this.sendEvent(new OutputEvent(`[request] variablesRequest locals`));
            break;

        case ScopeType.Upvalue:
            cmd = "ups";
            this.sendEvent(new OutputEvent("[request] variablesRequest ups"));
            break;

        case ScopeType.Global:
            cmd = "globals";
            this.sendEvent(new OutputEvent("[request] variablesRequest globals"));
            break;

        default:
            baseName = this.assert(this.variableHandles.get(args.variablesReference));
            cmd = `props ${baseName}`;
            this.sendEvent(new OutputEvent(`[request] variablesRequest ${baseName}`));
            break;
        }

        this.sendCommand(cmd);
        const vars = await this.waitForMessage();

        const variables: Variable[] = [];
        if (vars.type === "variables") {
            for (const variable of vars.variables) {
                variables.push(this.buildVariable(variable, variable.name));
            }

        } else if (vars.type === "properties") {
            for (const variable of vars.properties) {
                const refName = baseName === undefined ? variable.name : `${baseName}[${variable.name}]`;
                variables.push(this.buildVariable(variable, refName));
            }

            if (vars.metatable !== undefined) {
                variables.push(this.buildVariable(vars.metatable, `getmetatable(${baseName})`, "[metatable]"));
            }
        }

        response.body = {variables};
        this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.sendEvent(new OutputEvent("[request] continueRequest"));
        this.variableHandles.reset();
        this.sendCommand("cont");
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.sendEvent(new OutputEvent("[request] nextRequest"));
        this.variableHandles.reset();
        this.sendCommand("step");
        this.sendResponse(response);
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this.sendEvent(new OutputEvent("[request] stepInRequest"));
        this.variableHandles.reset();
        this.sendCommand("stepin");
        this.sendResponse(response);
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        this.sendEvent(new OutputEvent("[request] stepOutRequest"));
        this.variableHandles.reset();
        this.sendCommand("stepout");
        this.sendResponse(response);
    }

    protected async setVariableRequest(
        response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments
    ) {
        let name: string;
        if (args.variablesReference > ScopeType.Global) {
            name = `${this.variableHandles.get(args.variablesReference)}[${args.name}]`;
        } else {
            name = args.name;
        }
        this.sendEvent(new OutputEvent(`[request] setVariableRequest ${name} = ${args.value}`));

        this.sendCommand(`exec ${name} = ${args.value}; return ${name}`);

        const [value, variableReference] = await this.getEvaluateResult(args.value);

        response.body = {value, variablesReference: variableReference};
        this.sendResponse(response);
    }

    protected async evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ) {
        const expression = args.expression;
        this.sendEvent(new OutputEvent(`[request] evaluateRequest ${expression}`));

        this.sendCommand(`eval ${expression}`);

        const [result, variableReference] = await this.getEvaluateResult(expression);

        response.body = {result, variablesReference: variableReference};
        this.sendResponse(response);
    }

    private async getEvaluateResult(expression: string): Promise<[string, number]> {
        const msg = await this.waitForMessage();
        let result = "[error]";
        let variableReference = 0;
        if (msg.type === "result") {
            result = `${msg.result.value !== undefined ? msg.result.value : `[${msg.result.type}]`}`;
            if (msg.result.type === "table") {
                variableReference = this.variableHandles.create(expression);
            }
        } else if (msg.type === "error") {
            result = `[error: ${msg.error}]`;
        }
        return [result, variableReference];
    }

    private buildVariable(variable: LuaDebug.Variable, refName: string): Variable;
    private buildVariable(value: LuaDebug.Value, refName: string, variableName: string): Variable;
    private buildVariable(variable: LuaDebug.Variable | LuaDebug.Value, refName: string, variableName?: string) {
        let valueStr: string;
        let ref: number | undefined;
        if (variable.type === "table") {
            ref = this.variableHandles.create(refName);
            valueStr = variable.value !== undefined ? variable.value : "[table]";
        } else if (variable.value === undefined) {
            valueStr = `[${variable.type}]`;
        } else {
            valueStr = variable.value;
        }
        return new Variable(
            variableName !== undefined ? variableName : (variable as LuaDebug.Variable).name,
            valueStr,
            ref
        );
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

    private resolvePath(filePath: string) {
        if (path.isAbsolute(filePath)) {
            return fs.existsSync(filePath) ? filePath : undefined;
        }
        const fullPath = path.resolve(this.assert(this.cwd), filePath);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
        return undefined;
    }

    private async onDebuggerStop(msg: LuaDebug.DebugBreak) {
        if (this.breakpointsPending) {
            this.breakpointsPending = false;

            for (const file in this.fileBreakpointLines) {
                const lines = this.fileBreakpointLines[file];
                for (const line of lines) {
                    this.sendCommand(`break set ${file}:${line}`);
                    await this.waitForMessage();
                }
            }
        }

        if (msg.breakType === "error") {
            this.sendEvent(new StoppedEvent("exception", mainThreadId, msg.message));
        } else {
            this.sendEvent(new StoppedEvent("breakpoint", mainThreadId));
        }
    }

    private async onDebuggerOutput(data: unknown, isError: boolean) {
        const dataStr = `${data}`;
        if (isError) {
            this.sendEvent(new OutputEvent(`[stderr] ${dataStr}`));
            return;
        }

        this.outputText += dataStr;

        const [messages, processed, unprocessed] = Message.parse(this.outputText);
        let debugBreak: LuaDebug.DebugBreak | undefined;
        for (const msg of messages) {
            this.sendEvent(new OutputEvent(`[message] ${JSON.stringify(msg)}`));
            if (msg.type === "debugBreak") {
                debugBreak = msg;
            } else {
                const handler = this.messageHandlerQueue.shift();
                if (handler !== undefined) {
                    handler(msg);
                }
            }
        }

        this.sendEvent(new OutputEvent(`[stdout] ${processed}`));

        this.outputText = unprocessed;

        if (debugBreak !== undefined) {
            await this.onDebuggerStop(debugBreak);
        }
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

    private waitForMessage(): Promise<LuaDebug.Message> {
        return new Promise(
            resolve => {
                this.messageHandlerQueue.push(resolve);
            }
        );
    }

    private waitForConfiguration() {
        return new Promise(resolve => this.onConfigurationDone = resolve);
    }
}
