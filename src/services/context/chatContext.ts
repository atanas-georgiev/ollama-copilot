import * as vscode from "vscode";
import * as pathModule from "path";

export interface ChatContext {
    activeFile: ActiveFileContext | null;
    openTabs: OpenTabContext[];
    repositoryStructure: RepoStructure;
    selectedText: string | null;
    workspaceRoot: string;
}

export interface ActiveFileContext {
    path: string;
    relativePath: string;
    language: string;
    content: string;
    cursorLine: number;
    cursorCharacter: number;
    visibleRange: string;
    totalLines: number;
}

export interface OpenTabContext {
    path: string;
    relativePath: string;
    language: string;
    content: string;
    isActive: boolean;
}

export interface RepoStructure {
    files: RepoFile[];
    directories: string[];
    totalFiles: number;
    root: string;
}

export interface RepoFile {
    path: string;
    relativePath: string;
    language?: string;
    size?: number;
}

/**
 * Builds comprehensive chat context including active file, open tabs, and repository structure
 * Similar to how GitHub Copilot and Cline extensions work
 */
export async function buildChatContext(): Promise<ChatContext> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : "";

    // Get active file context
    const activeFile = await getActiveFileContext(workspaceRoot);
    
    // Get all open tabs context
    const openTabs = await getOpenTabsContext(workspaceRoot);
    
    // Get repository structure
    const repositoryStructure = await getRepositoryStructure(workspaceRoot);
    
    // Get selected text if any
    const selectedText = getSelectedText();

    return {
        activeFile,
        openTabs,
        repositoryStructure,
        selectedText,
        workspaceRoot
    };
}

/**
 * Gets context about the currently active file
 */
async function getActiveFileContext(workspaceRoot: string): Promise<ActiveFileContext | null> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return null;

    const document = activeEditor.document;
    const selection = activeEditor.selection;
    const position = selection.active;

    // Get visible range (what's currently in the editor viewport)
    const visibleRanges = activeEditor.visibleRanges;
    let visibleRange = "";
    if (visibleRanges.length > 0) {
        const range = visibleRanges[0];
        visibleRange = document.getText(range);
    }

    const relativePath = workspaceRoot 
        ? pathModule.relative(workspaceRoot, document.uri.fsPath)
        : document.uri.fsPath;

    return {
        path: document.uri.fsPath,
        relativePath,
        language: document.languageId,
        content: document.getText(),
        cursorLine: position.line,
        cursorCharacter: position.character,
        visibleRange,
        totalLines: document.lineCount - 1
    };
}

/**
 * Gets context about all open tabs
 */
async function getOpenTabsContext(workspaceRoot: string): Promise<OpenTabContext[]> {
    const tabs: OpenTabContext[] = [];
    
    for (const tabGroup of vscode.window.tabGroups.all) {
        for (const tab of tabGroup.tabs) {
            if (tab.input && typeof tab.input === 'object' && 'uri' in tab.input) {
                try {
                    const uri = (tab.input as vscode.TabInputText).uri;
                    const document = await vscode.workspace.openTextDocument(uri);
                    
                    // Skip files that are too large
                    if (document.getText().length > 50000) {
                        continue;
                    }

                    const relativePath = workspaceRoot
                        ? pathModule.relative(workspaceRoot, uri.fsPath)
                        : uri.fsPath;

                    tabs.push({
                        path: uri.fsPath,
                        relativePath,
                        language: document.languageId,
                        content: document.getText(),
                        isActive: vscode.window.activeTextEditor?.document.uri.fsPath === uri.fsPath
                    });
                } catch (error) {
                    console.warn(`Could not read tab:`, error);
                }
            }
        }
    }

    return tabs;
}

/**
 * Gets repository structure (file tree)
 */
