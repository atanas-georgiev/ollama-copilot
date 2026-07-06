"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDiffCommand = registerDiffCommand;
const vscode = __importStar(require("vscode"));
function registerDiffCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("ollama.showDiff", async (original, modified) => {
        const doc = await vscode.workspace.openTextDocument({
            content: modified,
            language: vscode.window.activeTextEditor?.document.languageId ||
                "plaintext"
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        const choice = await vscode.window.showInformationMessage("Apply AI changes?", "Apply", "Discard");
        if (choice === "Apply") {
            const editor = vscode.window.activeTextEditor;
            if (!editor)
                return;
            const fullRange = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length));
            await editor.edit((edit) => {
                edit.replace(fullRange, modified);
            });
        }
    }));
}
//# sourceMappingURL=diffEditor.js.map