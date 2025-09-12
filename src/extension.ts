
import * as vscode from 'vscode';
import * as path from 'path';
import { loadFileData, exportData } from './fileLoader';

interface PageRequest {
	filePath: string;
	offset: number;
	limit: number;
	search?: string;
	sql?: string;
}

interface ExportRequest extends PageRequest {
	outPath?: string;
}

export function activate(context: vscode.ExtensionContext) {
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.text = 'Flat File Explorer: Initializing…';
	statusBar.show();
	context.subscriptions.push(statusBar);

	const provider = new FlatFileReadonlyEditorProvider(context);
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider('flatFileReader.viewer', provider, { supportsMultipleEditorsPerDocument: false })
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('flatFileReader.open', async (uri?: vscode.Uri) => {
			let target = uri;
			if (!target) {
				const pick = await vscode.window.showOpenDialog({
					filters: {
						'Flat files': ['csv', 'tsv', 'parquet', 'pq', 'xlsx', 'xls'],
						'All files': ['*']
					}
				});
				if (!pick || pick.length === 0) { return; }
				target = pick[0];
			}
			vscode.commands.executeCommand('vscode.openWith', target, 'flatFileReader.viewer');
		})
	);
}

class FlatDoc implements vscode.CustomDocument {
	constructor(public readonly uri: vscode.Uri) {}
	dispose(): void { /* no-op */ }
}

class FlatFileReadonlyEditorProvider implements vscode.CustomReadonlyEditorProvider<FlatDoc> {
	constructor(private readonly context: vscode.ExtensionContext) {}

	async openCustomDocument(uri: vscode.Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): Promise<FlatDoc> {
		return new FlatDoc(uri);
	}

	async resolveCustomEditor(document: FlatDoc, webviewPanel: vscode.WebviewPanel): Promise<void> {
		webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'))] };
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

		const filePath = document.uri.fsPath;
		const pageSize = 100;

		const postError = (message: string) => {
			if (!webviewPanel.webview) return;
			try {
				webviewPanel.webview.postMessage({ type: 'error', message });
			} catch (e) {
				// Webview might be disposed, ignore
			}
		};

		const postMessage = (message: any) => {
			if (!webviewPanel.webview) return;
			try {
				webviewPanel.webview.postMessage(message);
			} catch (e) {
				// Webview might be disposed, ignore
			}
		};

		const fetchPage = async (offset: number, search?: string, sql?: string) => {
			console.log('Fetching page with offset:', offset, 'search:', search, 'sql:', sql);
			try {
				const data = await loadFileData(filePath, offset, pageSize, search, sql);
				console.log('loadFileData returned data with columns:', data.columns.length, 'rows:', data.rows.length);
				postMessage({ type: 'page', data: JSON.parse(JSON.stringify(data, (key, value) => typeof value === 'bigint' ? value.toString() : value)) });
				if (data && data.columns) {
					postMessage({ type: 'columns', columns: data.columns });
				}
			} catch (err: any) {
				console.log('Error in fetchPage:', err.message);
				postError(err.message || String(err));
			}
		};

		// Initial load will be handled by webview request

		const messageHandler = async (msg: any) => {
			console.log('Received message:', msg?.type, msg);
			if (msg?.type === 'requestPage') {
				await fetchPage(msg.offset ?? 0, msg.search ?? undefined, msg.sql ?? undefined);
			} else if (msg?.type === 'refresh') {
				await fetchPage(0);
			} else if (msg?.type === 'export') {
				try {
					const uri = await vscode.window.showSaveDialog({ filters: { 'CSV': ['csv'] }, defaultUri: vscode.Uri.file(path.join(path.dirname(filePath), path.basename(filePath) + '.csv')) });
					if (!uri) { return; }
					await exportData(filePath, uri.fsPath, msg.search, msg.sql);
					vscode.window.showInformationMessage('Exported CSV to ' + uri.fsPath);
				} catch (err: any) {
					postError(err.message || String(err));
				}
			} else if (msg?.type === 'executeQuery') {
				try {
					await fetchPage(0, msg.search, msg.sql);
				} catch (err: any) {
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

	private getHtml(webview: vscode.Webview): string {
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

export function deactivate() {}