async function getRepositoryStructure(workspaceRoot: string): Promise<RepoStructure> {
    if (!workspaceRoot) {
        return {
            files: [],
            directories: [],
            totalFiles: 0,
            root: ""
        };
    }

    const files: RepoFile[] = [];
    const directories = new Set<string>();

    try {
        // Get all files, excluding common ignore patterns
        const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/*.lock,**/*.min.js,**/*.bundle.js}';
        const fileUris = await vscode.workspace.findFiles('**/*', excludePattern, 1000);

        for (const fileUri of fileUris) {
            const relativePath = pathModule.relative(workspaceRoot, fileUri.fsPath);
            const dirPath = pathModule.dirname(relativePath);
            
            // Track directories
            if (dirPath !== '.') {
                const parts = dirPath.split(pathModule.sep);
                let currentPath = '';
                for (const part of parts) {
                    currentPath = currentPath ? `${currentPath}/${part}` : part;
                    directories.add(currentPath);
                }
            }

            // Try to get language info
            let language: string | undefined;
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                language = document.languageId;
            } catch {
                // Skip if we can't open the document
            }

            files.push({
                path: fileUri.fsPath,
                relativePath,
                language
            });
        }
    } catch (error) {
        console.warn("Error building repository structure:", error);
    }

    return {
        files,
        directories: Array.from(directories),
        totalFiles: files.length,
        root: workspaceRoot
    };
}

/**
 * Gets currently selected text
 */
function getSelectedText(): string | null {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return null;

    const selection = activeEditor.selection;
    if (selection.isEmpty) return null;

    return activeEditor.document.getText(selection);
}

/**
 * Formats chat context into a prompt-friendly string
 * This is optimized to fit within token limits while providing maximum useful context
 */
export function formatChatContextForPrompt(context: ChatContext, maxTokens: number = 8000): string {
    let result = "";
    let tokenCount = 0;

    // Helper to estimate tokens (rough estimate: 4 chars per token)
    const addWithLimit = (text: string, priority: number = 1): boolean => {
        const estimatedTokens = text.length / 4;
        if (tokenCount + estimatedTokens > maxTokens && priority < 3) {
            return false;
        }
        
        // Truncate if needed
        const remainingTokens = maxTokens - tokenCount;
        const remainingChars = remainingTokens * 4;
        
        if (text.length > remainingChars) {
            result += text.substring(0, remainingChars) + "\n... [truncated due to context limit]";
            tokenCount = maxTokens;
        } else {
            result += text;
            tokenCount += estimatedTokens;
        }
        
        return true;
    };

    // 1. Active file information (highest priority)
    if (context.activeFile) {
        const activeFile = context.activeFile;
        result += "## Currently Active File\n";
        result += `- File: \`${activeFile.relativePath}\`\n`;
        result += `- Language: ${activeFile.language}\n`;
        result += `- Cursor at line ${activeFile.cursorLine}, character ${activeFile.cursorCharacter}\n`;
        result += `- Total lines: ${activeFile.totalLines}\n\n`;

        // Add full content of active file if it's reasonable size
        if (activeFile.content.length < 15000) {
            const langExt = getLanguageExtension(activeFile.language);
            result += `### Full File Content:\n\`\`\`${langExt}\n${activeFile.content}\n\`\`\`\n\n`;
        } else {
            // For large files, show around the cursor
            const lines = activeFile.content.split('\n');
            const startLine = Math.max(0, activeFile.cursorLine - 50);
            const endLine = Math.min(lines.length - 1, activeFile.cursorLine + 50);
            const relevantLines = lines.slice(startLine, endLine + 1).join('\n');
            
            const langExt = getLanguageExtension(activeFile.language);
            result += `### Content around cursor (lines ${startLine + 1}-${endLine + 1}):\n`;
            result += `\`\`\`${langExt}\n${relevantLines}\n\`\`\`\n\n`;
        }
    }

    // 2. Selected text (high priority)
    if (context.selectedText) {
        result += "## Selected Code:\n";
        result += "```\n" + context.selectedText + "\n```\n\n";
    }

    // 3. Open tabs (medium priority)
    const otherOpenTabs = context.openTabs.filter(tab => !tab.isActive);
    if (otherOpenTabs.length > 0) {
        result += `## Other Open Files (${otherOpenTabs.length} files):\n\n`;
        
        for (const tab of otherOpenTabs.slice(0, 5)) { // Limit to 5 additional files
            const fileSection = `### ${tab.relativePath} (${tab.language})\n`;
            if (addWithLimit(fileSection, 2)) {
                // Show first 100 lines or full content if small
                const lines = tab.content.split('\n');
                const contentToShow = lines.length > 100 
                    ? lines.slice(0, 100).join('\n') + '\n... [truncated]'
                    : tab.content;
                
                const langExt = getLanguageExtension(tab.language);
                addWithLimit(`\`\`\`${langExt}\n${contentToShow}\n\`\`\`\n\n`, 2);
            }
        }
    }

    // 4. Repository structure (lower priority but useful for understanding project)
    if (context.repositoryStructure.files.length > 0) {
        result += "## Repository Structure:\n";
        result += `- Root: \`${context.workspaceRoot}\`\n`;
        result += `- Total files: ${context.repositoryStructure.totalFiles}\n\n`;

        // Build a tree-like structure
        const tree = buildFileTree(context.repositoryStructure.files.slice(0, 50)); // Limit for performance
        addWithLimit("```\n" + tree + "\n```\n\n", 3);
    }

    return result;
}

