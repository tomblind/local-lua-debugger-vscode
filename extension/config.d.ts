interface LuaProgramConfig {
    lua: string;
    file: string;
}

interface CustomProgramConfig {
    executable: string;
    args?: string[];
}
