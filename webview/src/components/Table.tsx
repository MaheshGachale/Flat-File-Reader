import React, { useEffect, useMemo, useRef, useState } from 'react';

type TableProps = {
	columns: string[];
	rows: any[][];
	searchTerm?: string;
};

export const DataTable: React.FC<TableProps> = ({ columns, rows, searchTerm }) => {
	const [widths, setWidths] = useState<number[]>(() => columns.map(() => 200));

	useEffect(() => {
		setWidths(columns.map((_, i) => widths[i] ?? 200));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [columns.join('|')]);

	const highlight = (text: any): JSX.Element => {
		const s = (searchTerm ?? '').trim();
		const str = text != null ? String(text) : '';
		if (!s) return <>{str}</>;
		try {
			const idx = str.toLowerCase().indexOf(s.toLowerCase());
			if (idx === -1) return <>{str}</>;
			const before = str.slice(0, idx);
			const match = str.slice(idx, idx + s.length);
			const after = str.slice(idx + s.length);
			return <><span>{before}</span><mark className="bg-yellow-300 text-black px-0.5 rounded-sm">{match}</mark><span>{after}</span></>;
		} catch {
			return <>{str}</>;
		}
	};

	return (
		<div className="table-container relative rounded-lg border border-gray-700 bg-black p-2 overflow-x-auto overflow-y-auto shadow-lg shadow-black/50">
			<table className="table w-full text-sm text-left text-gray-300 border-collapse border border-gray-700 shadow-inner">
				<thead>
					<tr className="bg-black shadow-md shadow-black/60">
						{columns.map((c, i) => (
							<th key={i} className="px-4 py-2 border border-gray-600 text-shadow-md">
								<span className="select-none">{c}</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r, ri) => (
						<tr key={ri} className="bg-black hover:bg-gray-900 shadow-md shadow-black/40 rounded-md">
							{columns.map((_, ci) => (
								<td key={ci} className="px-4 py-2 truncate max-w-xs border border-gray-600 shadow-sm shadow-black/30" title={r?.[ci] != null ? String(r[ci]) : ''}>
									{highlight(r?.[ci])}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};