/**
 * Builds a simple file tree representation
 */
function buildFileTree(files: RepoFile[]): string {
    if (files.length === 0) return "(no files)";

    // Group files by directory
    const dirMap = new Map<string, string[]>();
    
    for (const file of files) {
        const dir = pathModule.dirname(file.relativePath);
        const basename = pathModule.basename(file.relativePath);
        
        if (!dirMap.has(dir)) {
            dirMap.set(dir, []);
        }
        dirMap.get(dir)!.push(basename);
    }

    let tree = "";
    
    // Sort directories for consistent output
    const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (const [dir, filenames] of sortedDirs) {
        if (dir === '.') {
            for (const file of filenames.slice(0, 10)) {
                tree += `${file}\n`;
            }
            if (filenames.length > 10) {
                tree += `  ... and ${filenames.length - 10} more files\n`;
            }
        } else {
            tree += `${dir}/\n`;
            for (const file of filenames.slice(0, 15)) {
                tree += `  ${file}\n`;
            }
            if (filenames.length > 15) {
                tree += `  ... and ${filenames.length - 15} more files\n`;
            }
        }
    }

    return tree.trim();
}

/**
 * Gets the appropriate language identifier for code blocks
 */
function getLanguageExtension(languageId: string): string {
    const map: Record<string, string> = {
        'javascript': 'javascript',
        'typescript': 'typescript',
        'typescriptreact': 'tsx',
        'javascriptreact': 'jsx',
        'python': 'python',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'markdown': 'markdown',
        'yaml': 'yaml',
        'yml': 'yaml',
        'java': 'java',
        'go': 'go',
        'rust': 'rust',
        'c': 'c',
        'cpp': 'cpp',
        'csharp': 'csharp',
        'php': 'php',
        'ruby': 'ruby',
        'swift': 'swift',
        'kotlin': 'kotlin',
        'shellscript': 'bash',
        'shaderlab': 'hlsl',
        'dockerfile': 'dockerfile',
        'makefile': 'makefile',
    };
    
    return map[languageId.toLowerCase()] || '';
}

/**
 * Finds relevant files based on the query and active file
 * This implements smart context selection similar to Copilot
 */
export async function findRelevantFiles(query: string, activeFilePath: string, workspaceRoot: string): Promise<RepoFile[]> {
    const relevantFiles: RepoFile[] = [];
    
    if (!workspaceRoot) return relevantFiles;

    try {
        // Get file names that might be related to the query
        const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
        
        // Search for files matching query terms in their path or content
        const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}';
        const fileUris = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,java,go,rs,c,cpp,h,hpp}', excludePattern, 100);

        for (const fileUri of fileUris) {
            const relativePath = pathModule.relative(workspaceRoot, fileUri.fsPath).toLowerCase();
            
            // Check if any query term matches the file path
            const pathMatch = queryTerms.some(term => relativePath.includes(term));
            
            if (pathMatch) {
                try {
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    relevantFiles.push({
                        path: fileUri.fsPath,
                        relativePath: pathModule.relative(workspaceRoot, fileUri.fsPath),
                        language: document.languageId
                    });
                } catch {
                    // Skip if can't open
                }
            }
        }
    } catch (error) {
        console.warn("Error finding relevant files:", error);
    }

    return relevantFiles;
}
