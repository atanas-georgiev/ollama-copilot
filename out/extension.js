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
const inlineProvider_1 = require("./inlineProvider");
const chatSidebar_1 = require("./chatSidebar");
const settingsPanel_1 = require("./settingsPanel");
const diffEditor_1 = require("./diffEditor");
function activate(context) {
    vscode.window.showInformationMessage("Ollama Copilot activated 🚀");
    // Register inline completion provider for autocomplete
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
}
function deactivate() { }
//# sourceMappingURL=extension.js.map