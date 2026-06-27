export const DB_EXPLORER_PATH = '/services/db-explorer';
export const DbExplorerService = Symbol('DbExplorerService');

export interface CollectionInfo {
    name: string;
    fields: FieldInfo[];
    documentCount: number;
}

export interface FieldInfo {
    name: string;
    propertyKey: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'any';
    primary: boolean;
    unique: boolean;
    nullable: boolean;
    default?: any;
}

export interface QueryOptions {
    collection: string;
    where?: { field: string; operator: string; value: any; logic: 'and' | 'or' }[];
    sort?: { field: string; dir: 'asc' | 'desc' }[];
    limit?: number;
    offset?: number;
}

export interface PaginatedResult {
    documents: Record<string, any>[];
    total: number;
    limit: number;
    offset: number;
}

export interface DbExplorerService {
    connect(projectRoot: string): Promise<void>;
    disconnect(): Promise<void>;
    getStatus(): Promise<{ connected: boolean; driver: string; collectionCount: number }>;
    getCollections(): Promise<CollectionInfo[]>;
    queryDocuments(opts: QueryOptions): Promise<PaginatedResult>;
    getDocument(collection: string, id: any): Promise<Record<string, any> | null>;
    insertDocument(collection: string, data: Record<string, any>): Promise<Record<string, any>>;
    updateDocument(collection: string, where: Record<string, any>, data: Record<string, any>): Promise<number>;
    deleteDocument(collection: string, where: Record<string, any>): Promise<number>;
}
