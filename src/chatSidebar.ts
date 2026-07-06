import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { buildChatContext, formatChatContextForPrompt, findRelevantFiles } from "./chatContext";

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    // Original user query without context (for budget calculations)
    originalQuery?: string;
}

interface ChatState {
    messages: ChatMessage[];
    summary: string | null;
}

const MAX_CONTEXT_TOKENS = 12000;
const RESERVED_TOKENS = 3000;
const HISTORY_TOKEN_BUDGET = MAX_CONTEXT_TOKENS - RESERVED_TOKENS;

let chatState: ChatState = { messages: [], summary: null };

export class ChatSidebarProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Send initial greeting
        webviewView.webview.postMessage({
            type: 'init',
            message: 'Hello! How can I help you with your code today?'
        });

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'query') {
                const config = vscode.workspace.getConfiguration('ollamaCopilot');
                const baseUrl = config.get<string>('baseUrl', 'http://192.168.100.123:11434');
                const chatModel = config.get<string>('chatModel', 'qwen3.6:27b');

                // Show thinking indicator
                webviewView.webview.postMessage({
                    type: 'thinking',
                    thinking: true
                });

                // Build comprehensive chat context
                const chatContext = await buildChatContext();
                const contextPrompt = formatChatContextForPrompt(chatContext);

                // Find relevant files based on the query
                const activeEditor = vscode.window.activeTextEditor;
                let relevantFilesContext = "";
                if (activeEditor) {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    const workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : "";
                    const relevantFiles = await findRelevantFiles(message.query, activeEditor.document.uri.fsPath, workspaceRoot);
                    if (relevantFiles.length > 0) {
                        relevantFilesContext = "\n\n## Related Files Found:\n";
                        for (const file of relevantFiles.slice(0, 3)) {
                            relevantFilesContext += `- \`${file.relativePath}\` (${file.language})\n`;
                        }
                    }
                }

                // Build the current user message with context (for API)
                const currentUserMessageWithContext = contextPrompt
                    ? `Context information:\n${contextPrompt}${relevantFilesContext}\n\nQuestion: ${message.query}`
                    : message.query;

                // Add user message to history - store original query for budget calculations
                chatState.messages.push({ role: 'user', content: currentUserMessageWithContext, originalQuery: message.query });

                // Manage token budget
                const messagesToSend = manageChatHistory(chatState, baseUrl, chatModel || 'qwen3.6:27b');

                // Stream response tokens to webview with thinking detection
                let fullResponse = "";
                let thinkingContent = "";
                let tokenCount = 0;
                const startTime = Date.now();
                let isThinking = false;
                let thinkingStarted = false;

                await streamOllamaResponseWithHistory(
                    messagesToSend,
                    chatModel || 'qwen3.6:27b',
                    baseUrl || 'http://192.168.100.123:11434',
                    (token: string, inThinking: boolean) => {
                        tokenCount++;
                        fullResponse += token;

                        if (inThinking) {
                            isThinking = true;
                            if (!thinkingStarted) {
                                thinkingStarted = true;
                                // Notify webview that thinking has started
                                webviewView.webview.postMessage({
                                    type: 'thinking_start'
                                });
                            }
                            thinkingContent += token;
                            // Stream thinking content in real-time
                            webviewView.webview.postMessage({
                                type: 'stream_thinking',
                                token: token
                            });
                        } else {
                            // If we were thinking and now we're not, notify the webview
                            if (thinkingStarted && !inThinking) {
                                webviewView.webview.postMessage({
                                    type: 'thinking_end'
                                });
                            }
                            // Stream regular token
                            webviewView.webview.postMessage({
                                type: 'stream_token',
                                token: token,
                                tokenCount: tokenCount
                            });
                        }
                    }
                );

                const totalTime = Date.now() - startTime;

                // If thinking never properly ended, send thinking_end
                if (thinkingStarted) {
                    webviewView.webview.postMessage({
                        type: 'thinking_end'
                    });
                }

                // Strip thinking tags before storing in history
                var cleanResponse = fullResponse
                    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                    .replace(/<think>[\s\S]*?<\/think>/gi, '');
                chatState.messages.push({ role: 'assistant', content: cleanResponse });

                // Calculate token budget after adding response
                const budgetInfo = calculateTokenBudget(chatState);

                // Send final message with token info
                webviewView.webview.postMessage({
                    type: 'response_end',
                    content: fullResponse,
                    thinkingContent: thinkingContent,
                    tokenInfo: {
                        tokenCount: tokenCount,
                        totalTime: totalTime,
                        historyLength: chatState.messages.length
                    },
                    budgetInfo: budgetInfo
                });
            } else if (message.type === 'clear') {
                chatState.messages = [];
                chatState.summary = null;
                webviewView.webview.postMessage({
                    type: 'cleared'
                });
            } else if (message.type === 'openSettings') {
                vscode.commands.executeCommand('ollamaCopilot.openSettings');
            }
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const htmlPath = path.join(__dirname, '..', 'src', 'chatSidebar.html');
        return fs.readFileSync(htmlPath, 'utf-8');
    }
}

