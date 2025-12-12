import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import { DataTable } from './components/Table';
import Dashboard from './components/Dashboard';
import './index.css';

type PageData = {
	columns: string[];
	rows: any[][];
	offset: number;
	limit: number;
	total: number;
};

declare const acquireVsCodeApi: () => { postMessage: (msg: any) => void; getState: () => any; setState: (s: any) => void };
const vscode = acquireVsCodeApi();

const SQL_KEYWORDS = ['select','from','where','and','or','group','by','order','limit','offset','asc','desc','as','join','left','right','inner','outer','on','count','sum','avg','min','max','like','in','between'];

const App: React.FC = () => {
	const [data, setData] = useState<PageData | null>(null);
	const [search, setSearch] = useState<string>('');
	const [loading, setLoading] = useState<boolean>(true);
	const [sqlHistory, setSqlHistory] = useState<string[]>(['select * from data']);
	const [historyIndex, setHistoryIndex] = useState<number>(0);
	const sql = sqlHistory[historyIndex];

	const addToHistory = (newSql: string) => {
		if (newSql !== sqlHistory[historyIndex]) {
			const newHistory = sqlHistory.slice(0, historyIndex + 1);
			newHistory.push(newSql);
			setSqlHistory(newHistory);
			setHistoryIndex(newHistory.length - 1);
		}
	};
	const [error, setError] = useState<string | null>(null);
	const [showErrorPopup, setShowErrorPopup] = useState<boolean>(false);
	const [columns, setColumns] = useState<string[]>([]);
	const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
	const [provider, setProvider] = useState<'openai' | 'gemini'>('gemini');
	const [apiKey, setApiKey] = useState<string>('');
	const [model, setModel] = useState<string>('gemini-2.5-flash');
	const [prompt, setPrompt] = useState<string>('');
	const [aiResponse, setAiResponse] = useState<string>('');
	const [aiLoading, setAiLoading] = useState<boolean>(false);
	const [showGeminiInstructions, setShowGeminiInstructions] = useState<boolean>(false);
	const [showDashboard, setShowDashboard] = useState<boolean>(false);
	const textAreaRef = useRef<HTMLTextAreaElement>(null);

	const loadApiKey = (prov: 'openai' | 'gemini') => {
		const savedKey = localStorage.getItem(`flatFileReader_${prov}_apiKey`);
		if (savedKey) {
			setApiKey(savedKey);
		}
	};

	const saveApiKey = (key: string, prov: 'openai' | 'gemini') => {
		if (key.trim()) {
			localStorage.setItem(`flatFileReader_${prov}_apiKey`, key.trim());
		}
	};

	useEffect(() => {
		loadApiKey(provider);
	}, [provider]);

	useEffect(() => {
		if (apiKey.trim()) {
			saveApiKey(apiKey, provider);
		}
	}, [apiKey, provider]);

	const requestPage = (offset: number, s?: string, q?: string) => {
		setLoading(true);
		setError(null);
		vscode.postMessage({ type: 'requestPage', offset, search: s ?? search, sql: q ?? sql });
	};

		useEffect(() => {
			const handler = (event: MessageEvent) => {
				const msg = event.data;
				console.log('Webview received message:', msg?.type, msg);
				if (msg?.type === 'page') {
					setData(msg.data);
					setLoading(false);
				} else if (msg?.type === 'columns') {
					if (Array.isArray(msg.columns)) setColumns(msg.columns);
				} else if (msg?.type === 'error') {
					setLoading(false);
					setError(msg.message ?? 'Unknown error');
					setShowErrorPopup(true);
					setData(null);
					// Hide error popup after 3 seconds
					setTimeout(() => {
						setShowErrorPopup(false);
						setError(null);
					}, 3000);
				} else if (msg?.type === 'aiResponse') {
					setAiResponse(msg.response);
					setAiLoading(false);
				} else if (msg?.type === 'aiError') {
					setAiResponse('Error: ' + (msg.message ?? 'Unknown error'));
					setAiLoading(false);
				} else if (msg?.type === 'saveComplete' || msg?.type === 'saveError') {
					// Ignore save messages as edit mode is removed
					console.log('Save message received, ignoring');
				}
			};
			window.addEventListener('message', handler);
			// Request initial data with default SQL
			requestPage(0, undefined, sql);
			return () => window.removeEventListener('message', handler);
		}, []);



	// Lightweight SQL highlighter
	const highlightedSql = useMemo(() => {
		const tokens = sql.split(/(\s+|,|\(|\))/g).filter(t => t !== undefined);
		return tokens.map((t, i) => {
			if (/^\s+$/.test(t) || t === ',' || t === '(' || t === ')') return `<span class="tok-other">${t.replace(/</g,'&lt;')}</span>`;
			if (/^'.*'$/.test(t) || /^".*"$/.test(t)) return `<span class="tok-str">${t.replace(/</g,'&lt;')}</span>`;
			if (/^\d+(\.\d+)?$/.test(t)) return `<span class="tok-num">${t}</span>`;
			if (SQL_KEYWORDS.includes(t.toLowerCase())) return `<span class="tok-key">${t}</span>`;
			// column or other
			return `<span class="tok-col">${t.replace(/</g,'&lt;')}</span>`;
		}).join('');
	}, [sql]);

	// Compute caret position to place suggestions near the cursor
	const getCaretOffset = (ta: HTMLTextAreaElement): {left: number, top: number} => {
		const div = document.createElement('div');
		const style = window.getComputedStyle(ta);
		['font-family','font-size','font-weight','font-style','letter-spacing','text-transform','text-indent','white-space','word-wrap','line-height','padding','border','box-sizing'].forEach((prop) => {
			(div.style as any)[prop] = (style as any)[prop];
		});
		div.style.position = 'absolute';
		div.style.visibility = 'hidden';
		div.style.whiteSpace = 'pre-wrap';
		div.style.wordWrap = 'break-word';
		div.style.width = ta.offsetWidth + 'px';
		const text = ta.value.substring(0, ta.selectionStart ?? 0);
		const span = document.createElement('span');
		span.textContent = '\u200b';
		div.textContent = text;
		div.appendChild(span);
		ta.parentElement?.appendChild(div);
		const rect = span.getBoundingClientRect();
		const parentRect = ta.getBoundingClientRect();
		const left = rect.left - parentRect.left - ta.scrollLeft + 8;
		const top = rect.top - parentRect.top - ta.scrollTop + 24;
		div.remove();
		return { left: Math.max(8, left), top: Math.max(8, top) };
	};

	// Suggestions disabled
	const openSuggestionsForWord = () => { return; };

	const applySuggestion = (_item: string) => {
		return;
	};

	const handleGenerate = () => {
		if (!apiKey.trim()) {
			setAiResponse('Please enter your API key.');
			setAiLoading(false);
			return;
		}
		if (!prompt.trim()) {
			setAiResponse('Please enter a prompt describing the SQL query you want.');
			setAiLoading(false);
			return;
		}

		setAiLoading(true);
		setAiResponse('');
		vscode.postMessage({
			type: 'generateAI',
			provider,
			apiKey: apiKey.trim(),
			model,
			prompt: prompt.trim()
		});
	};

	// Simplified handlers without edit mode checks
	const handleExecuteQuery = () => {
		requestPage(0, search, sql);
	};

	const handleReset = () => {
		addToHistory('select * from data');
		requestPage(0, '', 'select * from data');
	};

	return (
		<div className="h-screen w-screen p-4 gap-4 flex flex-col overflow-x-hidden bg-black">
			<div className="mt-4 grid gap-3">
				<div className="flex items-center justify-between">
					<label className="text-sm uppercase tracking-wide text-gray-300 font-medium">SQL (table: data)</label>
					<div className="flex items-center gap-3">
						<input
							className="px-4 py-2 rounded-lg border border-gray-600 bg-black outline-none focus:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 max-w-[280px] w-full shadow-sm text-gray-100"
							placeholder="Search..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={(e) => { if (e.key === 'Enter') requestPage(0); }}
						/>
						<motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 shadow-md font-medium whitespace-nowrap" onClick={() => vscode.postMessage({ type: 'export', search, sql })}>
							Export CSV
						</motion.button>
					</div>
				</div>
				<div className="relative shadow-lg rounded-lg overflow-hidden">
					<div className="sql-layer" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlightedSql }} />
					<textarea
						ref={textAreaRef}
						className="w-full min-h-[80px] rounded-md border border-gray-700 bg-gray-900 p-3 font-mono text-sm text-gray-100 outline-none resize-y transition-all duration-200 relative z-10 shadow-inner focus:bg-gray-800 focus:ring-2 focus:ring-blue-500"
						value={sql}
						onChange={(e) => { addToHistory(e.target.value); openSuggestionsForWord(); }}
						onKeyDown={(e) => {
							if (e.ctrlKey && e.key === 'z') {
								e.preventDefault();
								if (historyIndex > 0) {
									setHistoryIndex(historyIndex - 1);
								}
							} else if (e.ctrlKey && e.key === 'y') {
								e.preventDefault();
								if (historyIndex < sqlHistory.length - 1) {
									setHistoryIndex(historyIndex + 1);
								}
							}
						}}
					/>
				</div>
				<div className="flex flex-wrap gap-3 sm:flex-nowrap mt-2">
					<motion.button
						whileTap={{ scale: 0.95 }}
						whileHover={{ scale: 1.02 }}
						className="px-4 py-2 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700 transition-all duration-200 shadow-md font-medium flex-1 sm:flex-none"
						onClick={handleExecuteQuery}
					>
						Execute Query
					</motion.button>
					<motion.button
						whileTap={{ scale: 0.95 }}
						whileHover={{ scale: 1.02 }}
						className="px-4 py-2 rounded-md bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md font-medium flex-1 sm:flex-none"
						onClick={handleReset}
					>
						Reset
					</motion.button>
					<motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:from-purple-600 hover:to-pink-700 transition-all duration-200 shadow-md font-medium flex-1 sm:flex-none" onClick={() => setShowGenerateModal(true)}>
						Generate SQL with AI
					</motion.button>
					<motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} className="px-4 py-2 rounded-md bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-600 hover:to-red-700 transition-all duration-200 shadow-md font-medium flex-1 sm:flex-none" onClick={() => setShowDashboard(true)}>
						Visualize
					</motion.button>
				</div>
				{/* no top error banner; error is shown in table area now */}
			</div>

			{/* AI Generate Modal */}
			<AnimatePresence>
				{showGenerateModal && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
						onClick={() => setShowGenerateModal(false)}
					>
						<motion.div
							initial={{ scale: 0.95, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.95, opacity: 0 }}
							className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="p-6">
								<div className="flex items-center justify-between mb-6">
									<h2 className="text-lg font-semibold text-white">Generate SQL with AI</h2>
									<motion.button
										whileTap={{ scale: 0.95 }}
										className="text-gray-400 hover:text-white"
										onClick={() => setShowGenerateModal(false)}
									>
										<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
										</svg>
									</motion.button>
								</div>

								{/* Provider Selection */}
								<div className="mb-4">
									<label className="block text-sm font-medium text-gray-300 mb-2">AI Provider</label>
									<select
										value={provider}
										onChange={(e) => {
											setProvider(e.target.value as 'openai' | 'gemini');
											setModel(e.target.value === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini');
										}}
										className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									>
										<option value="gemini">Google Gemini (Free)</option>
										<option value="openai">OpenAI</option>
									</select>
								</div>

								{/* API Key Input */}
								<div className="mb-4">
									<div className="flex items-center justify-between mb-2">
										<label className="block text-sm font-medium text-gray-300">
											{provider === 'openai' ? 'OpenAI API Key' : 'Gemini API Key'}
										</label>
										{provider === 'gemini' && (
											<motion.button
												whileTap={{ scale: 0.95 }}
												whileHover={{ scale: 1.02 }}
												onClick={() => setShowGeminiInstructions(true)}
												className="text-xs text-blue-400 hover:text-blue-300 underline"
											>
												Get free API token
											</motion.button>
										)}
									</div>
									<input
										type="password"
										value={apiKey}
										onChange={(e) => setApiKey(e.target.value)}
										className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
										placeholder={provider === 'openai' ? 'sk-...' : 'AIza...'}
									/>
								</div>

								{/* Model Selection */}
								<div className="mb-4">
									<label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
									<select
										value={model}
										onChange={(e) => setModel(e.target.value)}
										className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									>
										{provider === 'openai' ? (
											<>
												<option value="gpt-4o-mini">GPT-4o-mini</option>
												<option value="gpt-4o">GPT-4o</option>
												<option value="gpt-3.5-turbo">GPT-3.5-turbo</option>
											</>
										) : (
											<>
												<option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
												<option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
												<option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
											</>
										)}
									</select>
								</div>

								{/* Prompt Input */}
								<div className="mb-4">
									<label className="block text-sm font-medium text-gray-300 mb-2">Prompt</label>
									<textarea
										value={prompt}
										onChange={(e) => setPrompt(e.target.value)}
										rows={4}
										className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
										placeholder="Describe the SQL query you want to generate, e.g., 'Select top 10 sales by region for last month'"
									/>
								</div>

								{/* Submit Button */}
								<motion.button
									whileTap={{ scale: 0.95 }}
									whileHover={{ scale: 1.02 }}
									disabled={aiLoading}
									onClick={handleGenerate}
									className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-pink-700 transition-all duration-200"
								>
									{aiLoading ? (
										<div className="flex items-center justify-center gap-2">
											<svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
												<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
												<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
											</svg>
											Generating...
										</div>
									) : (
										'Generate SQL'
									)}
								</motion.button>

								{/* Response Area */}
								{aiResponse && (
									<div className="mt-6 p-4 bg-gray-800 border border-gray-600 rounded-md">
										<label className="block text-sm font-medium text-gray-300 mb-2">Generated SQL</label>
										<pre className="text-sm text-gray-100 overflow-x-auto bg-gray-900 p-3 rounded-md font-mono">
											{aiResponse}
										</pre>
										<motion.button
											whileTap={{ scale: 0.95 }}
											whileHover={{ scale: 1.02 }}
											className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-all duration-200"
											onClick={() => {
												setSql(aiResponse);
												addToHistory(aiResponse);
												setShowGenerateModal(false);
											}}
										>
											Use this SQL
										</motion.button>
									</div>
								)}
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Gemini Instructions Modal */}
			<AnimatePresence>
				{showGeminiInstructions && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
						onClick={() => setShowGeminiInstructions(false)}
					>
						<motion.div
							initial={{ scale: 0.95, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.95, opacity: 0 }}
							className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="p-6">
								<div className="flex items-center justify-between mb-6">
									<h2 className="text-xl font-semibold text-white">Get Free Gemini API Token</h2>
									<motion.button
										whileTap={{ scale: 0.95 }}
										className="text-gray-400 hover:text-white"
										onClick={() => setShowGeminiInstructions(false)}
									>
										<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
										</svg>
									</motion.button>
								</div>

								<div className="space-y-4 text-gray-300">
									<p>Follow these steps to get your free Gemini API token:</p>

									<div className="space-y-3">
										<div className="flex items-start gap-3">
											<span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
											<div>
												<p className="font-medium text-white">Go to Google AI Studio</p>
												<p>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">aistudio.google.com/app/apikey</a></p>
											</div>
										</div>

										<div className="flex items-start gap-3">
											<span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
											<div>
												<p className="font-medium text-white">Sign in with Google</p>
												<p>Use your Google account to sign in to AI Studio</p>
											</div>
										</div>

										<div className="flex items-start gap-3">
											<span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
											<div>
												<p className="font-medium text-white">Create API Key</p>
												<p>Click "Create API key" and follow the prompts</p>
											</div>
										</div>

										<div className="flex items-start gap-3">
											<span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
											<div>
												<p className="font-medium text-white">Copy and Paste</p>
												<p>Copy the generated API key and paste it in the field above</p>
											</div>
										</div>
									</div>

									<div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-md">
										<p className="text-sm text-blue-200">
											<strong>Note:</strong> Gemini API offers generous free tier limits. You get 15 RPM (requests per minute) and 1 million tokens per month for free.
										</p>
									</div>
								</div>

								<div className="flex justify-end mt-6">
									<motion.button
										whileTap={{ scale: 0.95 }}
										whileHover={{ scale: 1.02 }}
										onClick={() => setShowGeminiInstructions(false)}
										className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-all duration-200"
									>
										Close
									</motion.button>
								</div>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Dashboard Modal */}
			<AnimatePresence>
				{showDashboard && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
						onClick={() => setShowDashboard(false)}
					>
						<motion.div
							initial={{ scale: 0.95, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.95, opacity: 0 }}
							className="w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="p-6">
								<div className="flex items-center justify-between mb-6">
									<h2 className="text-lg font-semibold text-white">Data Dashboard</h2>
									<motion.button
										whileTap={{ scale: 0.95 }}
										className="text-gray-400 hover:text-white"
										onClick={() => setShowDashboard(false)}
									>
										<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
										</svg>
									</motion.button>
								</div>
								<Dashboard data={data?.rows || []} columns={data?.columns || []} onClose={() => setShowDashboard(false)} />
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			<div className="flex-1 min-h-0 mt-2 overflow-auto rounded-md border border-gray-800">
				<AnimatePresence mode="wait">
					{loading && (
						<motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full grid place-items-center">
							<div className="flex items-center gap-3 text-gray-500">
								<svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
									<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
								</svg>
								<div>Loading data…</div>
							</div>
						</motion.div>
					)}
					{!loading && data && (
						<motion.div key="table" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="h-full">
							<DataTable
								columns={data.columns}
								rows={data.rows}
								searchTerm={search}
							/>
						</motion.div>
					)}
					{!loading && showErrorPopup && error && (
						<motion.div
							key="error-popup"
							initial={{ opacity: 0, scale: 0.8 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.8 }}
							className="fixed top-4 right-4 z-50"
						>
							<div className="px-4 py-3 rounded-md border border-red-700 bg-red-900/90 text-red-200 shadow-lg">
								<span className="mr-2">⚠️</span> {error}
							</div>
						</motion.div>
					)}
					{!loading && !data && !error && (
						<div className="h-full grid place-items-center text-gray-500">No data</div>
					)}
				</AnimatePresence>
			</div>

			{/* Removed the showing footer as per request */}
		</div>
	);
};

	const container = document.getElementById('root')!;
(() => {
	// Force dark mode by always adding 'dark' class to root element
	document.documentElement.classList.add('dark');
})();
createRoot(container).render(<App />);