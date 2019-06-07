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
