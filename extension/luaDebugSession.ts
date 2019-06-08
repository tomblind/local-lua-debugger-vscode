//MIT License
//
//Copyright (c) 2019 Tom Blind
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
    Handles,
    ThreadEvent
} from "vscode-debugadapter";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import {Message} from "./message";
import {LaunchConfig, isCustomProgramConfig} from "./launchConfig";

interface MessageHandler<T extends LuaDebug.Message = LuaDebug.Message> {
    (msg: T): void;
}

const enum ScopeType {
    Local = 1,
    Upvalue,
    Global
}

const enum OutputCategory {
    StdOut = "stdout",
    StdErr = "stderr",
    Command = "command",
    Request = "request",
    Message = "message",
    Info = "info",
    Error = "error"
}

const mainThreadId = 1;
const maxStackCount = 100;
const metatableDisplayName = "[[metatable]]";
const tableLengthDisplayName = "[[length]]";
const envVariable = "LOCAL_LUA_DEBUGGER_VSCODE";

function getEnvKey(env: NodeJS.ProcessEnv, searchKey: string) {
    const upperSearchKey = searchKey.toUpperCase();
    for (const key in env) {
        if (key.toUpperCase() === upperSearchKey) {
            return key;
        }
    }
    return searchKey;
}

function sortVariables(a: Variable, b: Variable): number {
    const aIsBracketted = a.name.startsWith("[[");
    const bIsBracketted = b.name.startsWith("[[");
    if (aIsBracketted !== bIsBracketted) {
        return aIsBracketted ? -1 : 1;
    }

    const aAsNum = +a.name;
    const bAsNum = +b.name;
    const aIsNum = !isNaN(aAsNum);
    const bIsNum = !isNaN(bAsNum);
    if (aIsNum !== bIsNum) {
        return aIsNum ? -1 : 1;
    } else if (aIsNum && bIsNum) {
        return aAsNum - bAsNum;
    }

    let aName = a.name.replace("[", " ");
    let bName = b.name.replace("[", " ");

    const aNameLower = aName.toLowerCase();
    const bNameLower = bName.toLowerCase();
    if (aNameLower !== bNameLower) {
        aName = aNameLower;
        bName = bNameLower;
    }

    if (aName === bName) {
        return 0;
    } else if (aName < bName) {
        return -1;
    } else {
        return 1;
    }
}

function parseFrameId(frameId: number) {
    return {threadId: Math.floor(frameId / maxStackCount) + 1, frame: frameId % maxStackCount + 1};
}

function makeFrameId(threadId: number, frame: number) {
    return (threadId - 1) * maxStackCount + (frame - 1);
}

export class LuaDebugSession extends LoggingDebugSession {
    private readonly fileBreakpoints: { [file: string]: DebugProtocol.SourceBreakpoint[] | undefined } = {};
    private config?: LaunchConfig;
    private process?: child_process.ChildProcess;
    private outputText = "";
    private onConfigurationDone?: () => void;
    private readonly messageHandlerQueue: MessageHandler[] = [];
    private readonly variableHandles = new Handles<string>(ScopeType.Global + 1);
    private breakpointsPending = false;
    private autoContinueNext = false;
    private readonly activeThreads = new Map<number, Thread>();
    private isRunning = false;

    public constructor() {
        super("lldebugger-log.txt");
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        this.showOutput("initializeRequest", OutputCategory.Request);

        if (response.body === undefined) {
            response.body = {};
        }

        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = true;
        response.body.supportsSetVariable = true;
        response.body.supportsTerminateRequest = true;
        response.body.supportsConditionalBreakpoints = true;

        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
    }

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        this.showOutput("configurationDoneRequest", OutputCategory.Request);

        super.configurationDoneRequest(response, args);

