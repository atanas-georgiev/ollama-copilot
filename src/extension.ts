import * as vscode from "vscode";
import { OllamaInlineProvider } from "./providers/inlineProvider";
import { ChatSidebarProvider } from "./ui/chatSidebar";
import { SettingsPanelProvider } from "./ui/settingsPanel";
import { registerDiffCommand } from "./commands/diffEditor";

export function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage("Ollama Copilot activated 🚀");

    // Register inline completion provider for autocomplete
    const provider = new OllamaInlineProvider();
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: "**" },
            provider,
        )
    );

    registerDiffCommand(context);

    // Register chat sidebar
    const chatSidebarProvider = new ChatSidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ollamaCopilot.chatSidebar', chatSidebarProvider)
    );

    // Register open settings command
    context.subscriptions.push(
        vscode.commands.registerCommand("ollamaCopilot.openSettings", () => {
            SettingsPanelProvider.render(context.extensionUri);
        })
    );
}

export function deactivate() {}
