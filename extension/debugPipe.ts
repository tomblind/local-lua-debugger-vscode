import * as crypto from "crypto";
import * as net from "net";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface DebugPipe {
    open: (onData: (data: unknown) => void, onError: (err: unknown) => void) => void;
    close: () => void;
    write: (data: string) => void;
    openPull: (onError: (err: unknown) => void) => void;
    requestPull: () => void;
    getOutputPipePath: () => string;
    getInputPipePath: () => string;
    getPullPipePath: () => string;
}

export function createNamedPipe(): DebugPipe {
    const pipeId = crypto.randomBytes(16).toString("hex");
    const outputPipePath = `\\\\.\\pipe\\lldbg_out_${pipeId}`;
    const inputPipePath = `\\\\.\\pipe\\lldbg_in_${pipeId}`;
    const pullPipePath = `\\\\.\\pipe\\lldbg_pull_${pipeId}`;
    let outputPipe: net.Server | null = null;
    let inputPipe: net.Server | null = null;
    let pullPipe: net.Server | null = null;
    let inputStream: net.Socket | null;
    let pullStream: net.Socket | null;
    let onErrorCallback: ((err: unknown) => void) | null = null;
    return {
        open: (onData, onError) => {
            onErrorCallback = onError;
            outputPipe = net.createServer(
                stream => {
                    stream.on("data", onData);
                    stream.on("error", err => onError(`error on output pipe: ${err}`));
                }
            );
            outputPipe.listen(outputPipePath);
            inputPipe = net.createServer(
                stream => {
                    stream.on("error", err => onError(`error on input pipe: ${err}`));
                    inputStream = stream;
                }
            );
            inputPipe.listen(inputPipePath);
        },
        openPull: (onError: (err: unknown) => void) => {
            if (!onErrorCallback) {
                onErrorCallback = onError;
            }

            pullPipe = net.createServer(
                stream => {
                    stream.on("error", err => {
                        onError(`error on pull pipe: ${err}`);
                    });
                    pullStream = stream;
                }
            );
            pullPipe.listen(pullPipePath);
        },

        close: () => {
            outputPipe?.close();
            outputPipe = null;
            inputPipe?.close();
            inputPipe = null;
            inputStream = null;
            pullPipe = null;
            pullStream = null;
        },

        write: data => {
            inputStream?.write(data);
        },
        requestPull: () => {
            pullStream?.write("pull|\n");
        },

        getOutputPipePath: () => outputPipePath,
        getInputPipePath: () => inputPipePath,
        getPullPipePath: () => pullPipePath,
    };
}

export function createFifoPipe(): DebugPipe {
    const pipeId = crypto.randomBytes(16).toString("hex");
    const outputPipePath = `/tmp/lldbg_out_${pipeId}`;
    const inputPipePath = `/tmp/lldbg_in_${pipeId}`;
    let pullPipePath = "";
    let debuggerTmpDir = "";
    let outputFd: number | null = null;
    let inputFd: number | null = null;
    let pullFd: number | null = null;
    let inputStream: fs.WriteStream | null = null;
    let pullStream: fs.WriteStream | null = null;
    let onErrorCallback: ((err: unknown) => void) | null = null;
    return {
        open: (onData, onError) => {
            onErrorCallback = onError;

            childProcess.exec(
                `mkfifo ${outputPipePath}`,
                fifoErr => {
                    if (fifoErr) {
                        onError(`error executing mkfifo for output pipe: ${fifoErr}`);
                        return;
                    }

                    fs.open(
                        outputPipePath,
                        fs.constants.O_RDWR,
                        (fdErr, fd) => {
                            if (fdErr) {
                                onError(`error opening fifo for output pipe: ${fdErr}`);
                                return;
                            }

                            outputFd = fd;
                            const outputStream = fs.createReadStream(null as unknown as fs.PathLike, {fd});
                            outputStream.on("data", onData);
                        }
                    );
                }
            );

            childProcess.exec(
                `mkfifo ${inputPipePath}`,
                fifoErr => {
                    if (fifoErr) {
                        onError(`error executing mkfifo for input pipe: ${fifoErr}`);
                        return;
                    }

                    fs.open(
                        inputPipePath,
                        fs.constants.O_RDWR,
                        (fdErr, fd) => {
                            if (fdErr) {
                                onError(`error opening fifo for input pipe: ${fdErr}`);
                                return;
                            }

                            inputFd = fd;
                            inputStream = fs.createWriteStream(null as unknown as fs.PathLike, {fd});
                        }
                    );
                }
            );
        },

        openPull: (onError: (err: unknown) => void) => {
            if (!onErrorCallback) {
                onErrorCallback = onError;
            }

            const appPrefix = "lldebugger";
            try {
                debuggerTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
                pullPipePath = path.join(debuggerTmpDir, "pull.txt");

                const fd = fs.openSync(
                    pullPipePath,
                    fs.constants.O_WRONLY | fs.constants.O_CREAT
                );
                pullFd = fd;
                pullStream = fs.createWriteStream(null as unknown as fs.PathLike, {fd});
            } catch (e: unknown) {
                onErrorCallback(e);
            }
        },

        close: () => {
            if (outputFd !== null) {
                fs.close(outputFd);
                outputFd = null;
                fs.rm(
                    outputPipePath,
                    err => {
                        if (err) {
                            onErrorCallback?.(`error removing fifo for output pipe: ${err}`);
                        }
                    }
                );
            }
            if (inputFd !== null) {
                fs.close(inputFd);
                inputFd = null;
                fs.rm(
                    inputPipePath,
                    err => {
                        if (err) {
                            onErrorCallback?.(`error removing fifo for input pipe: ${err}`);
                        }
                    }
                );
            }
            inputStream = null;
            try {
                if (pullFd !== null) {
                    fs.close(pullFd);
                    fs.rmSync(pullPipePath);
                    pullFd = null;
                }
                pullStream = null;
                if (debuggerTmpDir.length > 0) {
                    fs.rmdirSync(debuggerTmpDir);
                }
            } catch (e: unknown) {
                onErrorCallback?.(e);
            }
        },

        write: data => {
            inputStream?.write(data);
        },
        requestPull: () => {
            pullStream?.write("pull|\n");
        },

        getOutputPipePath: () => outputPipePath,
        getInputPipePath: () => inputPipePath,
        getPullPipePath: () => pullPipePath,
    };
}