// Estimate token count from text
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

interface TokenBudgetInfo {
    usedTokens: number;
    budgetTokens: number;
    maxContextTokens: number;
    reservedTokens: number;
    remainingTokens: number;
    percentageUsed: number;
    willTruncate: boolean;
}

function calculateTokenBudget(state: ChatState): TokenBudgetInfo {
    // For budget calculations, use originalQuery for user messages (without context overhead)
    // and full content for assistant responses
    const usedTokens = state.messages.reduce((sum, msg) => {
        const textToCount = msg.role === 'user' && msg.originalQuery
            ? msg.originalQuery
            : msg.content;
        return sum + estimateTokens(textToCount);
    }, 0);
    const remainingTokens = Math.max(0, HISTORY_TOKEN_BUDGET - usedTokens);
    const percentageUsed = Math.min(100, (usedTokens / HISTORY_TOKEN_BUDGET) * 100);
    const willTruncate = usedTokens > HISTORY_TOKEN_BUDGET;

    return {
        usedTokens,
        budgetTokens: HISTORY_TOKEN_BUDGET,
        maxContextTokens: MAX_CONTEXT_TOKENS,
        reservedTokens: RESERVED_TOKENS,
        remainingTokens,
        percentageUsed,
        willTruncate
    };
}

function manageChatHistory(state: ChatState, baseUrl: string, model: string): Array<{role: string, content: string}> {
    let messages = [...state.messages];

    const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

    if (totalTokens <= HISTORY_TOKEN_BUDGET) {
        return messages.map(m => ({ role: m.role, content: m.content }));
    }

    const recentPairsToKeep = 3;
    const recentMessagesToKeep = recentPairsToKeep * 2;

    if (messages.length <= recentMessagesToKeep) {
        return truncateLargestMessages(messages, HISTORY_TOKEN_BUDGET);
    }

    const recentMessages = messages.slice(-recentMessagesToKeep);
    const oldMessages = messages.slice(0, -recentMessagesToKeep);

    const oldConversationText = oldMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');
    const summary = createConversationSummary(oldConversationText);

    state.summary = summary;

    const compressedMessages: Array<{role: string, content: string}> = [];

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

    compressedMessages.push(...recentMessages.map(m => ({ role: m.role, content: m.content })));

    const newTokenCount = compressedMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    if (newTokenCount > HISTORY_TOKEN_BUDGET) {
        return truncateLargestMessages(compressedMessages, HISTORY_TOKEN_BUDGET);
    }

    return compressedMessages;
}

function truncateLargestMessages(messages: Array<{role: string, content: string}>, budget: number): Array<{role: string, content: string}> {
    let result = [...messages];
    let totalTokens = result.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

    while (totalTokens > budget && result.length > 1) {
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
            const truncatedContent = result[maxIdx].content.substring(0, Math.floor(result[maxIdx].content.length * 0.3)) + '\n\n[content truncated for token efficiency]';
            const oldTokens = estimateTokens(result[maxIdx].content);
            const newTokens = estimateTokens(truncatedContent);
            totalTokens = totalTokens - oldTokens + newTokens;
            result[maxIdx].content = truncatedContent;
        } else {
            break;
        }
    }

    return result.map(m => ({ role: m.role, content: m.content }));
}

