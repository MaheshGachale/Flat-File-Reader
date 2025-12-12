declare module 'duckdb' {
  export class Database {
    constructor(path: string);
    connect(): Connection;
  }

  export class Connection {
    run(sql: string, callback?: (err: Error | null) => void): void;
    all(sql: string, callback: (err: Error | null, rows: any[]) => void): void;
  }
}

declare module 'papaparse' {
  export function unparse(data: { fields: string[], data: any[][] }): string;
}
