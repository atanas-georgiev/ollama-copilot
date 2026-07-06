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
exports.buildRepoContext = buildRepoContext;
exports.buildEnhancedContext = buildEnhancedContext;
exports.buildContext = buildContext;
const vscode = __importStar(require("vscode"));
/**
 * Builds comprehensive repository context for Ollama
 */
async function buildRepoContext(document, position) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return {
            files: [],
            workspaceRoot: "",
            currentFile: {
                path: document.uri.fsPath,
                content: document.getText(),
                language: document.languageId
            }
        };
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const currentFilePath = document.uri.fsPath;
    // Get current file context
    const currentFileContext = {
        path: currentFilePath,
        content: document.getText(),
        language: document.languageId
    };
    // Build list of relevant files in workspace
    const files = [];
    try {
        // Get all files in workspace (with reasonable limits)
        const fileUris = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx,py,java,go,rs,c,h,cpp,html,css,scss,php,rb,swift}', '**/node_modules/**', 50);
        for (const fileUri of fileUris) {
            // Skip the current file to avoid duplication
            if (fileUri.fsPath === currentFilePath)
                continue;
            try {
                const fileDocument = await vscode.workspace.openTextDocument(fileUri);
                files.push({
                    path: fileUri.fsPath,
                    content: fileDocument.getText(),
                    language: fileDocument.languageId
                });
            }
            catch (error) {
                // Skip files that can't be read
                console.warn(`Could not read file ${fileUri.fsPath}:`, error);
            }
        }
    }
    catch (error) {
        console.warn("Error building repo context:", error);
    }
    return {
        files,
        workspaceRoot,
        currentFile: currentFileContext
    };
}
/**
 * Builds enhanced context including repository information
 */
async function buildEnhancedContext(document, position) {
    const basicContext = buildContext(document, position);
    const repoContext = await buildRepoContext(document, position);
    return {
        ...basicContext,
        repoContext: repoContext,
        // Add workspace information
        workspaceRoot: repoContext.workspaceRoot,
        fileCount: repoContext.files.length
    };
}
// Keep the original context builder for backward compatibility
function buildContext(document, position) {
    const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const windowStart = Math.max(0, position.line - 30);
    const windowEnd = Math.min(document.lineCount - 1, position.line + 30);
    const window = document.getText(new vscode.Range(new vscode.Position(windowStart, 0), new vscode.Position(windowEnd, 0)));
    return {
        language: document.languageId,
        prefix,
        window
    };
}
//# sourceMappingURL=repoContext.js.map