function createConversationSummary(conversationText: string): string {
    const lines = conversationText.split('\n').filter(l => l.trim());
    const summary: string[] = [];

    const userMessages = conversationText.split('user:').slice(1).map(s => s.split('\n\n')[0]);
    const topics = new Set<string>();

    for (const msg of userMessages) {
        const codeKeywords = msg.match(/\b(function|class|import|export|interface|type|const|let|var|async|await|return|if|else|for|while|try|catch|error|bug|fix|refactor|implement|test|api|component|hook|state|props)\b/gi);
        if (codeKeywords) {
            codeKeywords.forEach(k => topics.add(k.toLowerCase()));
        }

        const fileRefs = msg.match(/`[^`]+\`/g);
        if (fileRefs) {
            fileRefs.forEach(f => topics.add(f));
        }
    }

    if (topics.size > 0) {
        summary.push(`Topics discussed: ${Array.from(topics).slice(0, 15).join(', ')}`);
    }

    const exchangeCount = conversationText.split('user:').length - 1;
    summary.push(`Total previous exchanges: ${exchangeCount}`);

    const assistantParts = conversationText.split('assistant:');
    for (const part of assistantParts.slice(1)) {
        const firstSentence = part.split('.')[0].trim();
        if (firstSentence.length < 200 && firstSentence.length > 20) {
            summary.push(`- ${firstSentence}.`);
        }
    }

    return summary.slice(0, 8).join('\n');
}

async function streamOllamaResponseWithHistory(
    messages: Array<{role: string, content: string}>,
    model: string,
    baseUrl: string,
    onToken: (token: string, inThinking: boolean) => void
): Promise<void> {

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
            onToken("[Error: No response stream available]", false);
            return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let tokenCount = 0;
        let insideThinking = false;
        let accumulatedToken = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const json = JSON.parse(line);
                    const token = json.message?.content;
                    if (token) {
                        tokenCount++;
                        // Accumulate token to detect thinking tag boundaries
                        accumulatedToken += token;

                        // Check for thinking tag openings and closings
                        let inThink = insideThinking;
                        let cleanAccumulated = accumulatedToken;

                        // Detect opening tags: <thinking> or <think>
                        if (!insideThinking) {
                            const openMatch = cleanAccumulated.match(/^(<thinking>|<think>)([\s\S]*)/);
                            if (openMatch) {
                                insideThinking = true;
                                inThink = true;
                                cleanAccumulated = openMatch[2]; // strip the opening tag
                            }
                        }

                        // Detect closing tags: </thinking> or </think>
                        if (insideThinking) {
                            const closeMatch = cleanAccumulated.match(/([\s\S]*)(<\/thinking>|<\/think>)$/);
                            if (closeMatch) {
                                insideThinking = false;
                                inThink = false;
                                cleanAccumulated = closeMatch[1]; // strip the closing tag
                            }
                        }

                        onToken(cleanAccumulated, inThink);
                        accumulatedToken = "";
                    }
                } catch (parseError) {
                    console.warn(`[OllamaCopilot] Failed to parse stream line: ${line}`);
                }
            }
        }

        const totalTime = Date.now() - apiStartTime;
        console.log(
            `[OllamaCopilot] Stream complete - ${tokenCount} tokens in ${totalTime}ms`
        );
    } catch (error) {
        const totalTime = Date.now() - apiStartTime;
        console.error(
            `[OllamaCopilot] Stream error after ${totalTime}ms:`,
            error instanceof Error ? error.message : String(error)
        );
        const errorMsg = error instanceof Error ? error.message : String(error);
        onToken(`[Error: ${errorMsg}]`, false);
    }
}
