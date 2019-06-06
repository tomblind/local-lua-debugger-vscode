import * as vscode from "vscode";
import * as Net from "net";
import {LuaDebugSession} from "./luaDebugSession";
import {LaunchConfig, isLuaProgramConfig} from "./launchConfig";

const enableServer = true;

function abortLaunch(message: string) {
    vscode.window.showErrorMessage(message);
    // tslint:disable-next-line:no-null-keyword
    return null;
}

const configurationProvider: vscode.DebugConfigurationProvider = {
    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration & Partial<LaunchConfig>,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // Validate config
        if (config.launch === undefined) {
            return abortLaunch("No launch parameters set.");

        } else if (isLuaProgramConfig(config.launch)) {
            if (config.launch.file === undefined) {
                return abortLaunch("No lua file specified.");
            }

        } else if (config.launch.executable === undefined) {
            return abortLaunch("No launch parameters set.");
        }

        // Set required defaults
        if (config.launch.cwd === undefined) {
            config.cwd = folder !== undefined ? folder.uri : ".";
        }

        // Pass extension path to debugger
        const extension = vscode.extensions.getExtension("tomblind.local-lua-debugger-vscode");
        config.extensionPath = extension !== undefined ? extension.extensionPath : ".";

        return config;
    }
};

let debugAdapaterDescriptorFactory: (vscode.DebugAdapterDescriptorFactory & { dispose(): void }) | undefined;
if (enableServer) {
    let server: Net.Server | undefined;

    debugAdapaterDescriptorFactory = {
        createDebugAdapterDescriptor(
            session: vscode.DebugSession,
            executable: vscode.DebugAdapterExecutable | undefined
        ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
            if (server === undefined) {
                server = Net.createServer(socket => {
                    const debugSession = new LuaDebugSession();
                    debugSession.setRunAsServer(true);
                    debugSession.start(socket as NodeJS.ReadableStream, socket);
                }).listen(0);
            }
            return new vscode.DebugAdapterServer((server.address() as Net.AddressInfo).port);
        },

        dispose() {
            if (server !== undefined) {
                server.close();
                server = undefined;
            }
        }
    };
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider("lua-local", configurationProvider)
    );

    if (debugAdapaterDescriptorFactory !== undefined) {
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterDescriptorFactory("lua-local", debugAdapaterDescriptorFactory)
        );
        context.subscriptions.push(debugAdapaterDescriptorFactory);
    }
}

export function deactivate() {
}
