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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const inlineProvider_1 = require("./inlineProvider");
const diffEditor_1 = require("./diffEditor");
const chatContext_1 = require("./chatContext");
const chatSidebar_1 = require("./chatSidebar");
const settingsPanel_1 = require("./settingsPanel");
// Maximum tokens for context window (adjust based on your model)
const MAX_CONTEXT_TOKENS = 12000;
// Tokens reserved for system prompt and current context
const RESERVED_TOKENS = 3000;
// Max tokens available for chat history
const HISTORY_TOKEN_BUDGET = MAX_CONTEXT_TOKENS - RESERVED_TOKENS;
// Track chat state per panel
const chatStates = new Map();
function getChatPanelKey(panel) {
    return `chat_${panel.viewColumn}_${Date.now()}`;
}
function activate(context) {
    vscode.window.showInformationMessage("Ollama Copilot activated 🚀");
    const provider = new inlineProvider_1.OllamaInlineProvider();
    context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, provider));
    (0, diffEditor_1.registerDiffCommand)(context);
    // Register chat sidebar
    const chatSidebarProvider = new chatSidebar_1.ChatSidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('ollamaCopilot.chatSidebar', chatSidebarProvider));
    // Register open settings command
    context.subscriptions.push(vscode.commands.registerCommand("ollamaCopilot.openSettings", () => {
        settingsPanel_1.SettingsPanelProvider.render(context.extensionUri);
    }));
    // Register chat command
    context.subscriptions.push(vscode.commands.registerCommand("ollama.chat", async () => {
        const input = await vscode.window.showInputBox({
            prompt: "What would you like to ask?",
            placeHolder: "Ask a question about your code..."
        });
        if (!input)
            return;
        // Create a new chat window
        const chatPanel = vscode.window.createWebviewPanel('ollamaChat', 'Ollama Chat', vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        // Generate unique key for this chat session
        const panelKey = getChatPanelKey(chatPanel);
        chatStates.set(panelKey, { messages: [], summary: null });
        // Set initial HTML content
        chatPanel.webview.html = getChatHtml();
        // Send initial greeting with panel key
        chatPanel.webview.postMessage({
            type: 'init',
            panelKey: panelKey,
            message: 'Hello! How can I help you with your code today?'
        });
        // Handle panel disposal - clean up chat state
        chatPanel.onDidDispose(() => {
            chatStates.delete(panelKey);
        });
        // Handle messages from the webview
        chatPanel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'query') {
                const config = vscode.workspace.getConfiguration('ollamaCopilot');
                const baseUrl = config.get('baseUrl', 'http://192.168.100.123:11434');
                const chatModel = config.get('chatModel', 'qwen3.6:27b');
                const state = chatStates.get(panelKey);
                if (!state)
                    return;
                // Notify webview to show thinking indicator
                chatPanel.webview.postMessage({
                    type: 'thinking',
                    thinking: true
                });
                // Build comprehensive chat context with active file content, open tabs, and repo structure
                const chatContext = await (0, chatContext_1.buildChatContext)();
                const contextPrompt = (0, chatContext_1.formatChatContextForPrompt)(chatContext);
                // Also find relevant files based on the query
                const activeEditor = vscode.window.activeTextEditor;
                let relevantFilesContext = "";
                if (activeEditor) {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    const workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : "";
                    const relevantFiles = await (0, chatContext_1.findRelevantFiles)(message.query, activeEditor.document.uri.fsPath, workspaceRoot);
                    if (relevantFiles.length > 0) {
                        relevantFilesContext = "\n\n## Related Files Found:\n";
                        for (const file of relevantFiles.slice(0, 3)) {
                            relevantFilesContext += `- \`${file.relativePath}\` (${file.language})\n`;
                        }
                    }
                }
                // Build the current user message with context (only attached to latest message)
                const currentUserMessage = contextPrompt
                    ? `Context information:\n${contextPrompt}${relevantFilesContext}\n\nQuestion: ${message.query}`
                    : message.query;
                // Add user message to history
                state.messages.push({ role: 'user', content: currentUserMessage });
                // Manage token budget - compress history if needed
                const messagesToSend = manageChatHistory(state, panelKey, baseUrl, chatModel || 'qwen3.6:27b');
                // Stream response tokens to webview in real-time
                let fullResponse = "";
                let tokenCount = 0;
                const startTime = Date.now();
                await streamOllamaResponseWithHistory(messagesToSend, chatModel || 'qwen3.6:27b', baseUrl || 'http://192.168.100.123:11434', (token) => {
                    tokenCount++;
                    fullResponse += token;
                    // Send each token chunk to the webview for live display
                    chatPanel.webview.postMessage({
                        type: 'stream_token',
                        token: token,
                        tokenCount: tokenCount
                    });
                });
                const totalTime = Date.now() - startTime;
                // Strip thinking tags before storing in history to keep context clean
                var cleanResponse = fullResponse
                    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                    .replace(/<think>[\s\S]*?<\/think>/gi, '');
                state.messages.push({ role: 'assistant', content: cleanResponse });
                // Send final message with token info
                chatPanel.webview.postMessage({
                    type: 'response_end',
                    content: fullResponse,
                    tokenInfo: {
                        tokenCount: tokenCount,
                        totalTime: totalTime,
                        historyLength: state.messages.length
                    }
                });
            }
            else if (message.type === 'clear') {
                const state = chatStates.get(panelKey);
                if (state) {
                    state.messages = [];
                    state.summary = null;
                    chatPanel.webview.postMessage({
                        type: 'cleared'
                    });
                }
            }
        });
    }));
}
function deactivate() { }
// Helper function to get Ollama response with enhanced context
async function getOllamaResponse(query, model, baseUrl, contextInfo) {
    try {
        // Build enhanced prompt with context
        const enhancedQuery = contextInfo ?
            `Context information:\n${contextInfo}\n\nQuestion: ${query}` :
            query;
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                stream: true,
                messages: [
                    {
                        role: "system",
                        content: `You are an expert software engineering assistant operating inside a code editor.

Your goal is to help the user plan, modify, debug, and improve real codebases.

Core rules:
Be concise, correct, and practical
Prefer direct solutions over long explanations
Work like a senior engineer reviewing and editing code
Never hallucinate APIs or dependencies

Behavior:
When changing code, output only the necessary code changes
When asked to solve a problem, provide clear steps + implementation
When debugging, identify the issue briefly and fix it
When refactoring, preserve behavior unless told otherwise

Interaction style:
Think in terms of: problem → solution → minimal code change
Ask a clarification only if absolutely required
Otherwise make reasonable assumptions and proceed

Output format:
Code changes only when relevant
Brief explanation only if it helps understanding
No unnecessary commentary`
                    },
                    { role: "user", content: enhancedQuery }
                ]
            })
        });
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader)
            return { content: "No response from Ollama", tokenCount: 0, totalTime: 0 };
        const decoder = new TextDecoder();
        let buffer = "";
        let result = "";
        let tokenCount = 0;
        const startTime = Date.now();
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const json = JSON.parse(line);
                    const response = json.message?.content;
                    if (response) {
                        tokenCount++;
                        result += response;
                    }
                }
                catch { }
            }
        }
        const totalTime = Date.now() - startTime;
        return { content: result, tokenCount, totalTime };
    }
    catch (error) {
        return { content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, tokenCount: 0, totalTime: 0 };
    }
}
// Helper function to load HTML for chat panel from external file
function getChatHtml() {
    const htmlPath = path.join(__dirname, '..', 'src', 'chat.html');
    return fs.readFileSync(htmlPath, 'utf-8');
}
// Estimate token count from text (rough approximation: ~4 chars per token)
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Manages chat history to stay within token budget.
 * Uses a sliding window approach with progressive compression:
 * 1. First removes oldest messages when over budget
 * 2. When history is long, creates a summary of early conversation
 * 3. Keeps recent messages intact for context quality
 */
