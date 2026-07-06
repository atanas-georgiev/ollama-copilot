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
exports.OllamaInlineProvider = void 0;
const vscode = __importStar(require("vscode"));
const streamOllama_1 = require("./streamOllama");
const repoContext_1 = require("./repoContext");
const smartPrompt_1 = require("./smartPrompt");
class OllamaInlineProvider {
    async provideInlineCompletionItems(document, position) {
        const startTime = Date.now();
        console.log("[OllamaCopilot] ===== Autocomplete triggered =====");
        console.log(`[OllamaCopilot] File: ${document.uri.fsPath}`);
        console.log(`[OllamaCopilot] Position: line ${position.line}, char ${position.character}`);
        const config = vscode.workspace.getConfiguration("ollamaCopilot");
        const baseUrl = config.get("baseUrl", "http://192.168.100.123:11434");
        const model = config.get("autocompleteModel", "qwen2.5-coder:1.5b");
        console.log(`[OllamaCopilot] Base URL: ${baseUrl}`);
        console.log(`[OllamaCopilot] Model: ${model}`);
        const contextStart = Date.now();
        const context = await (0, repoContext_1.buildEnhancedContext)(document, position);
        console.log(`[OllamaCopilot] Context built in ${Date.now() - contextStart}ms`);
        console.log(`[OllamaCopilot] Context - language: ${context.language}, prefix length: ${context.prefix.length}, window length: ${context.window.length}, repo files: ${context.fileCount}`);
        const promptStart = Date.now();
        const prompt = (0, smartPrompt_1.buildPrompt)(context);
        console.log(`[OllamaCopilot] Prompt built in ${Date.now() - promptStart}ms`);
        console.log(`[OllamaCopilot] Prompt length: ${prompt.length} chars`);
        let result = "";
        let tokenCount = 0;
        const apiStart = Date.now();
        console.log("[OllamaCopilot] Calling Ollama API...");
        await (0, streamOllama_1.streamOllama)(prompt, (token) => {
            tokenCount++;
            result += token;
        }, model || "qwen2.5-coder:1.5b", baseUrl || "http://192.168.100.123:11434");
        const apiTime = Date.now() - apiStart;
        const totalTime = Date.now() - startTime;
        console.log(`[OllamaCopilot] API response time: ${apiTime}ms`);
        console.log(`[OllamaCopilot] Generated ${tokenCount} tokens, ${result.length} chars`);
        console.log(`[OllamaCopilot] Total autocomplete time: ${totalTime}ms`);
        console.log("[OllamaCopilot] ===== Autocomplete complete =====");
        return [new vscode.InlineCompletionItem(result)];
    }
}
exports.OllamaInlineProvider = OllamaInlineProvider;
//# sourceMappingURL=inlineProvider.js.map