import * as vscode from "vscode";
import { DEFAULT_BASE_URL, DEFAULT_AUTOCOMPLETE_MODEL, DEFAULT_CHAT_MODEL } from "./constants";

export interface ExtensionSettings {
    baseUrl: string;
    autocompleteModel: string;
    chatModel: string;
}

export function getExtensionSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration("ollamaCopilot");
    
    return {
        baseUrl: config.get<string>("baseUrl", DEFAULT_BASE_URL),
        autocompleteModel: config.get<string>("autocompleteModel", DEFAULT_AUTOCOMPLETE_MODEL),
        chatModel: config.get<string>("chatModel", DEFAULT_CHAT_MODEL)
    };
}

export function getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration("ollamaCopilot");
    return config.get<string>("baseUrl", DEFAULT_BASE_URL);
}

export function getAutocompleteModel(): string {
    const config = vscode.workspace.getConfiguration("ollamaCopilot");
    return config.get<string>("autocompleteModel", DEFAULT_AUTOCOMPLETE_MODEL);
}

export function getChatModel(): string {
    const config = vscode.workspace.getConfiguration("ollamaCopilot");
    return config.get<string>("chatModel", DEFAULT_CHAT_MODEL);
}