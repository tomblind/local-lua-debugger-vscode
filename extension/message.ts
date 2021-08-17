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

export namespace Message {
    function isMessage(obj: Exclude<unknown, null | undefined>): obj is LuaDebug.Message {
        return obj !== null && typeof obj !== "undefined" && (obj as Partial<LuaDebug.Message>).tag === "$luaDebug";
    }

    const startToken: LuaDebug.StartToken = "@lldbg|";
    const endToken: LuaDebug.EndToken = "|lldbg@";

    interface ParsedInfo {
        leadingText: string;
        newPosition: number;
        message?: LuaDebug.Message;
    }

    function parseMessage(text: string, position: number): ParsedInfo {
        const firstStart = text.indexOf(startToken, position);
        if (firstStart === -1) {
            return {leadingText: text.substring(position), newPosition: text.length};
        }
        let start = firstStart;
        while (true) {
            const messageStart = start + (startToken as string).length;
            let messageEnd = text.indexOf(endToken, messageStart);
            while (messageEnd >= 0) {
                const possibleMessage = text.substring(messageStart, messageEnd);
                let message: unknown;
                try {
                    message = JSON.parse(possibleMessage);
                } catch {
                }
                const end = messageEnd + (endToken as string).length;
                if (isMessage(message)) {
                    return {leadingText: text.substring(position, start), newPosition: end, message};
                }
                messageEnd = text.indexOf(endToken, end);
            }
            start = text.indexOf(startToken, messageStart);
            if (start < 0) {
                break;
            }
        }
        return {leadingText: text.substring(position, firstStart), newPosition: firstStart};
    }

    export function parse(text: string): [LuaDebug.Message[], string, string] {
        const messages: LuaDebug.Message[] = [];
        const processed: string[] = [];
        let position = 0;
        while (position < text.length) {
            const result = parseMessage(text, position);
            processed.push(result.leadingText);
            position = result.newPosition;
            if (!result.message) {
                break;
            }
            messages.push(result.message);
        }
        return [messages, processed.join(""), text.substring(position)];
    }
}
