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

/// <reference path = "../debugger/protocol.d.ts" />

export namespace Message {
    function isMessage(obj: Exclude<unknown, null | undefined>): obj is LuaDebug.Message {
        return obj !== null && obj !== undefined && (obj as LuaDebug.Message).tag === "$luaDebug";
    }

    export function parse(text: string): [LuaDebug.Message[], string, string] {
        const messages: LuaDebug.Message[] = [];
        const strs: string[] = [];
        let strStartIndex = 0;
        let firstOpenBrace = text.length;
        for (let openBraceIndex = 0; openBraceIndex < text.length; ++openBraceIndex) {
            const openBrace = text[openBraceIndex];
            if (openBrace === "{") {
                if (firstOpenBrace === text.length) {
                    firstOpenBrace = openBraceIndex;
                }
                let braceDepth = 0;
                let inQuote = false;
                for (let closeBraceIndex = openBraceIndex + 1; closeBraceIndex < text.length; ++closeBraceIndex) {
                    const nextChar = text[closeBraceIndex];
                    if (inQuote) {
                        if (nextChar === "\\") {
                            ++closeBraceIndex; //Skip escaped character
                        } else if (nextChar === "\"") {
                            inQuote = false;
                        }
                    } else {
                        if (nextChar === "\"") {
                            inQuote = true;
                        } else if (nextChar === "{") {
                            ++braceDepth;
                        } else if (nextChar === "}") {
                            --braceDepth;
                            if (braceDepth < 0) {
                                const possibleMessage = text.substring(openBraceIndex, closeBraceIndex + 1);
                                let message: unknown;
                                try {
                                    message = JSON.parse(possibleMessage);
                                } catch {}
                                if (isMessage(message)) {
                                    messages.push(message);
                                    strs.push(text.substring(strStartIndex, openBraceIndex));
                                    strStartIndex = closeBraceIndex + 1;
                                    openBraceIndex = closeBraceIndex;
                                    firstOpenBrace = text.length;
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }

        //Push out anything before first brace
        if (firstOpenBrace > strStartIndex) {
            strs.push(text.substring(strStartIndex, firstOpenBrace));
            strStartIndex = firstOpenBrace;
        }

        return [messages, strs.join(""), text.substr(strStartIndex)];
    }
}
