import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadFileData, exportData } from './fileLoader';
import * as Papa from 'papaparse';
import * as ExcelJS from 'exceljs';

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

interface FlatFileData {
	columns: string[];
	rows: any[][];
}

function detectFileType(filePath: string): 'csv' | 'tsv' | 'parquet' | 'excel' | 'json' {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === '.csv') return 'csv';
	if (ext === '.tsv') return 'tsv';
	if (ext === '.parquet' || ext === '.pq') return 'parquet';
	if (ext === '.xlsx' || ext === '.xls') return 'excel';
	if (ext === '.json') return 'json';
	return 'csv'; // default
}

export function activate(context: vscode.ExtensionContext) {
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.text = 'Flat File Explorer: Initializing…';
	statusBar.show();
	context.subscriptions.push(statusBar);

	const provider = new FlatFileEditorProvider(context);
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider('flatFileReader.viewer', provider, {
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: {
				retainContextWhenHidden: true,
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('flatFileReader.open', async (uri?: vscode.Uri) => {
			let target = uri;
			if (!target) {
				const pick = await vscode.window.showOpenDialog({
					filters: {
						'Flat files': ['csv', 'tsv', 'parquet', 'pq', 'xlsx', 'xls', 'json'],
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

class FlatFileDocument implements vscode.CustomDocument {
	public readonly uri: vscode.Uri;
	private _data: FlatFileData;
	private _edits: Array<{ columns: string[]; rows: any[][] }> = [];
	private _savedEdits: number = 0;

	constructor(uri: vscode.Uri, initialData: FlatFileData) {
		this.uri = uri;
		this._data = { ...initialData };
	}

	get data(): FlatFileData {
		return { ...this._data };
	}

	makeEdit(columns: string[], rows: any[][]): void {
		this._data = { columns: [...columns], rows: rows.map(row => [...row]) };
		this._edits.push({ columns: [...columns], rows: rows.map(row => [...row]) });
	}

	async save(cancellation: vscode.CancellationToken): Promise<void> {
		await this.saveAs(this.uri, cancellation);
	}

	async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		const type = detectFileType(targetResource.fsPath);

		if (type === 'csv' || type === 'tsv') {
			const delim = type === 'csv' ? ',' : '\t';
			const csv = (Papa as any).unparse(this._data.rows, { fields: this._data.columns, delimiter: delim });
			await vscode.workspace.fs.writeFile(targetResource, Buffer.from(csv));
		} else if (type === 'excel') {
			const workbook = new ExcelJS.Workbook();
			try {
				const worksheet = workbook.addWorksheet('Sheet1');
				worksheet.addRow(this._data.columns);
				this._data.rows.forEach((row: any[]) => worksheet.addRow(row));
				const buffer = await workbook.xlsx.writeBuffer();
				await vscode.workspace.fs.writeFile(targetResource, new Uint8Array(buffer));
			} finally {
				// Clean up workbook memory
				await workbook.xlsx.writeBuffer();
				(workbook as any).removeWorksheet = null;
			}
		} else if (type === 'parquet') {
			throw new Error('Saving Parquet files is not supported.');
		} else if (type === 'json') {
			const jsonData = this._data.rows.map(row => {
				const obj: any = {};
				this._data.columns.forEach((col, index) => {
					obj[col] = row[index];
				});
				return obj;
			});
			await vscode.workspace.fs.writeFile(targetResource, Buffer.from(JSON.stringify(jsonData, null, 2)));
		} else {
			throw new Error('Unsupported file type for saving');
		}

		this._savedEdits = this._edits.length;
	}

	async revert(_cancellation: vscode.CancellationToken): Promise<void> {
		// Load original data from file
		const data = await loadFileData(this.uri.fsPath, 0, Number.MAX_SAFE_INTEGER);
		this._data = { columns: [...data.columns], rows: data.rows.map(row => [...row]) };
		this._edits = [];
		this._savedEdits = 0;
	}

	async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		await this.saveAs(destination, cancellation);
		return {
			id: destination.toString(),
			delete: async (): Promise<void> => {
				try {
					await vscode.workspace.fs.delete(destination);
				} catch {
					// noop
				}
			}
		};
	}

	dispose(): void {
		this._edits.length = 0;
	}
}

class FlatFileEditorProvider implements vscode.CustomEditorProvider<FlatFileDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<FlatFileDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	constructor(private readonly context: vscode.ExtensionContext) {}

	async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<FlatFileDocument> {
		// Load the file data
		const data = await loadFileData(uri.fsPath, 0, Number.MAX_SAFE_INTEGER);
		const flatFileData: FlatFileData = {
			columns: data.columns,
			rows: data.rows
		};

		return new FlatFileDocument(uri, flatFileData);
	}

	async saveCustomDocument(document: FlatFileDocument, cancellation: vscode.CancellationToken): Promise<void> {
		await document.save(cancellation);
	}

	async saveCustomDocumentAs(document: FlatFileDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		await document.saveAs(destination, cancellation);
	}

	async revertCustomDocument(document: FlatFileDocument, cancellation: vscode.CancellationToken): Promise<void> {
		await document.revert(cancellation);
		this._onDidChangeCustomDocument.fire({
			document,
			undo: async () => { /* handled by document */ },
			redo: async () => { /* handled by document */ }
		});
	}

	async backupCustomDocument(document: FlatFileDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		return await document.backup(context.destination, cancellation);
	}

	async resolveCustomEditor(document: FlatFileDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
		webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'))] };
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

		const filePath = document.uri.fsPath;
		const pageSize = 100;
		let isDisposed = false;

		const postError = (message: string) => {
			if (!webviewPanel || isDisposed) return;
			try {
				webviewPanel.webview.postMessage({ type: 'error', message });
			} catch (e) {
				// Webview might be disposed, ignore
			}
		};

		const postMessage = (message: any) => {
			if (!webviewPanel || isDisposed) return;
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
		} else if (msg?.type === 'requestAllData') {
			try {
				const allData = await loadFileData(filePath, 0, Number.MAX_SAFE_INTEGER, msg.search, msg.sql);
				postMessage({ type: 'allData', data: JSON.parse(JSON.stringify(allData, (key, value) => typeof value === 'bigint' ? value.toString() : value)) });
			} catch (err: any) {
				console.log('Error in requestAllData:', err.message);
				postError(err.message || String(err));
			}
		} else if (msg?.type === 'save') {
			try {
				const type = detectFileType(filePath);
				if (type !== 'csv' && type !== 'tsv') {
					throw new Error('Shadow save is only supported for CSV and TSV files.');
				}

				// Generate the content
				const delim = type === 'csv' ? ',' : '\t';
				const csv = (Papa as any).unparse(msg.rows, { fields: msg.columns, delimiter: delim });
				const tempFilePath = filePath + '.tmp';
				await vscode.workspace.fs.writeFile(vscode.Uri.file(tempFilePath), Buffer.from(csv));
				postMessage({ type: 'savePrepared', tempFile: tempFilePath });
			} catch (err: any) {
				postError(err.message || 'Failed to prepare save.');
			}
		} else if (msg?.type === 'finalizeSave') {
			try {
				const tempFilePath = msg.tempFile;
				if (!tempFilePath) {
					postError('No pending save to finalize.');
					return;
				}
				const tempUri = vscode.Uri.file(tempFilePath);

				// Check if temp file exists
				try {
					await vscode.workspace.fs.stat(tempUri);
				} catch {
					postError('Temp file no longer exists.');
					return;
				}

				// Attempt replace
				const isFileLocked = async (): Promise<boolean> => {
					try {
						const fd = await fs.promises.open(filePath, 'r+');
						await fd.close();
						return false;
					} catch (err: any) {
						if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
							return true;
						}
						throw err;
					}
				};

				if (await isFileLocked()) {
					postError('File is still locked. Please close it in the other program and try again.');
					return;
				}

				await vscode.workspace.fs.rename(tempUri, vscode.Uri.file(filePath), { overwrite: true });
				console.log(`[Shadow Save] Manually finalized save for: ${filePath}`);
				document.makeEdit(msg.columns, msg.rows);
				vscode.window.showInformationMessage('File saved successfully.');
				postMessage({ type: 'saveComplete' });
			} catch (err: any) {
				console.error('[Finalize Save] Error:', err);
				postError(err.message || 'Failed to finalize save.');
			}
		} else if (msg?.type === 'generateAI') {
				const { provider, apiKey, model, prompt } = msg;
				if (!apiKey || !prompt) {
					postMessage({ type: 'aiError', message: 'Missing API key or prompt' });
					return;
				}
				try {
					// Optionally store the API key securely

					let aiText = '';

					if (provider === 'openai') {
						const response = await fetch('https://api.openai.com/v1/chat/completions', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'Authorization': `Bearer ${apiKey}`
							},
							body: JSON.stringify({
								model: model,
								messages: [
									{
										role: 'system',
										content: 'You are a SQL expert. First, check if the user\'s request is related to data analysis, querying, or database operations. If the request is NOT related to data (e.g., general questions, coding help, math problems, etc.), respond with exactly: "Hey! Dude please ask question related to data". If the request IS related to data, generate a valid SQL query based on the user\'s description. Always use "data" as the table name in your SQL queries. Return only the SQL query without any explanation or markdown formatting.'
									},
									{
										role: 'user',
										content: prompt
									}
								],
								max_tokens: 500,
								temperature: 0.1
							}),
						});

						if (!response.ok) {
							let errorMsg = 'Failed to connect to OpenAI. Please check your API key and internet connection.';
							if (response.status === 401) {
								errorMsg = 'Invalid OpenAI API key. Please check your key and try again.';
							} else if (response.status === 400) {
								errorMsg = 'Invalid model or request. Please check your model selection.';
							}
							try {
								const errorData = await response.json() as any;
								if (errorData.error && errorData.error.message) {
									if (errorData.error.code === 'invalid_api_key') {
										errorMsg = 'Invalid OpenAI API key. Please check your key and try again.';
									} else if (errorData.error.message.includes('model')) {
										errorMsg = 'Invalid model selected. Please choose a valid OpenAI model.';
									}
								}
							} catch (parseErr) {
								// Use default message
							}
							throw new Error(errorMsg);
						}

						const data = await response.json() as any;
						aiText = data.choices?.[0]?.message?.content?.trim() || 'No response from AI';
					} else if (provider === 'gemini') {
						const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								contents: [{
									parts: [{
										text: `You are a SQL expert. First, check if the user's request is related to data analysis, querying, or database operations. If the request is NOT related to data (e.g., general questions, coding help, math problems, etc.), respond with exactly: "Hey! Dude please ask question related to data". If the request IS related to data, generate a valid SQL query based on the user's description. Always use "data" as the table name in your SQL queries. Return only the SQL query without any explanation or markdown formatting.\n\nUser request: ${prompt}`
									}]
								}],
								generationConfig: {
									temperature: 0.1,
									maxOutputTokens: 500,
								}
							}),
						});

						if (!response.ok) {
							let errorMsg = 'Failed to connect to Gemini. Please check your API key and internet connection.';
							if (response.status === 401 || response.status === 403) {
								errorMsg = 'Invalid Gemini API key. Please check your key and try again.';
							} else if (response.status === 400) {
								errorMsg = 'Invalid model or request. Please check your model selection.';
							}
							try {
								const errorData = await response.json() as any;
								if (errorData.error && errorData.error.message) {
									if (errorData.error.code === 'invalid_key' || errorData.error.message.includes('key')) {
										errorMsg = 'Invalid Gemini API key. Please check your key and try again.';
									} else if (errorData.error.message.includes('model')) {
										errorMsg = 'Invalid model selected. Please choose a valid Gemini model.';
									}
								}
							} catch (parseErr) {
								// Use default message
							}
							throw new Error(errorMsg);
						}

						const data = await response.json() as any;
						aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI';
					} else {
						throw new Error('Unsupported provider. Please select OpenAI or Gemini.');
					}

					// Clean the AI response to extract only the SQL query
					aiText = aiText.trim();

					postMessage({ type: 'aiResponse', response: aiText });
				} catch (err: any) {
					console.error('AI generation error:', err);
					let userFriendlyMsg = err.message || 'Failed to generate AI response. Please check your settings and try again.';
					if (err.message.includes('API key')) {
						userFriendlyMsg = 'Invalid API key. Please check your API key and try again.';
					} else if (err.message.includes('model')) {
						userFriendlyMsg = 'Invalid model selected. Please choose a valid model.';
					} else if (err.message.includes('connect')) {
						userFriendlyMsg = 'Unable to connect to AI service. Please check your internet connection.';
					}
					postMessage({ type: 'aiError', message: userFriendlyMsg });
				}
			} else if (msg?.type === 'openDashboard') {
				// Dashboard is handled in the same webview as a modal, no backend action needed
				console.log('Dashboard request received');
			}
		};

		webviewPanel.webview.onDidReceiveMessage(messageHandler);

		// Clean up when webview is disposed
		webviewPanel.onDidDispose(() => {
			isDisposed = true;
			// Remove message handler to prevent memory leaks
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const dist = vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'bundle.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'styles.css'));
		const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; connect-src ${webview.cspSource};`;
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
	<script src="${scriptUri}"></script>
</body>
</html>`;
	}
}

// Update the withRetry helper function
async function withRetry(operation: () => Promise<void>, maxAttempts = 10, delayMs = 500, onRetry?: (attempt: number, err: any) => void): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await operation();
            return;
        } catch (err: any) {
            if (attempt === maxAttempts || !(err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
                throw err;
            }
            // Call optional logging callback
            if (onRetry) {
                onRetry(attempt, err);
            }
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
        }
    }
}

export function deactivate() {}
