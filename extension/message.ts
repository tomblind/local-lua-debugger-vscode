/// <reference path = "../debugger/protocol.d.ts" />
export namespace Message {
    function isMessage(obj: Exclude<unknown, null | undefined>): obj is LuaDebug.Message {
        return obj !== null && obj !== undefined && (obj as LuaDebug.Message).tag === "$luaDebug";
    }

    function scanTo(text: string, start: number, ...chars: string[]) {
        let inQuote = false;
        let escape = false;
        for (let i = start; i < text.length; ++i) {
            const c = text[i];
            if (inQuote) {
                if (c === "\\") {
                    escape = true;
                } else if (!escape && c === '"') {
                    inQuote = false;
                } else {
                    escape = false;
                }
            } else if (c === '"') {
                inQuote = true;
            } else if (chars.indexOf(c) >= 0) {
                return i;
            }
        }
        return -1;
    }

    function tryParseMessage(text: string, openBrace: number): [LuaDebug.Message, number] | boolean {
        let level = 0;
        let i = openBrace + 1;
        while (true) {
            const brace = scanTo(text, i, "{", "}");
            if (brace < 0) {
                break;
            }
            if (text[brace] === "{") {
                ++level;
                i = brace + 1;
            } else if (level > 0) {
                --level;
                i = brace + 1;
            } else {
                const objTxt = text.substring(openBrace, brace + 1);
                let obj: unknown;
                try {
                    obj = JSON.parse(objTxt);
                } catch {}
                if (isMessage(obj)) {
                    return [obj, brace];
                } else {
                    return true;
                }
            }
        }
        return false;
    }

    export function parse(text: string): [LuaDebug.Message[], string, string] {
        const messages: LuaDebug.Message[] = [];
        const strs: string[] = [];
        let unprocessedStart = 0;
        let scanStart = 0;
        let haveOpenBrace = false;
        while (true) {
            const openBrace = scanTo(text, scanStart, "{");
            if (openBrace < 0) {
                if (!haveOpenBrace) {
                    const tailStr = text.substr(unprocessedStart);
                    if (tailStr.length > 0) {
                        strs.push(tailStr);
                    }
                    unprocessedStart = text.length;
                }
                return [messages, strs.join(""), text.substr(unprocessedStart)];
            }

            const result = tryParseMessage(text, openBrace);

            if (result === false || result === true) {
                haveOpenBrace = haveOpenBrace || result;
                ++scanStart;
                continue;
            }

            const [msg, closeBrace] = result;
            messages.push(msg);

            const str = text.substring(scanStart, openBrace);
            if (str.length > 0) {
                strs.push(str);
            }

            scanStart = closeBrace + 1;
            unprocessedStart = scanStart;
        }
    }
}