function manageChatHistory(state, panelKey, baseUrl, model) {
    let messages = [...state.messages];
    // Calculate total token usage
    const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    if (totalTokens <= HISTORY_TOKEN_BUDGET) {
        // Within budget - return as-is
        return messages.map(m => ({ role: m.role, content: m.content }));
    }
    // Over budget - need to compress
    // Strategy: keep last N recent messages, summarize the rest
    // Determine how many recent message pairs to keep (at least 2 exchanges = 4 messages)
    const recentPairsToKeep = 3;
    const recentMessagesToKeep = recentPairsToKeep * 2;
    if (messages.length <= recentMessagesToKeep) {
        // Not enough messages to remove - truncate the largest messages
        return truncateLargestMessages(messages, HISTORY_TOKEN_BUDGET);
    }
    // Split into old and recent messages
    const recentMessages = messages.slice(-recentMessagesToKeep);
    const oldMessages = messages.slice(0, -recentMessagesToKeep);
    // Create a concise summary of old conversation
    const oldConversationText = oldMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');
    const summary = createConversationSummary(oldConversationText);
    // Store summary in state for future reference
    state.summary = summary;
    // Build compressed message list
    const compressedMessages = [];
    // Add summary as system context if we have one
    if (summary) {
        compressedMessages.push({
            role: 'user',
            content: `Previous conversation summary:\n${summary}\n\nThe conversation continues below:`
        });
        compressedMessages.push({
            role: 'assistant',
            content: 'I understand the context from our previous conversation. How can I help further?'
        });
    }
    // Add recent messages
    compressedMessages.push(...recentMessages.map(m => ({ role: m.role, content: m.content })));
    // Verify we're now within budget
    const newTokenCount = compressedMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    if (newTokenCount > HISTORY_TOKEN_BUDGET) {
        // Still over - reduce recent messages kept
        return truncateLargestMessages(compressedMessages, HISTORY_TOKEN_BUDGET);
    }
    return compressedMessages;
}
/**
 * Truncates the largest messages to fit within token budget
 */
