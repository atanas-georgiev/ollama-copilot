import * as vscode from "vscode";

export function buildContext(
    document: vscode.TextDocument,
    position: vscode.Position
) {
    const prefix = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
    );

    const windowStart = Math.max(0, position.line - 30);
    const windowEnd = Math.min(document.lineCount - 1, position.line + 30);

    const window = document.getText(
        new vscode.Range(
            new vscode.Position(windowStart, 0),
            new vscode.Position(windowEnd, 0)
        )
    );

    return {
        language: document.languageId,
        prefix,
        window
    };
}
