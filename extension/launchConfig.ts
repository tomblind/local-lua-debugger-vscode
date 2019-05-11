export interface ProgramConfig {
    cwd: string;
    env?: { [name: string]: string };
}

export interface LuaProgramConfig extends ProgramConfig {
    lua: string;
    file: string;
}

export interface CustomProgramConfig extends ProgramConfig {
    executable: string;
    args?: string[];
}

export interface LaunchConfig {
    extensionPath: string;
    launch: LuaProgramConfig | CustomProgramConfig;
    sourceRoot?: string;
    verbose?: boolean;
    breakOnAttach?: boolean;
}

export function isLuaProgramConfig(config: LuaProgramConfig | CustomProgramConfig): config is LuaProgramConfig {
    return (config as LuaProgramConfig).lua !== undefined;
}
