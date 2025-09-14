import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import * as ExcelJS from 'exceljs';
import * as Papa from 'papaparse';

interface PageData {
	columns: string[];
	rows: any[][];
	offset: number;
	limit: number;
	total: number;
}

interface ExportRequest {
	filePath: string;
	outPath: string;
	search?: string;
	sql?: string;
}

function detectFileType(filePath: string): 'csv' | 'tsv' | 'parquet' | 'excel' {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === '.csv') return 'csv';
	if (ext === '.tsv') return 'tsv';
	if (ext === '.parquet' || ext === '.pq') return 'parquet';
	if (ext === '.xlsx' || ext === '.xls') return 'excel';
	return 'csv'; // default
}

function sanitizeColumnName(name: string): string {
	return name.replace(/\s+/g, '_');
}

async function loadWithDuckDB(filePath: string, offset: number, limit: number, search?: string, sql?: string): Promise<PageData> {
	return new Promise((resolve, reject) => {
		const db = new duckdb.Database(':memory:');
		const con = db.connect();
		const absPath = path.resolve(filePath).replace(/\\/g, '/').replace(/'/g, "''");

		let registerQuery = '';
		const ext = path.extname(filePath).toLowerCase();
		if (ext === '.csv') {
			registerQuery = `CREATE TABLE data AS SELECT * FROM read_csv('${absPath}', delim = ',')`;
		} else if (ext === '.tsv') {
			registerQuery = `CREATE TABLE data AS SELECT * FROM read_csv('${absPath}', delim = '\t')`;
		} else if (ext === '.parquet' || ext === '.pq') {
			registerQuery = `CREATE TABLE data AS SELECT * FROM parquet_scan('${absPath}')`;
		} else {
			registerQuery = `CREATE TABLE data AS SELECT * FROM read_csv_auto('${absPath}')`;
		}

		console.log('DuckDB registerQuery:', registerQuery);
		console.log('Query parameters - offset:', offset, 'limit:', limit);
		con.run(registerQuery, (err: Error | null) => {
			if (err) {
				console.error('DuckDB registerQuery error:', err);
				return reject(err);
			}

			// After table creation, check row count to verify data loaded
			con.all(`SELECT COUNT(*) as count FROM data`, (err: Error | null, countRows: any[]) => {
				if (err) {
					console.error('DuckDB count after table creation error:', err);
				} else {
					console.log('DuckDB row count after table creation:', countRows[0].count);
				}
			});

			let query: string;
			let hasSearch = false;
			if (sql && sql.trim()) {
				query = sql.replace(/\s+/g, ' ').trim();
				console.log('Using custom SQL query:', query);
			} else {
				if (search && search.trim()) {
					hasSearch = true;
					const needle = search.trim().replace(/'/g, "''");
					con.all(`DESCRIBE data`, (err: Error | null, colRows: any[]) => {
						if (err) {
							console.error('DuckDB column fetch error:', err);
							return reject(err);
						}
						const rawColumns = colRows.map((row: any) => row.column_name);
						const columns = rawColumns.map(sanitizeColumnName);
						const conditions = columns.map((col: string) => `${col} LIKE '%${needle}%'`).join(' OR ');
						query = `SELECT * FROM data WHERE ${conditions} LIMIT ${limit} OFFSET ${offset}`;
						console.log('Constructed query with search:', query);
						executeQuery();
					});
				} else {
					query = `SELECT * FROM data LIMIT ${limit} OFFSET ${offset}`;
					console.log('Constructed query without search:', query);
				}
			}

			if (!hasSearch) {
				executeQuery();
			}

			function executeQuery() {
				const countQuery = `SELECT COUNT(*) as total FROM data`;
				con.all(countQuery, (err: Error | null, countRows: any[]) => {
					if (err) {
						console.error('DuckDB count error:', err);
						return reject(err);
					}
					const total = typeof countRows[0].total === 'bigint' ? Number(countRows[0].total) : countRows[0].total;

					const columnQuery = `DESCRIBE data`;
					con.all(columnQuery, (err: Error | null, colRows: any[]) => {
						if (err) {
							console.error('DuckDB column query error:', err);
							return reject(err);
						}
						const rawColumns = colRows.map((row: any) => row.column_name);
						const columns = rawColumns.map(sanitizeColumnName);

						con.all(query, (err: Error | null, rows: any[]) => {
							if (err) {
								console.error('DuckDB data query error:', err);
								return reject(err);
							}
							console.log('DuckDB rows:', rows);

							// Get columns from query result instead of original table
							let queryColumns: string[];
							if (rows.length > 0) {
								queryColumns = Object.keys(rows[0]).map(sanitizeColumnName);
							} else {
								// If no rows, try to get columns from a LIMIT 0 query
								con.all(`${query} LIMIT 0`, (err: Error | null, emptyRows: any[]) => {
									if (err) {
										console.error('DuckDB column query error:', err);
										return reject(err);
									}
									if (emptyRows.length > 0) {
										queryColumns = Object.keys(emptyRows[0]).map(sanitizeColumnName);
									} else {
										queryColumns = [];
									}
									returnData(queryColumns, rows);
								});
								return;
							}

							function returnData(cols: string[], dataRows: any[]) {
								const processedRows = dataRows.map((row: any) => cols.map((col: string) => {
									const value = row[col];
									return typeof value === 'bigint' ? value.toString() : value;
								}));
								resolve({
									columns: cols,
									rows: processedRows,
									offset,
									limit,
									total
								});
							}

							returnData(queryColumns, rows);
						});
					});
				});
			}
		});
	});
}

async function loadWithExcelJS(filePath: string, offset: number, limit: number, search?: string, sql?: string): Promise<PageData> {
	return new Promise(async (resolve, reject) => {
		try {
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.readFile(filePath);
			const worksheet = workbook.worksheets[0];
			const rows: any[][] = [];
			worksheet.eachRow((row) => {
				// Skip first element in row.values because exceljs rows are 1-based indexed
				rows.push((row.values as any[]).slice(1));
			});

			if (rows.length === 0) {
				resolve({ columns: [], rows: [], offset, limit, total: 0 });
				return;
			}

			const rawColumns = rows[0];
			const columns = rawColumns.map(sanitizeColumnName);
			const dataRows = rows.slice(1);

			// Now use DuckDB
			const db = new duckdb.Database(':memory:');
			const con = db.connect();

			// Create table
			const createTableQuery = `CREATE TABLE data (${columns.map(col => `"${col}" VARCHAR`).join(', ')})`;
			con.run(createTableQuery, (err: Error | null) => {
				if (err) {
					console.error('DuckDB create table error:', err);
					return reject(err);
				}

				// Insert data
				if (dataRows.length > 0) {
					const insertQuery = `INSERT INTO data VALUES ${dataRows.map(row => `(${row.map(val => `'${String(val || '').replace(/'/g, "''")}'`).join(', ')})`).join(', ')}`;
					con.run(insertQuery, (err: Error | null) => {
						if (err) {
							console.error('DuckDB insert error:', err);
							return reject(err);
						}
						runQuery();
					});
				} else {
					runQuery();
				}

				function runQuery() {
					let query: string;
					if (sql && sql.trim()) {
						query = sql.replace(/\s+/g, ' ').trim();
						console.log('Using custom SQL query:', query);
					} else {
						if (search && search.trim()) {
							const needle = search.trim().replace(/'/g, "''");
							const conditions = columns.map((col: string) => `"${col}" LIKE '%${needle}%'`).join(' OR ');
							query = `SELECT * FROM data WHERE ${conditions} LIMIT ${limit} OFFSET ${offset}`;
							console.log('Constructed query with search:', query);
						} else {
							query = `SELECT * FROM data LIMIT ${limit} OFFSET ${offset}`;
							console.log('Constructed query without search:', query);
						}
					}

					const countQuery = `SELECT COUNT(*) as total FROM data`;
					con.all(countQuery, (err: Error | null, countRows: any[]) => {
						if (err) {
							console.error('DuckDB count error:', err);
							return reject(err);
						}
						const total = typeof countRows[0].total === 'bigint' ? Number(countRows[0].total) : countRows[0].total;

						con.all(query, (err: Error | null, rows: any[]) => {
							if (err) {
								console.error('DuckDB data query error:', err);
								return reject(new Error('Hey! Dude please enter correct SQL..'));
							}
							console.log('DuckDB rows:', rows);

							// Get columns from query result instead of original table
							let queryColumns: string[];
							if (rows.length > 0) {
								queryColumns = Object.keys(rows[0]).map(sanitizeColumnName);
							} else {
								// If no rows, try to get columns from a LIMIT 0 query
								con.all(`${query} LIMIT 0`, (err: Error | null, emptyRows: any[]) => {
									if (err) {
										console.error('DuckDB column query error:', err);
										return reject(err);
									}
									if (emptyRows.length > 0) {
										queryColumns = Object.keys(emptyRows[0]).map(sanitizeColumnName);
									} else {
										queryColumns = [];
									}
									returnData(queryColumns, rows);
								});
								return;
							}

							function returnData(cols: string[], dataRows: any[]) {
								const processedRows = dataRows.map((row: any) => cols.map((col: string) => {
									const value = row[col];
									return typeof value === 'bigint' ? value.toString() : value;
								}));
								resolve({
									columns: cols,
									rows: processedRows,
									offset,
									limit,
									total
								});
							}

							returnData(queryColumns, rows);
						});
					});
				}
			});
		} catch (e) {
			reject(e);
		}
	});
}

export async function loadFileData(filePath: string, offset: number, limit: number, search?: string, sql?: string): Promise<PageData> {
	const type = detectFileType(filePath);
	if (type === 'excel') {
		return loadWithExcelJS(filePath, offset, limit, search, sql);
	} else {
		return loadWithDuckDB(filePath, offset, limit, search, sql);
	}
}

export async function exportData(filePath: string, outPath: string, search?: string, sql?: string): Promise<void> {
	const data = await loadFileData(filePath, 0, Number.MAX_SAFE_INTEGER, search, sql);
	const csv = Papa.unparse({
		fields: data.columns,
		data: data.rows
	});
	fs.writeFileSync(outPath, csv);
}
