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
const path = __importStar(require("path"));
const fileLoader_1 = require("./fileLoader");
function activate(context) {
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = 'Flat File Explorer: Initializing…';
    statusBar.show();
    context.subscriptions.push(statusBar);
    const provider = new FlatFileReadonlyEditorProvider(context);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider('flatFileReader.viewer', provider, { supportsMultipleEditorsPerDocument: false }));
    context.subscriptions.push(vscode.commands.registerCommand('flatFileReader.open', async (uri) => {
        let target = uri;
        if (!target) {
            const pick = await vscode.window.showOpenDialog({
                filters: {
                    'Flat files': ['csv', 'tsv', 'parquet', 'pq', 'xlsx', 'xls'],
                    'All files': ['*']
                }
            });
            if (!pick || pick.length === 0) {
                return;
            }
            target = pick[0];
        }
        vscode.commands.executeCommand('vscode.openWith', target, 'flatFileReader.viewer');
    }));
}
class FlatDoc {
    constructor(uri) {
        this.uri = uri;
    }
    dispose() { }
}
class FlatFileReadonlyEditorProvider {
    constructor(context) {
        this.context = context;
    }
    async openCustomDocument(uri, _openContext, _token) {
        return new FlatDoc(uri);
    }
    async resolveCustomEditor(document, webviewPanel) {
        webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'))] };
        webviewPanel.webview.html = this.getHtml(webviewPanel.webview);
        const filePath = document.uri.fsPath;
        const pageSize = 100;
        const postError = (message) => {
            if (!webviewPanel.webview)
                return;
            try {
                webviewPanel.webview.postMessage({ type: 'error', message });
            }
            catch (e) {
                // Webview might be disposed, ignore
            }
        };
        const postMessage = (message) => {
            if (!webviewPanel.webview)
                return;
            try {
                webviewPanel.webview.postMessage(message);
            }
            catch (e) {
                // Webview might be disposed, ignore
            }
        };
        const fetchPage = async (offset, search, sql) => {
            console.log('Fetching page with offset:', offset, 'search:', search, 'sql:', sql);
            try {
                const data = await (0, fileLoader_1.loadFileData)(filePath, offset, pageSize, search, sql);
                console.log('loadFileData returned data with columns:', data.columns.length, 'rows:', data.rows.length);
                postMessage({ type: 'page', data: JSON.parse(JSON.stringify(data, (key, value) => typeof value === 'bigint' ? value.toString() : value)) });
                if (data && data.columns) {
                    postMessage({ type: 'columns', columns: data.columns });
                }
            }
            catch (err) {
                console.log('Error in fetchPage:', err.message);
                postError(err.message || String(err));
            }
        };
        // Initial load will be handled by webview request
        const messageHandler = async (msg) => {
            console.log('Received message:', msg?.type, msg);
            if (msg?.type === 'requestPage') {
                await fetchPage(msg.offset ?? 0, msg.search ?? undefined, msg.sql ?? undefined);
            }
            else if (msg?.type === 'refresh') {
                await fetchPage(0);
            }
            else if (msg?.type === 'export') {
                try {
                    const uri = await vscode.window.showSaveDialog({ filters: { 'CSV': ['csv'] }, defaultUri: vscode.Uri.file(path.join(path.dirname(filePath), path.basename(filePath) + '.csv')) });
                    if (!uri) {
                        return;
                    }
                    await (0, fileLoader_1.exportData)(filePath, uri.fsPath, msg.search, msg.sql);
                    vscode.window.showInformationMessage('Exported CSV to ' + uri.fsPath);
                }
                catch (err) {
                    postError(err.message || String(err));
                }
            }
            else if (msg?.type === 'executeQuery') {
                try {
                    await fetchPage(0, msg.search, msg.sql);
                }
                catch (err) {
                    postError(err.message || String(err));
                }
            }
        };
        webviewPanel.webview.onDidReceiveMessage(messageHandler);
        // Clean up when webview is disposed
        webviewPanel.onDidDispose(() => {
            // Remove message handler to prevent memory leaks
        });
    }
    getHtml(webview) {
        const dist = vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'bundle.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'styles.css'));
        const csp = `default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; font-src ${webview.cspSource}; connect-src ${webview.cspSource};`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<link rel="stylesheet" href="${styleUri}">
	<title>Flat File Explorer</title>
</head>
<body>
	<div id="root"></div>
	<script>
		const vscode = acquireVsCodeApi();
	</script>
	<script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map