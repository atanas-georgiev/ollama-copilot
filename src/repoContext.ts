import * as vscode from "vscode";

export interface RepoContext {
    files: {
        path: string;
        content: string;
        language: string;
    }[];
    workspaceRoot: string;
    currentFile: {
        path: string;
        content: string;
        language: string;
    };
}

/**
 * Builds comprehensive repository context for Ollama
 */
export async function buildRepoContext(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<RepoContext> {
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
    const files: { path: string; content: string; language: string }[] = [];
    
    try {
        // Get all files in workspace (with reasonable limits)
        const fileUris = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx,py,java,go,rs,c,h,cpp,html,css,scss,php,rb,swift}', '**/node_modules/**', 50);
        
        for (const fileUri of fileUris) {
            // Skip the current file to avoid duplication
            if (fileUri.fsPath === currentFilePath) continue;
            
            try {
                const fileDocument = await vscode.workspace.openTextDocument(fileUri);
                files.push({
                    path: fileUri.fsPath,
                    content: fileDocument.getText(),
                    language: fileDocument.languageId
                });
            } catch (error) {
                // Skip files that can't be read
                console.warn(`Could not read file ${fileUri.fsPath}:`, error);
            }
        }
    } catch (error) {
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
export async function buildEnhancedContext(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<any> {
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