function truncateLargestMessages(messages, budget) {
    let result = [...messages];
    let totalTokens = result.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    while (totalTokens > budget && result.length > 1) {
        // Find the message with the most tokens (skip the last user message to preserve current query)
        let maxIdx = 0;
        let maxTokens = 0;
        for (let i = 0; i < result.length - 1; i++) {
            const tokens = estimateTokens(result[i].content);
            if (tokens > maxTokens) {
                maxTokens = tokens;
                maxIdx = i;
            }
        }
        if (maxTokens > 0) {
            // Truncate this message to 30% of its original size
            const truncatedContent = result[maxIdx].content.substring(0, Math.floor(result[maxIdx].content.length * 0.3)) + '\n\n[content truncated for token efficiency]';
            const oldTokens = estimateTokens(result[maxIdx].content);
            const newTokens = estimateTokens(truncatedContent);
            totalTokens = totalTokens - oldTokens + newTokens;
            result[maxIdx].content = truncatedContent;
        }
        else {
            break;
        }
    }
    return result.map(m => ({ role: m.role, content: m.content }));
}
/**
 * Creates a concise summary of older conversation messages
 * Uses keyword extraction and pattern matching for efficiency (no extra API call)
 */
function createConversationSummary(conversationText) {
    const lines = conversationText.split('\n').filter(l => l.trim());
    const summary = [];
    // Extract key topics from user messages
    const userMessages = conversationText.split('user:').slice(1).map(s => s.split('\n\n')[0]);
    const topics = new Set();
    for (const msg of userMessages) {
        // Extract code-related keywords
        const codeKeywords = msg.match(/\b(function|class|import|export|interface|type|const|let|var|async|await|return|if|else|for|while|try|catch|error|bug|fix|refactor|implement|test|api|component|hook|state|props)\b/gi);
        if (codeKeywords) {
            codeKeywords.forEach(k => topics.add(k.toLowerCase()));
        }
        // Extract file references
        const fileRefs = msg.match(/`[^`]+\`/g);
        if (fileRefs) {
            fileRefs.forEach(f => topics.add(f));
        }
    }
    // Build summary
    if (topics.size > 0) {
        summary.push(`Topics discussed: ${Array.from(topics).slice(0, 15).join(', ')}`);
    }
    // Count exchanges
    const exchangeCount = conversationText.split('user:').length - 1;
    summary.push(`Total previous exchanges: ${exchangeCount}`);
    // Extract any code decisions or conclusions from assistant messages
    const assistantParts = conversationText.split('assistant:');
    for (const part of assistantParts.slice(1)) {
        const firstSentence = part.split('.')[0].trim();
        if (firstSentence.length < 200 && firstSentence.length > 20) {
            summary.push(`- ${firstSentence}.`);
        }
    }
    return summary.slice(0, 8).join('\n');
}
/**
 * Sends chat with full message history to Ollama's /api/chat endpoint
 * Uses the native multi-turn conversation support
 */
async function getOllamaResponseWithHistory(messages, model, baseUrl) {
    const systemPrompt = `You are an expert software engineering assistant operating inside a code editor.

Your goal is to help the user plan, modify, debug, and improve real codebases.

Core rules:
Be concise, correct, and practical
Prefer direct solutions over long explanations
Work like a senior engineer reviewing and editing code
Never hallucinate APIs or dependencies

Behavior:
When changing code, output only the necessary code changes
When asked to solve a problem, provide clear steps + implementation
When debugging, identify the issue briefly and fix it
When refactoring, preserve behavior unless told otherwise

Interaction style:
Think in terms of: problem → solution → minimal code change
Ask a clarification only if absolutely required
Otherwise make reasonable assumptions and proceed

Output format:
Code changes only when relevant
Brief explanation only if it helps understanding
No unnecessary commentary`;
    try {
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                stream: true,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages
                ]
            })
        });
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader)
            return { content: "No response from Ollama", tokenCount: 0, totalTime: 0 };
        const decoder = new TextDecoder();
        let buffer = "";
        let result = "";
        let tokenCount = 0;
        const startTime = Date.now();
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const json = JSON.parse(line);
                    const response = json.message?.content;
                    if (response) {
                        tokenCount++;
                        result += response;
                    }
                }
                catch { }
            }
        }
        const totalTime = Date.now() - startTime;
        return { content: result, tokenCount, totalTime };
    }
    catch (error) {
        return { content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, tokenCount: 0, totalTime: 0 };
    }
}
/**
 * Streams chat response tokens in real-time with a callback for each token.
 * This allows the UI to display tokens as they arrive instead of waiting for the full response.
 */
async function streamOllamaResponseWithHistory(messages, model, baseUrl, onToken) {
    const systemPrompt = `You are an expert software engineering assistant operating inside a code editor.

Your goal is to help the user plan, modify, debug, and improve real codebases.

Core rules:
Be concise, correct, and practical
Prefer direct solutions over long explanations
Work like a senior engineer reviewing and editing code
Never hallucinate APIs or dependencies

Behavior:
When changing code, output only the necessary code changes
When asked to solve a problem, provide clear steps + implementation
When debugging, identify the issue briefly and fix it
When refactoring, preserve behavior unless told otherwise

Interaction style:
Think in terms of: problem → solution → minimal code change
Ask a clarification only if absolutely required
Otherwise make reasonable assumptions and proceed

Output format:
Code changes only when relevant
Brief explanation only if it helps understanding
No unnecessary commentary`;
    const apiStartTime = Date.now();
    console.log(`[OllamaCopilot] Streaming API request to ${baseUrl}/api/chat`);
    console.log(`[OllamaCopilot] Model: ${model}`);
    try {
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                stream: true,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages
                ]
            })
        });
        const connectTime = Date.now() - apiStartTime;
        console.log(`[OllamaCopilot] API connected in ${connectTime}ms, status: ${res.status}`);
        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`HTTP ${res.status}: ${errorBody}`);
        }
        const reader = res.body?.getReader();
        if (!reader) {
            console.warn("[OllamaCopilot] No reader available from response");
            onToken("[Error: No response stream available]");
            return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let tokenCount = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const json = JSON.parse(line);
                    const token = json.message?.content;
                    if (token) {
                        tokenCount++;
                        onToken(token);
                    }
                }
                catch (parseError) {
                    console.warn(`[OllamaCopilot] Failed to parse stream line: ${line}`);
                }
            }
        }
        const totalTime = Date.now() - apiStartTime;
        console.log(`[OllamaCopilot] Stream complete - ${tokenCount} tokens in ${totalTime}ms`);
    }
    catch (error) {
        const totalTime = Date.now() - apiStartTime;
        console.error(`[OllamaCopilot] Stream error after ${totalTime}ms:`, error instanceof Error ? error.message : String(error));
        const errorMsg = error instanceof Error ? error.message : String(error);
        onToken(`[Error: ${errorMsg}]`);
    }
}
//# sourceMappingURL=extension.js.map