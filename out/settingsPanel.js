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
exports.SettingsPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SettingsPanelProvider {
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._config = vscode.workspace.getConfiguration('ollamaCopilot');
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        };
        this._panel.webview.html = this.getHtmlForWebview();
        this._setMessageListener();
    }
    static revive(panel) {
        const ext = vscode.extensions.getExtension("local.ollama-copilot");
        if (ext) {
            SettingsPanelProvider.currentPanel = new SettingsPanelProvider(panel, ext.extensionUri);
        }
    }
    static render(extensionUri) {
        if (SettingsPanelProvider.currentPanel) {
            SettingsPanelProvider.currentPanel._panel.reveal(vscode.ViewColumn.Two);
            return;
        }
        const panel = vscode.window.createWebviewPanel('ollamaSettings', 'Ollama Copilot Settings', vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        SettingsPanelProvider.currentPanel = new SettingsPanelProvider(panel, extensionUri);
    }
    dispose() {
        SettingsPanelProvider.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const item = this._disposables.pop();
            if (item)
                item.dispose();
        }
    }
    getHtmlForWebview() {
        const htmlPath = path.join(__dirname, '..', 'src', 'settings.html');
        return fs.readFileSync(htmlPath, 'utf-8');
    }
    _setMessageListener() {
        const that = this;
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'init':
                    that._panel.webview.postMessage({
                        type: 'init',
                        settings: {
                            baseUrl: that._config.get('baseUrl', 'http://192.168.100.123:11434'),
                            chatModel: that._config.get('chatModel', ''),
                            autocompleteModel: that._config.get('autocompleteModel', '')
                        }
                    });
                    break;
                case 'fetchModels':
                    const baseUrl = that._config.get('baseUrl', 'http://192.168.100.123:11434');
                    await that._fetchModels(baseUrl, message.selectId || 'chatModel');
                    break;
                case 'testConnection':
                    await that._testConnection(message.endpoint || that._config.get('baseUrl', ''));
                    break;
                case 'saveSettings':
                    if (message.settings) {
                        await that._config.update('baseUrl', message.settings.baseUrl, vscode.ConfigurationTarget.Global);
                        await that._config.update('chatModel', message.settings.chatModel, vscode.ConfigurationTarget.Global);
                        await that._config.update('autocompleteModel', message.settings.autocompleteModel, vscode.ConfigurationTarget.Global);
                        that._panel.webview.postMessage({ type: 'settingsSaved' });
                    }
                    break;
                case 'close':
                    that.dispose();
                    break;
            }
        }, undefined, this._disposables);
        this._panel.onDidDispose(() => {
            this.dispose();
        }, null, this._disposables);
        // Initial load - send settings and fetch models
        setTimeout(() => {
            const baseUrl = this._config.get('baseUrl', 'http://192.168.100.123:11434');
            this._panel.webview.postMessage({
                type: 'init',
                settings: {
                    baseUrl: baseUrl,
                    chatModel: this._config.get('chatModel', ''),
                    autocompleteModel: this._config.get('autocompleteModel', '')
                }
            });
            this._fetchModels(baseUrl, 'chatModel');
            this._fetchModels(baseUrl, 'autocompleteModel');
        }, 100);
    }
    async _fetchModels(baseUrl, selectId) {
        try {
            const response = await fetch(`${baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const models = data.models.map((m) => ({
                name: m.name,
                size: m.size,
                digest: m.digest
            }));
            this._panel.webview.postMessage({
                type: 'modelsList',
                models: models,
                selectId: selectId
            });
        }
        catch (error) {
            this._panel.webview.postMessage({
                type: 'modelsError',
                message: error instanceof Error ? error.message : String(error),
                selectId: selectId
            });
        }
    }
    async _testConnection(endpoint) {
        try {
            const response = await fetch(`${endpoint}/api/tags`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            this._panel.webview.postMessage({
                type: 'connectionResult',
                success: true,
                message: 'Connected'
            });
        }
        catch (error) {
            this._panel.webview.postMessage({
                type: 'connectionResult',
                success: false,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
exports.SettingsPanelProvider = SettingsPanelProvider;
//# sourceMappingURL=settingsPanel.js.map