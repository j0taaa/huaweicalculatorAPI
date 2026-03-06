declare module "bun:sqlite" {
  export type SQLQueryBindings = Array<string | number | null>;

  export class Statement<T = unknown, P extends SQLQueryBindings = SQLQueryBindings> {
    get(...params: P): T | null;
    all(...params: P): T[];
    run(...params: P): unknown;
  }

  export class Database {
    constructor(filename?: string, options?: { create?: boolean });
    exec(sql: string): void;
    query<T = unknown, P extends SQLQueryBindings = SQLQueryBindings>(sql: string): Statement<T, P>;
    transaction<TArgs extends unknown[]>(fn: (...args: TArgs) => void): (...args: TArgs) => void;
  }
}