        if (this.onConfigurationDone !== undefined) {
            this.onConfigurationDone();
        }
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: DebugProtocol.LaunchRequestArguments & LaunchConfig
    ) {
        this.config = args;
        this.autoContinueNext = args.breakOnAttach !== true;

        this.showOutput("launchRequest", OutputCategory.Request);

        await this.waitForConfiguration();

        //Setup process
        const processOptions: child_process.SpawnOptions = {
            env: Object.assign({}, process.env),
            cwd: this.assert(this.config.launch.cwd),
            shell: true
        };
        processOptions.env = this.assert(processOptions.env);

        if (args.launch.env !== undefined) {
            for (const key in args.launch.env) {
                const envKey = getEnvKey(processOptions.env, key);
                processOptions.env[envKey] = args.launch.env[key];
            }
        }

        //Set an environment variable so the debugger can detect the attached extension
        processOptions.env[envVariable] = "1";

        //Append lua path so it can find debugger script
        const luaPathKey = getEnvKey(processOptions.env, "LUA_PATH");
        let luaPath = processOptions.env[luaPathKey];
        if (luaPath === undefined) {
            luaPath = "";
        } else if (luaPath.length > 0 && !luaPath.endsWith(";")) {
            luaPath += ";";
        }
        processOptions.env[luaPathKey] = luaPath + `${args.extensionPath}/?.lua`;

        //Launch process
        let processExecutable: string;
        let processArgs: string[];
        if (isCustomProgramConfig(args.launch)) {
            processExecutable = `"${args.launch.executable}"`;
            processArgs = args.launch.args !== undefined ? args.launch.args : [];

        } else {
            processExecutable = `"${args.launch.lua}"`;
            processArgs = ["-e", `"require('lldebugger').runFile([[${args.launch.file}]], true)"`];
        }
        this.process = child_process.spawn(processExecutable, processArgs, processOptions);

        this.showOutput(
            `launching "${processExecutable} ${processArgs.join(" ")}" from ${this.config.launch.cwd}`,
            OutputCategory.Info
        );

        //Process callbacks
        this.assert(this.process.stdout).on("data", data => this.onDebuggerOutput(data, false));
        this.assert(this.process.stderr).on("data", data => this.onDebuggerOutput(data, true));
        this.process.on("close", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));
        this.process.on("disconnect", () => this.onDebuggerTerminated(`disconnected`));
        this.process.on(
            "error",
            err => this.onDebuggerTerminated(`Failed to launch "${processExecutable}": ${err}`, OutputCategory.Error)
        );
        this.process.on("exit", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));

        this.showOutput(`process launched`, OutputCategory.Info);
        this.sendResponse(response);
    }

    protected async setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ) {
        this.showOutput(`setBreakPointsRequest`, OutputCategory.Request);

        const filePath = args.source.path as string;

        if (this.process !== undefined && !this.isRunning) {
            const oldBreakpoints = this.fileBreakpoints[filePath];
            if (oldBreakpoints !== undefined) {
                for (const breakpoint of oldBreakpoints) {
                    await this.deleteBreakpoint(filePath, breakpoint);
                }
            }

            if (args.breakpoints !== undefined) {
                for (const breakpoint of args.breakpoints) {
                    await this.setBreakpoint(filePath, breakpoint);
                }
            }

        } else {
            this.breakpointsPending = true;
        }

        this.fileBreakpoints[filePath] = args.breakpoints;

        const breakpoints: Breakpoint[] = args.breakpoints !== undefined
            ? args.breakpoints.map(breakpoint => new Breakpoint(true, breakpoint.line))
            : [];
        response.body = {breakpoints};
        this.sendResponse(response);
    }

    protected async threadsRequest(response: DebugProtocol.ThreadsResponse) {
        this.showOutput(`threadsRequest`, OutputCategory.Request);

        this.sendCommand("threads");
        const msg = await this.waitForMessage();

        if (msg.type === "threads") {
            //Remove dead threads
            const activeThreadIds = [...this.activeThreads.keys()];
            for (const activeId of activeThreadIds) {
                if (!msg.threads.some(({id}) => activeId === id)) {
                    this.sendEvent(new ThreadEvent("exited", activeId));
                    this.activeThreads.delete(activeId);
                }
            }

            //Create new threads
            const newThreads = msg.threads.filter(({id}) => !this.activeThreads.has(id));
            for (const {id, name} of newThreads) {
                this.activeThreads.set(id, new Thread(id, name));
            }

            response.body = {threads: [...this.activeThreads.values()]};

        } else {
            response.body = {threads: [new Thread(mainThreadId, "main thread")]};
        }

        this.sendResponse(response);
    }

    protected async stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ) {
        this.showOutput(
            `stackTraceRequest ${args.startFrame}/${args.levels} (thread ${args.threadId})`, OutputCategory.Request
        );

        this.sendCommand(`thread ${args.threadId}`);
        const msg = await this.waitForMessage();

        const startFrame = args.startFrame !== undefined ? args.startFrame : 0;
        const maxLevels = args.levels !== undefined ? args.levels : maxStackCount;
        if (msg.type === "stack") {
            const frames: DebugProtocol.StackFrame[] = [];
            const endFrame = Math.min(startFrame + maxLevels, msg.frames.length);
            for (let i = startFrame; i < endFrame; ++i) {
                const frame = msg.frames[i];

                let source: Source | undefined;
                let line = frame.line;
                let column = 1; //Needed for exception display: https://github.com/microsoft/vscode/issues/46080

                //Mapped source
                if (frame.mappedLocation !== undefined) {
                    const sourceRoot = this.assert(this.config).sourceRoot;
                    const mappedPath = this.resolvePath(
                        sourceRoot !== undefined
                            ? path.resolve(sourceRoot, frame.mappedLocation.source)
                            : frame.mappedLocation.source
                    );
                    if (mappedPath !== undefined) {
                        source = new Source(path.basename(mappedPath), mappedPath);
                        line = frame.mappedLocation.line;
                        column = frame.mappedLocation.column;
                    }
                }

                //Un-mapped source
                const sourcePath = this.resolvePath(frame.source);
                if (source === undefined && sourcePath !== undefined) {
                    source = new Source(path.basename(frame.source), sourcePath);
                }

                //Function name
                let frameFunc = frame.func !== undefined ? frame.func : "???";
                if (sourcePath === undefined) {
                    frameFunc += ` ${frame.source}`;
                }

                const frameId = makeFrameId(args.threadId, i + 1);
                const stackFrame: DebugProtocol.StackFrame = new StackFrame(frameId, frameFunc, source, line, column);
                stackFrame.presentationHint = sourcePath === undefined ? "subtle" : "normal";
                frames.push(stackFrame);
            }
            response.body = {stackFrames: frames, totalFrames: msg.frames.length};

        } else {
            response.body = {stackFrames: [], totalFrames: 0};
        }
        this.sendResponse(response);
    }

    protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
        this.showOutput(`scopesRequest`, OutputCategory.Request);

        const {threadId, frame} = parseFrameId(args.frameId);
        this.sendCommand(`thread ${threadId}`);
        await this.waitForMessage();

        this.sendCommand(`frame ${frame}`);
        await this.waitForMessage();

        const scopes: Scope[] = [
            new Scope("Locals", ScopeType.Local, false),
            new Scope("Upvalues", ScopeType.Upvalue, false),
            new Scope("Globals", ScopeType.Global, false)
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
            this.showOutput(`variablesRequest locals`, OutputCategory.Request);
            break;

        case ScopeType.Upvalue:
            cmd = "ups";
            this.showOutput(`variablesRequest ups`, OutputCategory.Request);
            break;

        case ScopeType.Global:
            cmd = "globals";
            this.showOutput(`variablesRequest globals`, OutputCategory.Request);
            break;

        default:
            baseName = this.assert(this.variableHandles.get(args.variablesReference));
            cmd = `props ${baseName}`;
            if (args.filter !== undefined) {
                cmd += ` ${args.filter}`;
                if (args.start !== undefined) {
                    const start = Math.max(args.start, 1);
                    cmd += ` ${start}`;
                    if (args.count !== undefined) {
                        const count = args.start + args.count - start;
                        cmd += ` ${count}`;
                    }
                }
            } else {
                cmd += " all";
            }
            this.showOutput(
                `variablesRequest ${baseName} ${args.filter} ${args.start}/${args.count}`,
                OutputCategory.Request
            );
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

            if (vars.metatable !== undefined && baseName !== undefined) {
                variables.push(this.buildVariable(vars.metatable, `getmetatable(${baseName})`, metatableDisplayName));
            }

            if (vars.length !== undefined) {
                const value: LuaDebug.Value = {type: "number", value: vars.length.toString()};
                variables.push(this.buildVariable(value, `#${baseName}`, tableLengthDisplayName));
            }
        }
        variables.sort(sortVariables);

        response.body = {variables};
        this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.showOutput(`continueRequest`, OutputCategory.Request);
        this.variableHandles.reset();
        this.sendCommand("cont");
        this.isRunning = true;
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.showOutput(`nextRequest`, OutputCategory.Request);
        this.variableHandles.reset();
        this.sendCommand("step");
        this.isRunning = true;
        this.sendResponse(response);
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this.showOutput(`stepInRequest`, OutputCategory.Request);
        this.variableHandles.reset();
        this.sendCommand("stepin");
        this.isRunning = true;
        this.sendResponse(response);
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        this.showOutput(`stepOutRequest`, OutputCategory.Request);
        this.variableHandles.reset();
        this.sendCommand("stepout");
        this.isRunning = true;
        this.sendResponse(response);
    }

    protected async setVariableRequest(
        response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments
    ) {
        if (args.variablesReference === ScopeType.Global
            || args.variablesReference === ScopeType.Local
            || args.variablesReference === ScopeType.Upvalue
        ) {
            this.showOutput(`setVariableRequest ${args.name} = ${args.value}`, OutputCategory.Request);
            this.sendCommand(`exec ${args.name} = ${args.value}; return ${args.name}`);

        } else if (args.name === metatableDisplayName) {
            const name = this.variableHandles.get(args.variablesReference);
            this.showOutput(`setVariableRequest ${name}[[metatable]] = ${args.value}`, OutputCategory.Request);
            this.sendCommand(`eval setmetatable(${name}, ${args.value})`);

        } else if (args.name === tableLengthDisplayName) {
            const name = this.variableHandles.get(args.variablesReference);
            this.showOutput(`setVariableRequest ${name}[[length]] = ${args.value}`, OutputCategory.Request);
            this.sendCommand(`eval #${name}`);

        } else {
            const name = `${this.variableHandles.get(args.variablesReference)}[${args.name}]`;
            this.showOutput(`setVariableRequest ${name} = ${args.value}`, OutputCategory.Request);
            this.sendCommand(`exec ${name} = ${args.value}; return ${name}`);
        }

        const result = await this.getEvaluateResult(args.value);
        if (!result.success) {
            if (result.error !== undefined) {
                this.showOutput(result.error, OutputCategory.Error);
            }

        } else {
            response.body = result;
        }

        this.sendResponse(response);
    }

    protected async evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ) {
        const expression = args.expression;
        this.showOutput(`evaluateRequest ${expression}`, OutputCategory.Request);

        if (args.frameId !== undefined) {
            const {threadId, frame} = parseFrameId(args.frameId);

            this.sendCommand(`thread ${threadId}`);
            await this.waitForMessage();

            this.sendCommand(`frame ${frame}`);
            await this.waitForMessage();
        }

        this.sendCommand(`eval ${expression}`);

        const result = await this.getEvaluateResult(expression);
        if (!result.success) {
            if (result.error !== undefined && args.context !== "hover") {
                if (args.context !== "watch") {
                    this.showOutput(result.error, OutputCategory.Error);
                }
                response.body = {result: result.error, variablesReference: 0};
            }

        } else {
            response.body = {result: result.value, variablesReference: result.variablesReference};
        }

        this.sendResponse(response);
    }

    protected terminateRequest(
        response: DebugProtocol.TerminateResponse,
        args: DebugProtocol.TerminateArguments
    ): void {
        this.showOutput(`terminateRequest`, OutputCategory.Request);

        if (this.process !== undefined) {
            if (process.platform === "win32") {
                child_process.spawn("taskkill", ["/pid", this.process.pid.toString(), "/f", "/t"]);
            } else {
                this.process.kill();
            }
        }

        this.isRunning = false;

        this.sendResponse(response);
    }

    private async getEvaluateResult(
        expression: string
    ) : Promise<{success: true; value: string; variablesReference: number} | {success: false; error?: string}> {
        const msg = await this.waitForMessage();
        if (msg.type === "result") {
            const variablesReference = msg.result.type === "table" ? this.variableHandles.create(expression) : 0;
            const value = `${msg.result.value !== undefined ? msg.result.value : `[${msg.result.type}]`}`;
            return {success: true, value, variablesReference};

        } else if (msg.type === "error") {
            return {success: false, error: msg.error};

        } else {
            return {success: false};
        }
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
            ref,
            variable.length !== undefined && variable.length > 0 ? variable.length + 1 : variable.length,
            variable.type === "table" ? 1 : undefined
        );
    }

    private assert<T>(value: T | null | undefined, message = "assertion failed"): T {
        if (value === null || value === undefined) {
            this.sendEvent(new OutputEvent(message));
            throw new Error(message);
        }
        return value;
    }

    private resolvePath(filePath: string) {
        if (path.isAbsolute(filePath)) {
            return fs.existsSync(filePath) ? filePath : undefined;
        }
        const fullPath = path.resolve(this.assert(this.config).launch.cwd, filePath);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
        return undefined;
    }

    private setBreakpoint(filePath: string, breakpoint: DebugProtocol.SourceBreakpoint) {
        const cmd = breakpoint.condition !== undefined
            ? `break set ${filePath}:${breakpoint.line} ${breakpoint.condition}`
            : `break set ${filePath}:${breakpoint.line}`;
        this.sendCommand(cmd);
        return this.waitForMessage();
    }

    private deleteBreakpoint(filePath: string, breakpoint: DebugProtocol.SourceBreakpoint) {
        this.sendCommand(`break delete ${filePath}:${breakpoint.line}`);
        return this.waitForMessage();
    }

    private async onDebuggerStop(msg: LuaDebug.DebugBreak) {
        this.isRunning = false;

        if (this.breakpointsPending) {
            this.breakpointsPending = false;

            this.sendCommand("break clear");
            await this.waitForMessage();

            for (const filePath in this.fileBreakpoints) {
                const breakpoints = this.fileBreakpoints[filePath] as DebugProtocol.SourceBreakpoint[];
                for (const breakpoint of breakpoints) {
                    await this.setBreakpoint(filePath, breakpoint);
                }
            }
        }

        if (msg.breakType === "error") {
            this.showOutput(msg.message, OutputCategory.Error);

            const evt: DebugProtocol.StoppedEvent = new StoppedEvent("exception", msg.threadId, msg.message);
            evt.body.allThreadsStopped = true;
            this.sendEvent(evt);
            return;
        }

        if (this.autoContinueNext) {
            this.autoContinueNext = false;
            this.sendCommand("cont");

        } else {
            const evt: DebugProtocol.StoppedEvent = new StoppedEvent("breakpoint", msg.threadId);
            evt.body.allThreadsStopped = true;
            this.sendEvent(evt);
        }
    }

    private handleMessage(msg: LuaDebug.Message) {
        const handler = this.messageHandlerQueue.shift();
        if (handler !== undefined) {
            handler(msg);
        }
    }

    private async onDebuggerOutput(data: unknown, isError: boolean) {
        const dataStr = `${data}`;
        if (isError) {
            this.showOutput(dataStr, OutputCategory.StdErr);
            return;
        }

        this.outputText += dataStr;

        const [messages, processed, unprocessed] = Message.parse(this.outputText);
        let debugBreak: LuaDebug.DebugBreak | undefined;
        for (const msg of messages) {
            this.showOutput(JSON.stringify(msg), OutputCategory.Message);
            if (msg.type === "debugBreak") {
                debugBreak = msg;
            } else {
                this.handleMessage(msg);
            }
        }

        this.showOutput(processed, OutputCategory.StdOut);

        this.outputText = unprocessed;

        if (debugBreak !== undefined) {
            await this.onDebuggerStop(debugBreak);
        }
    }

    private onDebuggerTerminated(result: string, category = OutputCategory.Info) {
        if (this.process === undefined) {
            return;
        }

        this.process = undefined;
        this.isRunning = false;

        this.showOutput(`debugging ended: ${result}`, category);
        this.sendEvent(new TerminatedEvent());
    }

    private sendCommand(cmd: string) {
        if (this.process === undefined) {
            return;
        }
        if (!this.isRunning) {
            this.showOutput(cmd, OutputCategory.Command);
            this.assert(this.process.stdin).write(`${cmd}\n`);
        } else {
            this.showOutput(`skipping command: ${cmd}`, OutputCategory.Error);
            this.handleMessage({tag: "$luaDebug", type: "error", error: "debugger is running"});
        }
    }

    private waitForMessage(): Promise<LuaDebug.Message> {
        return new Promise(
            resolve => {
                this.messageHandlerQueue.push(resolve);
            }
        );
    }

    private showOutput(msg: string, category: OutputCategory) {
        if (category === OutputCategory.StdOut || category === OutputCategory.StdErr) {
            msg = msg.trim();
            if (msg.length > 0) {
                this.sendEvent(new OutputEvent(`${msg}\n`, category));
            }

        } else if (category === OutputCategory.Error) {
            this.sendEvent(new OutputEvent(`[${category}] ${msg}\n`, "stderr"));

        } else if (this.config !== undefined && this.config.verbose === true) {
            this.sendEvent(new OutputEvent(`[${category}] ${msg}\n`));
        }
    }

    private waitForConfiguration() {
        return new Promise(resolve => this.onConfigurationDone = resolve);
    }
}
