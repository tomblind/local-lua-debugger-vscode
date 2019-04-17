import * as vscode from "vscode";

interface Config extends vscode.DebugConfiguration {
    program: LuaProgramConfig | CustomProgramConfig;
}

const configTypeName = "lualdbg";

const configurationProvider: vscode.DebugConfigurationProvider = {
    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: Config,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        if (config.type !== undefined && config.request !== undefined && config.name !== undefined) {
            const editor = vscode.window.activeTextEditor;
            if (editor !== undefined && editor.document.languageId === "lua") {
                config.type = configTypeName;
                config.name = "Launch";
                config.request = "launch";
                config.program = {lua: "lua", file: "${file}"};
                config.stopOnEntry = true;
            }
        }

        if (config.program !== undefined) {
            return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => undefined);
        }

        return config;
    }
};

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(configTypeName, configurationProvider));
}

export function deactivate() {
}
