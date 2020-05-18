const vscode = require('vscode');
const nextIndentPattern = /.*[\{\[\(\:]\s*(\/\/.*|\/\*.*\*\/\s*|#.*|)$/gm;
const nextIndentPattern_makefile = /.*[\{\[\(\:]/gm;

function lineRequiresNextIndent(line, doc) {
    let lineStr = line.text;
    let matches = lineStr.match((doc.languageId === "makefile")
        ? nextIndentPattern_makefile
        : nextIndentPattern
    );
    return matches;
}

function lineRequiresUnindent(line) {
    if (line.isEmptyOrWhitespace) {
        return false;
    }
    let startChar = line.text.charCodeAt(line.firstNonWhitespaceCharacterIndex);
    return ((startChar === 41) || // )
            (startChar === 93) || // ]
            (startChar === 125)); // }
}

function leadWsCount(line, tabSize) {
    let result = 0;
    let text = line.text;
    for (let i = line.firstNonWhitespaceCharacterIndex - 1; i >= 0; i--) {
        let code = text.charCodeAt(i);
        if (code === 9) {
            result += tabSize;
        } else {
            result++;
        }
    }
    return result;
}

exports.activate = function() {
    vscode.commands.registerCommand('tab', () => {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        let sel = editor.selection.active;
        let cursorLine = sel.line;
        let doc = editor.document;

        let prevLine;
        for (let i = cursorLine-1; i >= 0; i--) {
            let l = doc.lineAt(i);
            if (l.isEmptyOrWhitespace) {
                continue;
            }
            let txt = l.text;
            let char1 = txt.charCodeAt(l.firstNonWhitespaceCharacterIndex);
            let char2 = txt.charCodeAt(l.firstNonWhitespaceCharacterIndex + 1);
            if ((char1 === 47) && (char2 === 47 || char2 === 42)) { // '//' and '/*'
                continue;
            } else if (char1 === 35) { // #
                continue;
            }
            prevLine = l;
            break;
        }
        if (!prevLine) {
            return;
        }
        let currLine = doc.lineAt(cursorLine);

        let options = editor.options;
        let indentSize = options.indentSize;
        let tabSize = options.tabSize;
        let insertSpaces = options.insertSpaces;

        let currIndent;
        let prevIndent;
        let indentStep;

        currIndent = leadWsCount(currLine, tabSize);
        prevIndent = leadWsCount(prevLine, tabSize);
        indentStep = insertSpaces ? indentSize : tabSize;

        let target;
        if (lineRequiresUnindent(currLine, doc)) {
            if (lineRequiresNextIndent(prevLine, doc)) {
                // example {
                // }
                target = prevIndent;
            } else {
                //     example
                // }
                target = prevIndent - indentStep;
                if (target < 0) {
                    target = 0;
                }
            }
        }
        else if (lineRequiresNextIndent(prevLine, doc)) {
            target = prevIndent + indentStep;
        }
        else {
            target = prevIndent;
        }

        // unify leading whitespace if it contains indents not of our tab/space mode
        let txt = currLine.text;
        let end = currLine.firstNonWhitespaceCharacterIndex;
        let validWs = insertSpaces ? 32 : 9;
        // diff can be zero here, but we may need to replace spaces with tabs and still have a diff
        for (let i = 0; i < end; i++) {
            if (txt.charCodeAt(i) !== validWs) {
                // Leading whitespace contains a whitespace char of the opposite type
                // Replace the whole whitespace from start of line with the proper number of our
                // ws char
                editor.edit(function(builder) {
                    builder.replace(new vscode.Range(cursorLine, 0, cursorLine, end), insertSpaces
                    ? ' '.repeat(target)
                    : '\t'.repeat(Math.floor(target/tabSize)));
                })
                .then(function() {
                    let sel = editor.selection;
                    if (!sel.isEmpty) {
                        editor.selection = new vscode.Selection(sel.end, sel.end);
                    }
                });
                return;
            }
        }

        let diff = (currIndent - target); // diff is always in spaces
        if (diff == 0) {
            // business as usual
            editor.edit(function(builder) {
                builder.insert(editor.selection.active, (
                    // diff == 0 : Normal indent
                    insertSpaces? ' '.repeat(-diff) : '\t'.repeat(Math.floor((-diff) / tabSize))
                ));
            });
        } else if (diff > 0) {
            // overindented - delete some spaces
            editor.edit(function(builder) {
                builder.insert(new vscode.Position(cursorLine, currIndent), (
                    // diff < 0 : under-indented, add some spaces
                    insertSpaces? ' '.repeat(-diff + (diff == 0? 1 : 0)) : '\t'.repeat(Math.floor((-diff) / tabSize) + (diff == 0? 1 : 0))
                ));
            });
        } else {
            editor.edit(function(builder) {
                builder.insert(new vscode.Position(cursorLine, 0), (
                    // diff < 0 : under-indented, add some spaces
                    insertSpaces? ' '.repeat(-diff) : '\t'.repeat(Math.floor((-diff) / tabSize))
                ));
            });
        }
    } catch(e) {
        console.error("Exception:", e);
    }
    });
}
