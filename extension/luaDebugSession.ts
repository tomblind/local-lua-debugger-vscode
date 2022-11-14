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
import * as childProcess from "child_process";
import * as path from "path";
import * as fs from "fs";
import {Message} from "./message";
import {LaunchConfig, isCustomProgramConfig} from "./launchConfig";
import {createFifoPipe, createNamedPipe, DebugPipe} from "./debugPipe";

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
    // eslint-disable-next-line @typescript-eslint/no-shadow
    Message = "message",
    Info = "info",
    Error = "error"
}

// const mainThreadId = 1;
const maxStackCount = 100;
const metatableDisplayName = "[[metatable]]";
const tableLengthDisplayName = "[[length]]";
const metatableAccessor: LuaDebug.MetatableAccessor = "lldbg_getmetatable";
const envVariable = "LOCAL_LUA_DEBUGGER_VSCODE";
const filePathEnvVariable = "LOCAL_LUA_DEBUGGER_FILEPATH";
const scriptRootsEnvVariable: LuaDebug.ScriptRootsEnv = "LOCAL_LUA_DEBUGGER_SCRIPT_ROOTS";
const breakInCoroutinesEnv: LuaDebug.BreakInCoroutinesEnv = "LOCAL_LUA_DEBUGGER_BREAK_IN_COROUTINES";
const stepUnmappedLinesEnv: LuaDebug.StepUnmappedLinesEnv = "LOCAL_LUA_DEBUGGER_STEP_UNMAPPED_LINES";
const inputFileEnv: LuaDebug.InputFileEnv = "LOCAL_LUA_DEBUGGER_INPUT_FILE";
const outputFileEnv: LuaDebug.OutputFileEnv = "LOCAL_LUA_DEBUGGER_OUTPUT_FILE";
const pullFileEnv: LuaDebug.PullFileEnv = "LOCAL_LUA_DEBUGGER_PULL_FILE";

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

    const aAsNum = Number(a.name);
    const bAsNum = Number(b.name);
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
    private process: childProcess.ChildProcess | null = null;
    private debugPipe: DebugPipe | null = null;
    private outputText = "";
    private onConfigurationDone?: () => void;
    private readonly messageHandlerQueue: MessageHandler[] = [];
    private readonly variableHandles = new Handles<string>(ScopeType.Global + 1);
    private breakpointsPending = false;
    private pendingScripts: string[] | null = null;
    private pendingIgnorePatterns: string[] | null = null;
    private autoContinueNext = false;
    private readonly activeThreads = new Map<number, Thread>();
    private isRunning = false;
    private inDebuggerBreakpoint = false;
    private pullBreakpointsSupport = false;
    private usePipeCommutication = false;

    public constructor() {
        super("lldebugger-log.txt");
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        this.showOutput("initializeRequest", OutputCategory.Request);

        if (typeof response.body === "undefined") {
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

        if (typeof this.onConfigurationDone !== "undefined") {
            this.onConfigurationDone();
        }
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: DebugProtocol.LaunchRequestArguments & LaunchConfig
    ): Promise<void> {
        this.config = args;
        this.autoContinueNext = this.config.stopOnEntry !== true;

        this.showOutput("launchRequest", OutputCategory.Request);

        await this.waitForConfiguration();

        if (this.config.scriptFiles) {
            this.pendingScripts = this.config.scriptFiles;
        }

        if (this.config.ignorePatterns) {
            this.pendingIgnorePatterns = this.config.ignorePatterns;
        }

        //Setup process
        if (!path.isAbsolute(this.config.cwd)) {
            this.config.cwd = path.resolve(this.config.workspacePath, this.config.cwd);
        }
        const cwd = this.config.cwd;
        const processOptions/* : child_process.SpawnOptions */ = {
            env: Object.assign({}, process.env),
            cwd,
            shell: true,
            detached: process.platform !== "win32"
        };

        if (typeof this.config.env !== "undefined") {
            for (const key in this.config.env) {
                const envKey = getEnvKey(processOptions.env, key);
                processOptions.env[envKey] = this.config.env[key];
            }
        }

        if (typeof this.config.pullBreakpointsSupport !== "undefined") {
            this.pullBreakpointsSupport = this.config.pullBreakpointsSupport;
        }

        //Set an environment variable so the debugger can detect the attached extension
        processOptions.env[envVariable] = "1";
        processOptions.env[filePathEnvVariable]
            = `${this.config.extensionPath}${path.sep}debugger${path.sep}lldebugger.lua`;

        //Pass options via environment variables
        if (typeof this.config.scriptRoots !== "undefined") {
            processOptions.env[scriptRootsEnvVariable] = this.config.scriptRoots.join(";");
        }
        if (typeof this.config.breakInCoroutines !== "undefined") {
            processOptions.env[breakInCoroutinesEnv] = this.config.breakInCoroutines ? "1" : "0";
        }
        if (typeof this.config.stepUnmappedLines !== "undefined") {
            processOptions.env[stepUnmappedLinesEnv] = this.config.stepUnmappedLines ? "1" : "0";
        }

        this.usePipeCommutication = this.config.program.communication === "pipe";

        //Open pipes
        if (this.usePipeCommutication || this.pullBreakpointsSupport) {
            if (process.platform === "win32") {
                this.debugPipe = createNamedPipe();
            } else {
                this.debugPipe = createFifoPipe();
            }

            if (this.usePipeCommutication) {
                this.debugPipe.open(
                    data => { void this.onDebuggerOutput(data); },
                    err => { this.showOutput(`${err}`, OutputCategory.Error); }
                );

                processOptions.env[outputFileEnv] = this.debugPipe.getOutputPipePath();
                processOptions.env[inputFileEnv] = this.debugPipe.getInputPipePath();
            }
        }

        if (this.pullBreakpointsSupport) {
            this.debugPipe?.openPull(err => { this.showOutput(`${err}`, OutputCategory.Error); });
            processOptions.env[pullFileEnv] = this.debugPipe?.getPullPipePath();
        }

        //Append lua path so it can find debugger script
        this.updateLuaPath("LUA_PATH_5_2", processOptions.env, false);
        this.updateLuaPath("LUA_PATH_5_3", processOptions.env, false);
        this.updateLuaPath("LUA_PATH_5_4", processOptions.env, false);
        this.updateLuaPath("LUA_PATH", processOptions.env, true);

        //Launch process
        let processExecutable: string;
        let processArgs: string[];
        if (isCustomProgramConfig(this.config.program)) {
            processExecutable = `"${this.config.program.command}"`;
            processArgs = typeof this.config.args !== "undefined" ? this.config.args : [];

        } else {
            processExecutable = `"${this.config.program.lua}"`;
            const programArgs = (typeof this.config.args !== "undefined")
                ? `, ${this.config.args.map(a => `[[${a}]]`)}`
                : "";
            processArgs = [
                "-e",
                "\"require('lldebugger').runFile("
                + `[[${this.config.program.file}]],`
                + "true,"
                + `{[-1]=[[${this.config.program.lua}]],[0]=[[${this.config.program.file}]]${programArgs}}`
                + ")\""
            ];
        }
        this.process = childProcess.spawn(processExecutable, processArgs, processOptions);

        this.showOutput(
            `launching \`${processExecutable} ${processArgs.join(" ")}\` from "${cwd}"`,
            OutputCategory.Info
        );

        //Process callbacks
        if (this.usePipeCommutication) {
            this.assert(this.process.stdout).on("data", data => { this.showOutput(`${data}`, OutputCategory.StdOut); });
        } else {
            this.assert(this.process.stdout).on("data", data => { void this.onDebuggerOutput(data); });
        }
        this.assert(this.process.stderr).on("data", data => { this.showOutput(`${data}`, OutputCategory.StdErr); });
        this.process.on("close", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));
        this.process.on("disconnect", () => this.onDebuggerTerminated("disconnected"));
        this.process.on(
            "error",
            err => this.onDebuggerTerminated(
                `Failed to launch \`${processExecutable} ${processArgs.join(" ")}\` from "${cwd}": ${err}`,
                OutputCategory.Error
            )
        );
        this.process.on("exit", (code, signal) => this.onDebuggerTerminated(`${code !== null ? code : signal}`));

        this.isRunning = true;
        this.inDebuggerBreakpoint = false;

        this.showOutput("process launched", OutputCategory.Info);
        this.sendResponse(response);
    }

    protected async setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): Promise<void> {
        this.showOutput("setBreakPointsRequest", OutputCategory.Request);

        const filePath = args.source.path as string;

        if (this.process !== null && !this.isRunning) {
            if (!this.inDebuggerBreakpoint && this.pullBreakpointsSupport) {
                this.breakpointsPending = true;
                this.autoContinueNext = true;
                this.debugPipe?.requestPull();
            }

            const oldBreakpoints = this.fileBreakpoints[filePath];
            if (typeof oldBreakpoints !== "undefined") {
                for (const breakpoint of oldBreakpoints) {
                    await this.deleteBreakpoint(filePath, breakpoint);
                }
            }

            if (typeof args.breakpoints !== "undefined") {
                for (const breakpoint of args.breakpoints) {
                    await this.setBreakpoint(filePath, breakpoint);
                }
            }

        } else {
            if (this.pullBreakpointsSupport && this.process !== null) {
                this.breakpointsPending = true;
                this.autoContinueNext = true;
                this.debugPipe?.requestPull();
            } else {
                this.breakpointsPending = true;
            }
        }

        this.fileBreakpoints[filePath] = args.breakpoints;

        const breakpoints: Breakpoint[] = (typeof args.breakpoints !== "undefined")
            ? args.breakpoints.map(breakpoint => new Breakpoint(true, breakpoint.line))
            : [];
        response.body = {breakpoints};
        this.sendResponse(response);
    }

    protected async threadsRequest(response: DebugProtocol.ThreadsResponse): Promise<void> {
        this.showOutput("threadsRequest", OutputCategory.Request);

        const msg = await this.waitForCommandResponse("threads");

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
            response.success = false;
        }

        this.sendResponse(response);
    }

    protected async stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): Promise<void> {
        this.showOutput(
            `stackTraceRequest ${args.startFrame}/${args.levels} (thread ${args.threadId})`,
            OutputCategory.Request
        );

        const msg = await this.waitForCommandResponse(`thread ${args.threadId}`);

        const startFrame = typeof args.startFrame !== "undefined" ? args.startFrame : 0;
        const maxLevels = typeof args.levels !== "undefined" ? args.levels : maxStackCount;
        if (msg.type === "stack") {
            const frames: DebugProtocol.StackFrame[] = [];
            const endFrame = Math.min(startFrame + maxLevels, msg.frames.length);
            for (let i = startFrame; i < endFrame; ++i) {
                const frame = msg.frames[i];

                let source: Source | undefined;
                let line = frame.line;
                let column = 1; //Needed for exception display: https://github.com/microsoft/vscode/issues/46080

                //Mapped source
                if (typeof frame.mappedLocation !== "undefined") {
                    const mappedPath = this.resolvePath(frame.mappedLocation.source);
                    if (typeof mappedPath !== "undefined") {
                        source = new Source(path.basename(mappedPath), mappedPath);
                        line = frame.mappedLocation.line;
                        column = frame.mappedLocation.column;
                    }
                }

                //Un-mapped source
                const sourcePath = this.resolvePath(frame.source);
                if (typeof source === "undefined" && typeof sourcePath !== "undefined") {
                    source = new Source(path.basename(frame.source), sourcePath);
                }

                //Function name
                let frameFunc = typeof frame.func !== "undefined" ? frame.func : "???";
                if (typeof sourcePath === "undefined") {
                    frameFunc += ` ${frame.source}`;
                }

                const frameId = makeFrameId(args.threadId, i + 1);
                const stackFrame: DebugProtocol.StackFrame = new StackFrame(frameId, frameFunc, source, line, column);
                stackFrame.presentationHint = typeof sourcePath === "undefined" ? "subtle" : "normal";
                frames.push(stackFrame);
            }
            response.body = {stackFrames: frames, totalFrames: msg.frames.length};

        } else {
            response.success = false;
        }
        this.sendResponse(response);
    }

    protected async scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): Promise<void> {
        this.showOutput("scopesRequest", OutputCategory.Request);

        const {threadId, frame} = parseFrameId(args.frameId);
        await this.waitForCommandResponse(`thread ${threadId}`);

        await this.waitForCommandResponse(`frame ${frame}`);

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
    ): Promise<void> {
        let cmd: string | undefined;
        let baseName: string | undefined;
        let isMultiResult = false;

        switch (args.variablesReference) {
        case ScopeType.Local:
            cmd = "locals";
            this.showOutput("variablesRequest locals", OutputCategory.Request);
            break;

        case ScopeType.Upvalue:
            cmd = "ups";
            this.showOutput("variablesRequest ups", OutputCategory.Request);
            break;

        case ScopeType.Global:
            cmd = "globals";
            this.showOutput("variablesRequest globals", OutputCategory.Request);
            break;

        default:
            baseName = this.assert(this.variableHandles.get(args.variablesReference));
            if (baseName.startsWith("@")) {
                baseName = baseName.substr(1);
                isMultiResult = true;
            }
            cmd = `props ${baseName}`;
            if (typeof args.filter !== "undefined") {
                cmd += ` ${args.filter}`;
                if (typeof args.start !== "undefined") {
                    const start = Math.max(args.start, 1);
                    cmd += ` ${start}`;
                    if (typeof args.count !== "undefined") {
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

        const vars = await this.waitForCommandResponse(cmd);

        const variables: Variable[] = [];
        if (vars.type === "variables") {
            for (const variable of vars.variables) {
                variables.push(this.buildVariable(variable, variable.name));
            }

        } else if (vars.type === "properties") {
            for (const variable of vars.properties) {
                const refName = typeof baseName === "undefined" ? variable.name : `${baseName}[${variable.name}]`;
                variables.push(this.buildVariable(variable, refName));
            }

            if (typeof vars.metatable !== "undefined" && typeof baseName !== "undefined") {
                variables.push(
                    this.buildVariable(vars.metatable, `${metatableAccessor}(${baseName})`, metatableDisplayName)
                );
            }

            if (typeof vars.length !== "undefined" && !isMultiResult) {
                variables.push(this.buildVariable(vars.length, `#${baseName}`, tableLengthDisplayName));
            }

        } else if (vars.type === "error") {
            response.success = false;
            response.message = this.filterErrorMessage(vars.error);
            this.sendResponse(response);
            return;

        } else {
            response.success = false;
        }
        variables.sort(sortVariables);

        response.body = {variables};
        this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.showOutput("continueRequest", OutputCategory.Request);
        if (this.sendCommand("cont")) {
            this.variableHandles.reset();
            this.isRunning = true;
            this.inDebuggerBreakpoint = false;
        } else {
            response.success = false;
        }
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.showOutput("nextRequest", OutputCategory.Request);
        if (this.sendCommand("step")) {
            this.variableHandles.reset();
            this.isRunning = true;
            this.inDebuggerBreakpoint = false;
        } else {
            response.success = false;
        }
        this.sendResponse(response);
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this.showOutput("stepInRequest", OutputCategory.Request);
        if (this.sendCommand("stepin")) {
            this.variableHandles.reset();
            this.isRunning = true;
            this.inDebuggerBreakpoint = false;
        } else {
            response.success = false;
        }
        this.sendResponse(response);
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        this.showOutput("stepOutRequest", OutputCategory.Request);
        if (this.sendCommand("stepout")) {
            this.variableHandles.reset();
            this.isRunning = true;
            this.inDebuggerBreakpoint = false;
        } else {
            response.success = false;
        }
        this.sendResponse(response);
    }

    protected async setVariableRequest(
        response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments
    ): Promise<void> {
        let msg: LuaDebug.Message;
        if (args.variablesReference === ScopeType.Global
            || args.variablesReference === ScopeType.Local
            || args.variablesReference === ScopeType.Upvalue
        ) {
            this.showOutput(`setVariableRequest ${args.name} = ${args.value}`, OutputCategory.Request);
            msg = await this.waitForCommandResponse(`exec ${args.name} = ${args.value}; return ${args.name}`);

        } else if (args.name === metatableDisplayName) {
            const name = this.variableHandles.get(args.variablesReference);
            this.showOutput(`setVariableRequest ${name}[[metatable]] = ${args.value}`, OutputCategory.Request);
            msg = await this.waitForCommandResponse(`eval setmetatable(${name}, ${args.value})`);

        } else if (args.name === tableLengthDisplayName) {
            const name = this.variableHandles.get(args.variablesReference);
            this.showOutput(`setVariableRequest ${name}[[length]] = ${args.value}`, OutputCategory.Request);
            msg = await this.waitForCommandResponse(`eval #${name}`);

        } else {
            const name = `${this.variableHandles.get(args.variablesReference)}[${args.name}]`;
            this.showOutput(`setVariableRequest ${name} = ${args.value}`, OutputCategory.Request);
            msg = await this.waitForCommandResponse(`exec ${name} = ${args.value}; return ${name}`);
        }

        const result = this.handleEvaluationResult(args.value, msg);
        if (!result.success) {
            if (typeof result.error !== "undefined") {
                this.showOutput(result.error, OutputCategory.Error);
            }
            response.success = false;

        } else {
            response.body = result;
        }

        this.sendResponse(response);
    }

    protected async evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ): Promise<void> {
        const expression = args.expression;
        this.showOutput(`evaluateRequest ${expression}`, OutputCategory.Request);

        if (typeof args.frameId !== "undefined") {
            const {threadId, frame} = parseFrameId(args.frameId);
            await this.waitForCommandResponse(`thread ${threadId}`);
            await this.waitForCommandResponse(`frame ${frame}`);
        }

        const msg = await this.waitForCommandResponse(`eval ${expression}`);

        const result = this.handleEvaluationResult(expression, msg);
        if (!result.success) {
            if (typeof result.error !== "undefined" && args.context !== "hover") {
                if (args.context !== "watch") {
                    this.showOutput(result.error, OutputCategory.Error);
                }
                response.success = false;
                response.message = result.error;
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
        this.showOutput("terminateRequest", OutputCategory.Request);

        if (this.process !== null) {
            if (process.platform === "win32") {
                childProcess.spawn("taskkill", ["/pid", this.assert(this.process.pid).toString(), "/f", "/t"]);
            } else {
                process.kill(-this.assert(this.process.pid), "SIGKILL");
            }
        }

        this.isRunning = false;
        this.inDebuggerBreakpoint = false;

        this.sendResponse(response);
    }

    private handleEvaluationResult(
        expression: string,
        msg: LuaDebug.Message
    ): {success: true; value: string; variablesReference: number} | {success: false; error?: string} {
        if (msg.type === "result") {
            if (msg.results.length === 0) {
                return {success: true, value: "nil", variablesReference: 0};
            } else if (msg.results.length === 1) {
                const result = msg.results[0];
                const variablesReference = result.type === "table" ? this.variableHandles.create(expression) : 0;
                return {success: true, value: this.getValueString(result), variablesReference};
            } else {
                const variablesReference = this.variableHandles.create(`@({${expression}})`);
                const value = `(${msg.results.map(r => this.getValueString(r)).join(", ")})`;
                return {success: true, value, variablesReference};
            }

        } else if (msg.type === "error") {
            return {success: false, error: this.filterErrorMessage(msg.error)};

        } else {
            return {success: false};
        }
    }

    private buildVariable(variable: LuaDebug.Variable, refName: string): Variable;
    private buildVariable(value: LuaDebug.Value, refName: string, variableName: string): Variable;
    private buildVariable(variable: LuaDebug.Variable | LuaDebug.Value, refName: string, variableName?: string) {
        let valueStr: string;
        let ref: number | undefined;
        if (refName === "...") {
            valueStr = typeof variable.error !== "undefined"
                ? `[error: ${this.filterErrorMessage(variable.error)}]`
                : `(${variable.value ?? ""})`;
            ref = variable.type === "table" ? this.variableHandles.create("@({...})") : 0;
        } else if (variable.type === "table") {
            valueStr = this.getValueString(variable);
            ref = this.variableHandles.create(refName);
        } else {
            valueStr = this.getValueString(variable);
        }
        const name = typeof variableName !== "undefined" ? variableName : (variable as LuaDebug.Variable).name;
        const indexedVariables = typeof variable.length !== "undefined" && variable.length > 0
            ? variable.length + 1
            : variable.length;
        if (variable.type === "table") {
            return new Variable(name, valueStr, ref, indexedVariables, 1);
        } else {
            return new Variable(name, valueStr, ref, indexedVariables);
        }
    }

    private assert<T>(value: T | null | undefined, message = "assertion failed"): T {
        if (value === null || typeof value === "undefined") {
            this.sendEvent(new OutputEvent(message));
            throw new Error(message);
        }
        return value;
    }

    private filterErrorMessage(errorMsg: string) {
        const errorOnly = /^.+:\d+:\s*(.+)/.exec(errorMsg);
        return (errorOnly !== null && errorOnly.length > 1) ? errorOnly[1] : errorMsg;
    }

    private getValueString(value: LuaDebug.Value) {
        if (typeof value.error !== "undefined") {
            return `[error: ${this.filterErrorMessage(value.error)}]`;
        } else if (typeof value.value !== "undefined") {
            return value.value;
        } else {
            return `[${value.type}]`;
        }
    }

    private resolvePath(filePath: string) {
        if (filePath.length === 0) {
            return;
        }

        const config = this.assert(this.config);
        let fullPath = path.isAbsolute(filePath) ? filePath : path.join(config.cwd, filePath);

        if (fs.existsSync(fullPath)) {
            return fullPath;
        }

        if (typeof config.scriptRoots === "undefined") {
            return;
        }
        for (const rootPath of config.scriptRoots) {
            if (path.isAbsolute(rootPath)) {
                fullPath = path.join(rootPath, filePath);
            } else {
                fullPath = path.join(config.cwd, rootPath, filePath);
            }
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }

        return;
    }

    private updateLuaPath(pathKey: string, env: NodeJS.ProcessEnv, force: boolean) {
        const luaPathKey = getEnvKey(env, pathKey);
        let luaPath = env[luaPathKey];
        if (typeof luaPath === "undefined") {
            if (!force) {
                return;
            }
            luaPath = ";;"; //Retain defaults

        } else if (luaPath.length > 0 && !luaPath.endsWith(";")) {
            luaPath += ";";
        }

        env[luaPathKey] = `${luaPath}${this.assert(this.config).extensionPath}/debugger/?.lua`;
    }

    private setBreakpoint(filePath: string, breakpoint: DebugProtocol.SourceBreakpoint) {
        const cmd = typeof breakpoint.condition !== "undefined"
            ? `break set ${filePath}:${breakpoint.line} ${breakpoint.condition}`
            : `break set ${filePath}:${breakpoint.line}`;
        return this.waitForCommandResponse(cmd);
    }

    private deleteBreakpoint(filePath: string, breakpoint: DebugProtocol.SourceBreakpoint) {
        return this.waitForCommandResponse(`break delete ${filePath}:${breakpoint.line}`);
    }

    private async onDebuggerStop(msg: LuaDebug.DebugBreak) {
        this.isRunning = false;
        const prevInDebugger = this.inDebuggerBreakpoint;
        this.inDebuggerBreakpoint = true;

        if (this.pendingScripts) {
            for (const scriptFile of this.pendingScripts) {
                const resultMsg = await this.waitForCommandResponse(`script ${scriptFile}`);
                if (resultMsg.type === "result") {
                    for (const result of resultMsg.results) {
                        if (typeof result.value !== "undefined") {
                            this.showOutput(this.getValueString(result), OutputCategory.Info);
                        }
                    }
                } else if (resultMsg.type === "error") {
                    this.showOutput(resultMsg.error, OutputCategory.Error);
                }
            }
            this.pendingScripts = null;
        }

        if (this.pendingIgnorePatterns) {
            for (const ignorePattern of this.pendingIgnorePatterns) {
                const resultMsg = await this.waitForCommandResponse(`ignore ${ignorePattern}`);
                if (resultMsg.type === "result") {
                    for (const result of resultMsg.results) {
                        if (typeof result.value !== "undefined") {
                            this.showOutput(this.getValueString(result), OutputCategory.Info);
                        }
                    }
                } else if (resultMsg.type === "error") {
                    this.showOutput(resultMsg.error, OutputCategory.Error);
                }
            }
            this.pendingIgnorePatterns = null;
        }

        if (this.breakpointsPending) {
            this.breakpointsPending = false;

            await this.waitForCommandResponse("break clear");

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
            this.inDebuggerBreakpoint = prevInDebugger;
            this.assert(this.sendCommand("autocont"));

        } else {
            const evt: DebugProtocol.StoppedEvent = new StoppedEvent("breakpoint", msg.threadId);
            evt.body.allThreadsStopped = true;
            this.sendEvent(evt);
        }
    }

    private handleDebugMessage(msg: LuaDebug.Message) {
        const handler = this.messageHandlerQueue.shift();
        if (typeof handler !== "undefined") {
            handler(msg);
        }
    }

    private async onDebuggerOutput(data: unknown) {
        this.outputText += `${data}`;

        const [messages, processed, unprocessed] = Message.parse(this.outputText);
        let debugBreak: LuaDebug.DebugBreak | undefined;
        for (const msg of messages) {
            this.showOutput(JSON.stringify(msg), OutputCategory.Message);
            if (msg.type === "debugBreak") {
                debugBreak = msg;
            } else {
                this.handleDebugMessage(msg);
            }
        }

        this.showOutput(processed, OutputCategory.StdOut);

        this.outputText = unprocessed;

        if (typeof debugBreak !== "undefined") {
            await this.onDebuggerStop(debugBreak);
        }
    }

    private onDebuggerTerminated(result: string, category = OutputCategory.Info) {
        if (this.process === null) {
            return;
        }

        if (this.debugPipe) {
            this.debugPipe.close();
            this.debugPipe = null;
        }

        this.process = null;
        this.isRunning = false;
        this.inDebuggerBreakpoint = false;

        if (this.outputText.length > 0) {
            this.showOutput(this.outputText, OutputCategory.StdOut);
            this.outputText = "";
        }

        this.showOutput(`debugging ended: ${result}`, category);
        this.sendEvent(new TerminatedEvent());
    }

    private sendCommand(cmd: string) {
        if (this.process === null || this.isRunning) {
            return false;
        }

        this.showOutput(cmd, OutputCategory.Command);
        if (this.usePipeCommutication) {
            this.debugPipe?.write(`${cmd}\n`);
        } else {
            this.assert(this.process.stdin).write(`${cmd}\n`);
        }
        return true;
    }

    private waitForCommandResponse(cmd: string): Promise<LuaDebug.Message> {
        if (this.sendCommand(cmd)) {
            return new Promise(
                resolve => {
                    this.messageHandlerQueue.push(resolve);
                }
            );
        } else {
            return Promise.resolve({tag: "$luaDebug", type: "error", error: "Failed to send command"});
        }
    }

    private showOutput(msg: string, category: OutputCategory) {
        if (msg.length === 0) {
            return;

        } else if (category === OutputCategory.StdOut || category === OutputCategory.StdErr) {
            this.sendEvent(new OutputEvent(msg, category));

        } else if (category === OutputCategory.Error) {
            this.sendEvent(new OutputEvent(`\n[${category}] ${msg}\n`, "stderr"));

        } else if (typeof this.config !== "undefined" && this.config.verbose === true) {
            this.sendEvent(new OutputEvent(`\n[${category}] ${msg}\n`));
        }
    }

    private waitForConfiguration() {
        return new Promise<void>(resolve => { this.onConfigurationDone = resolve; });
    }
}
