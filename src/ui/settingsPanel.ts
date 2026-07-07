import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export class SettingsPanelProvider {
    public static currentPanel: SettingsPanelProvider | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _config: vscode.WorkspaceConfiguration;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._config = vscode.workspace.getConfiguration('ollamaCopilot');
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        };
        this._panel.webview.html = this.getHtmlForWebview();
        this._setMessageListener();
    }

    public static revive(panel: vscode.WebviewPanel) {
        const ext = vscode.extensions.getExtension("local.ollama-copilot");
        if (ext) {
            SettingsPanelProvider.currentPanel = new SettingsPanelProvider(panel, ext.extensionUri);
        }
    }

    public static render(extensionUri: vscode.Uri) {
        if (SettingsPanelProvider.currentPanel) {
            SettingsPanelProvider.currentPanel._panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ollamaSettings',
            'Ollama Copilot Settings',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SettingsPanelProvider.currentPanel = new SettingsPanelProvider(panel, extensionUri);
    }

    public dispose() {
        SettingsPanelProvider.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const item = this._disposables.pop();
            if (item) item.dispose();
        }
    }

    private getHtmlForWebview(): string {
        const htmlPath = path.join(__dirname, '..', 'src', 'settings.html');
        return fs.readFileSync(htmlPath, 'utf-8');
    }

    private _setMessageListener() {
        const that = this;

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'init':
                        that._panel.webview.postMessage({
                            type: 'init',
                            settings: {
                                baseUrl: that._config.get<string>('baseUrl', 'http://192.168.100.123:11434'),
                                chatModel: that._config.get<string>('chatModel', ''),
                                autocompleteModel: that._config.get<string>('autocompleteModel', '')
                            }
                        });
                        break;

                    case 'fetchModels':
                        const baseUrl = that._config.get<string>('baseUrl', 'http://192.168.100.123:11434');
                        await that._fetchModels(baseUrl, message.selectId || 'chatModel');
                        break;

                    case 'testConnection':
                        await that._testConnection(message.endpoint || that._config.get<string>('baseUrl', ''));
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
            },
            undefined,
            this._disposables
        );

        this._panel.onDidDispose(() => {
            this.dispose();
        }, null, this._disposables);

        // Initial load - send settings and fetch models
        setTimeout(() => {
            const baseUrl = this._config.get<string>('baseUrl', 'http://192.168.100.123:11434');
            this._panel.webview.postMessage({
                type: 'init',
                settings: {
                    baseUrl: baseUrl,
                    chatModel: this._config.get<string>('chatModel', ''),
                    autocompleteModel: this._config.get<string>('autocompleteModel', '')
                }
            });
            this._fetchModels(baseUrl, 'chatModel');
            this._fetchModels(baseUrl, 'autocompleteModel');
        }, 100);
    }

    private async _fetchModels(baseUrl: string, selectId: string) {
        try {
            const response = await fetch(`${baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const models = data.models.map((m: any) => ({
                name: m.name,
                size: m.size,
                digest: m.digest
            }));
            this._panel.webview.postMessage({
                type: 'modelsList',
                models: models,
                selectId: selectId
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'modelsError',
                message: error instanceof Error ? error.message : String(error),
                selectId: selectId
            });
        }
    }

    private async _testConnection(endpoint: string) {
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
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'connectionResult',
                success: false,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
