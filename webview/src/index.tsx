import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import { DataTable } from './components/Table';
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
	const [sql, setSql] = useState<string>('select * from data');
	const [error, setError] = useState<string | null>(null);
	const [showErrorPopup, setShowErrorPopup] = useState<boolean>(false);
	const [columns, setColumns] = useState<string[]>([]);
	const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
	const pageSize = 100;

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
			}
		};
		window.addEventListener('message', handler);
		// Request initial data with default SQL
		requestPage(0, undefined, sql);
		return () => window.removeEventListener('message', handler);
	}, []);

	const canPrev = (data?.offset ?? 0) > 0;
	const canNext = (data ? data.offset + data.limit < data.total : false);

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

	return (
		<div className="h-screen w-screen p-4 gap-4 flex flex-col overflow-x-hidden bg-black">
			{/* Removed the top toolbar as per request */}

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
						<motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 shadow-md font-medium" onClick={() => vscode.postMessage({ type: 'export', search, sql })}>
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
						onChange={(e) => { setSql(e.target.value); openSuggestionsForWord(); }}
						onKeyDown={(e) => {
							// no suggestions; allow Enter to run on Ctrl+Enter if needed later
						}}
					/>
				</div>
				<div className="flex flex-wrap gap-3 sm:flex-nowrap mt-2">
					<motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} className="px-4 py-2 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700 transition-all duration-200 shadow-md font-medium flex-1 sm:flex-none" onClick={() => requestPage(0, search, sql)}>
						Execute Query
					</motion.button>
					<motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} className="px-4 py-2 rounded-md bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md font-medium flex-1 sm:flex-none" onClick={() => { setSql('select * from data'); requestPage(0, '', 'select * from data'); }}>
						Reset
					</motion.button>
				</div>
				{/* no top error banner; error is shown in table area now */}
			</div>

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
							<DataTable columns={data.columns} rows={data.rows} searchTerm={search} />
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