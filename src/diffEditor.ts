import * as vscode from "vscode";

export function registerDiffCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ollama.showDiff",
            async (original: string, modified: string) => {

                const doc = await vscode.workspace.openTextDocument({
                    content: modified,
                    language:
                        vscode.window.activeTextEditor?.document.languageId ||
                        "plaintext"
                });

                await vscode.window.showTextDocument(
                    doc,
                    vscode.ViewColumn.Beside
                );

                const choice = await vscode.window.showInformationMessage(
                    "Apply AI changes?",
                    "Apply",
                    "Discard"
                );

                if (choice === "Apply") {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) return;

                    const fullRange = new vscode.Range(
                        editor.document.positionAt(0),
                        editor.document.positionAt(
                            editor.document.getText().length
                        )
                    );

                    await editor.edit((edit) => {
                        edit.replace(fullRange, modified);
                    });
                }
            }
        )
    );
}
