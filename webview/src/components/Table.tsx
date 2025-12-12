import React, { useEffect, useMemo, useRef, useState } from 'react';

type TableProps = {
	columns: string[];
	rows: any[][];
	searchTerm?: string;
	pageSize?: number;
};

export const DataTable: React.FC<TableProps> = ({ columns, rows, searchTerm, pageSize = 100 }) => {
	const [widths, setWidths] = useState<number[]>(() => columns.map(() => 200));
	const [currentPage, setCurrentPage] = useState<number>(1);
	const resizingCol = useRef<number | null>(null);
	const startX = useRef<number>(0);
	const startWidth = useRef<number>(0);

	useEffect(() => {
		setWidths(columns.map((_, i) => widths[i] ?? 200));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [columns.join('|')]);

	useEffect(() => {
		setCurrentPage(1); // Reset to first page when data changes
	}, [rows]);

	const onMouseDown = (e: React.MouseEvent, index: number) => {
		resizingCol.current = index;
		startX.current = e.clientX;
		startWidth.current = widths[index];
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		e.preventDefault();
	};

	let animationFrameId: number | null = null;

	const onMouseMove = (e: MouseEvent) => {
		if (resizingCol.current === null) return;
		const deltaX = e.clientX - startX.current;

		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
		}

		animationFrameId = requestAnimationFrame(() => {
			setWidths((prevWidths) => {
				const newWidths = [...prevWidths];
				newWidths[resizingCol.current!] = Math.max(50, startWidth.current + deltaX);
				return newWidths;
			});
		});
	};

	const onMouseUp = () => {
		resizingCol.current = null;
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
	};

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

	// Pagination calculations
	const totalPages = Math.ceil(rows.length / pageSize);
	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = startIndex + pageSize;
	const currentRows = rows.slice(startIndex, endIndex);

	const goToPage = (page: number) => {
		setCurrentPage(Math.max(1, Math.min(page, totalPages)));
	};

	const goToPrevious = () => {
		setCurrentPage(prev => Math.max(1, prev - 1));
	};

	const goToNext = () => {
		setCurrentPage(prev => Math.min(totalPages, prev + 1));
	};



	return (
		<div className="relative">
			<div className="table-container rounded-lg border border-gray-700 bg-black p-2 shadow-lg shadow-black/50 overflow-x-auto overflow-y-auto" style={{ maxHeight: '70vh' }}>
				<table className="table w-full text-sm text-left text-gray-300 border-collapse border border-gray-700 shadow-inner" style={{ tableLayout: 'fixed' }}>
					<thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
						<tr className="bg-gray-200 shadow-md shadow-black/60">
							{columns.map((c, i) => (
								<th
									key={i}
									className="relative px-4 py-2 border border-gray-600 bg-gray-200 text-shadow-md select-none"
									style={{
										width: widths[i],
										position: 'sticky',
										top: 0,
										zIndex: 10,
										overflow: 'hidden',
										whiteSpace: 'nowrap',
										textOverflow: 'ellipsis'
									}}
								>
									<span className="text-black">{c}</span>
									<div
										onMouseDown={(e) => onMouseDown(e, i)}
										className="absolute top-0 right-0 h-full w-1 cursor-col-resize select-none"
										style={{ userSelect: 'none' }}
									/>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{currentRows.map((r, ri) => (
							<tr key={ri} className="bg-black hover:bg-gray-900 shadow-md shadow-black/40 rounded-md">
								{columns.map((_, ci) => (
									<td
										key={ci}
										className="px-4 py-2 border border-gray-600 shadow-sm shadow-black/30"
										style={{ width: widths[ci], maxWidth: widths[ci], whiteSpace: 'normal', overflowWrap: 'break-word' }}
										title={r?.[ci] != null ? String(r[ci]) : ''}
									>
										{highlight(r?.[ci])}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Pagination Controls */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between mt-4 px-2 bg-black" style={{ position: 'sticky', bottom: 0, zIndex: 5 }}>
					<div className="text-sm text-gray-400">
						Showing {startIndex + 1}-{Math.min(endIndex, rows.length)} of {rows.length} records
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={goToPrevious}
							disabled={currentPage === 1}
							className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-300 rounded-md transition-colors"
						>
							Previous
						</button>

						<div className="flex items-center gap-1">
							{Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
								let pageNum;
								if (totalPages <= 5) {
									pageNum = i + 1;
								} else if (currentPage <= 3) {
									pageNum = i + 1;
								} else if (currentPage >= totalPages - 2) {
									pageNum = totalPages - 4 + i;
								} else {
									pageNum = currentPage - 2 + i;
								}

								return (
									<button
										key={pageNum}
										onClick={() => goToPage(pageNum)}
										className={`px-3 py-1 text-sm rounded-md transition-colors ${
											currentPage === pageNum
												? 'bg-blue-600 text-white'
												: 'bg-gray-700 hover:bg-gray-600 text-gray-300'
										}`}
									>
										{pageNum}
									</button>
								);
							})}
						</div>

						<button
							onClick={goToNext}
							disabled={currentPage === totalPages}
							className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-300 rounded-md transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</div>
	);
};
