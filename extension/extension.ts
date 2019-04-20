import * as vscode from "vscode";
import * as Net from "net";
import {LuaDebugSession} from "./luaDebugSession";

const enableServer = true;

const configurationProvider: vscode.DebugConfigurationProvider = {
    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        const extension = vscode.extensions.getExtension("tom-blind.local-lua-debugger-vscode");
        config.extensionPath = extension !== undefined ? `${extension.extensionPath}/out` : ".";
        if (config.cwd === undefined) {
            config.cwd = folder !== undefined ? folder.uri : ".";
        }
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
        vscode.debug.registerDebugConfigurationProvider("local-lua-debugger", configurationProvider)
    );

    if (debugAdapaterDescriptorFactory !== undefined) {
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterDescriptorFactory("local-lua-debugger", debugAdapaterDescriptorFactory)
        );
        context.subscriptions.push(debugAdapaterDescriptorFactory);
    }
}

export function deactivate() {
}
