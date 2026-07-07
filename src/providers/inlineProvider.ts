import * as vscode from "vscode";
import { streamOllama } from "../core/services/completion/streamOllama";
import { buildEnhancedContext } from "../services/context/repoContext";
import { buildPrompt } from "../core/services/completion/smartPrompt";

export class OllamaInlineProvider
    implements vscode.InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.InlineCompletionItem[]> {
        const startTime = Date.now();
        console.log("[OllamaCopilot] ===== Autocomplete triggered =====");
        console.log(`[OllamaCopilot] File: ${document.uri.fsPath}`);
        console.log(`[OllamaCopilot] Position: line ${position.line}, char ${position.character}`);

        const config = vscode.workspace.getConfiguration("ollamaCopilot");
        const baseUrl = config.get<string>("baseUrl", "http://192.168.100.123:11434");
        const model = config.get<string>("autocompleteModel", "qwen2.5-coder:1.5b");

        console.log(`[OllamaCopilot] Base URL: ${baseUrl}`);
        console.log(`[OllamaCopilot] Model: ${model}`);

        const contextStart = Date.now();
        const context = await buildEnhancedContext(document, position);
        console.log(`[OllamaCopilot] Context built in ${Date.now() - contextStart}ms`);
        console.log(
            `[OllamaCopilot] Context - language: ${context.language}, prefix length: ${context.prefix.length}, window length: ${context.window.length}, repo files: ${context.fileCount}`
        );

        const promptStart = Date.now();
        const prompt = buildPrompt(context);
        console.log(`[OllamaCopilot] Prompt built in ${Date.now() - promptStart}ms`);
        console.log(`[OllamaCopilot] Prompt length: ${prompt.length} chars`);

        let result = "";
        let tokenCount = 0;
        const apiStart = Date.now();

        console.log("[OllamaCopilot] Calling Ollama API...");

        await streamOllama(
            prompt,
            (token: string) => {
                tokenCount++;
                result += token;
            },
            model || "qwen2.5-coder:1.5b",
            baseUrl || "http://192.168.100.123:11434"
        );

        const apiTime = Date.now() - apiStart;
        const totalTime = Date.now() - startTime;

        console.log(`[OllamaCopilot] API response time: ${apiTime}ms`);
        console.log(`[OllamaCopilot] Generated ${tokenCount} tokens, ${result.length} chars`);
        console.log(`[OllamaCopilot] Total autocomplete time: ${totalTime}ms`);
        console.log("[OllamaCopilot] ===== Autocomplete complete =====");

        return [new vscode.InlineCompletionItem(result)];
    }
}
