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

import * as vscode from "vscode";
import * as Net from "net";
import * as path from "path";
import {LuaDebugSession} from "./luaDebugSession";
import {LaunchConfig, isCustomProgramConfig, LuaProgramConfig} from "./launchConfig";

const enableServer = true;
const debuggerType = "lua-local";
const interpreterSetting = `${debuggerType}.interpreter`;

function abortLaunch(message: string) {
    void vscode.window.showErrorMessage(message);
    // tslint:disable-next-line:no-null-keyword
    return null;
}

const configurationProvider: vscode.DebugConfigurationProvider = {
    async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration & Partial<LaunchConfig>,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        //Validate config
        const editor = vscode.window.activeTextEditor;
        if (typeof config.request === "undefined" || typeof config.type === "undefined") {
            if (typeof editor === "undefined" || editor.document.languageId !== "lua" || editor.document.isUntitled) {
                return abortLaunch("Nothing to debug");
            }
            config.request = "launch";
            config.type = debuggerType;
        }

        if (typeof config.program === "undefined" || !isCustomProgramConfig(config.program)) {
            const luaConfig: Partial<LuaProgramConfig> = config.program ?? {};
            if (typeof luaConfig.lua === "undefined") {
                const luaBin: string | undefined = vscode.workspace.getConfiguration().get(interpreterSetting);
                if (typeof luaBin === "undefined" || luaBin.length === 0) {
                    return abortLaunch(
                        `You must set "${interpreterSetting}" in your settings, or "program.lua" `
                        + "in your launch.json, to debug with a lua interpreter."
                    );
                }
                luaConfig.lua = luaBin;
            }
            if (typeof luaConfig.file === "undefined") {
                if (typeof editor === "undefined"
                    || editor.document.languageId !== "lua"
                    || editor.document.isUntitled
                ) {
                    return abortLaunch("'program.file' not set in launch.json");
                }
                luaConfig.file = editor.document.uri.fsPath;
            }
            config.program = luaConfig as LuaProgramConfig;
        }

        if (Array.isArray(config.scriptFiles)) {
            const nonString = config.scriptFiles.find(p => typeof p !== "string");
            if (typeof nonString !== "undefined") {
                return abortLaunch(`invalid value in scriptFiles: "${nonString}"`);
            } else {
                const uris = await Promise.all(
                    config.scriptFiles.map(p => vscode.workspace.findFiles(path.normalize(p)))
                );
                config.scriptFiles = uris.flatMap(u => u.map(uri => uri.fsPath));
            }
        }

        //Pass paths to debugger
        if (typeof folder !== "undefined") {
            config.workspacePath = folder.uri.fsPath;
        } else if (typeof vscode.window.activeTextEditor !== "undefined") {
            config.workspacePath = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
        } else {
            return abortLaunch("No path for debugger");
        }

        const extension = vscode.extensions.getExtension("tomblind.local-lua-debugger-vscode");
        if (typeof extension === "undefined") {
            return abortLaunch("Failed to find extension path");
        }
        config.extensionPath = extension.extensionPath;

        if (typeof config.cwd === "undefined") {
            config.cwd = config.workspacePath;
        }

        return config;
    }
};

let debugAdapaterDescriptorFactory: (vscode.DebugAdapterDescriptorFactory & { dispose: () => void }) | undefined;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (enableServer) {
    let server: Net.Server | null = null;

    debugAdapaterDescriptorFactory = {
        createDebugAdapterDescriptor(
            session: vscode.DebugSession,
            executable: vscode.DebugAdapterExecutable | undefined
        ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
            if (server === null) {
                server = Net.createServer(socket => {
                    const debugSession = new LuaDebugSession();
                    debugSession.setRunAsServer(true);
                    debugSession.start(socket as NodeJS.ReadableStream, socket);
                }).listen(0);
            }
            return new vscode.DebugAdapterServer((server.address() as Net.AddressInfo).port);
        },

        dispose() {
            if (server !== null) {
                server.close();
                server = null;
            }
        }
    };
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(debuggerType, configurationProvider)
    );

    if (typeof debugAdapaterDescriptorFactory !== "undefined") {
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterDescriptorFactory(debuggerType, debugAdapaterDescriptorFactory)
        );
        context.subscriptions.push(debugAdapaterDescriptorFactory);
    }
}

export function deactivate(): void {
}
