import { injectable } from '@theia/core/shared/inversify';
import { DbExplorerService, CollectionInfo, QueryOptions, PaginatedResult } from '../common/db-explorer-protocol';
import * as path from 'path';
import * as fs from 'fs';

const nativeRequire = eval('require');
/* Resolve and load a module from the given base path's node_modules */
const loadFrom = (baseDir: string, mod: string): any => {
    const pkgPath = path.join(baseDir, 'node_modules', mod);
    const pkgJson = path.join(pkgPath, 'package.json');
    if (fs.existsSync(pkgJson)) {
        const { main } = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        let entry = path.join(pkgPath, main || 'index.js');
        if (!path.extname(entry)) entry += '.js';
        if (fs.existsSync(entry)) return nativeRequire(entry);
    }
    return nativeRequire(mod);
};

interface DbConfig {
    default: string;
    drivers: Record<string, Record<string, string>>;
}

/* ── TingoDB file-based driver (reads/writes NDJSON files directly) ── */
class TingoFileDb {
    private path: string;
    constructor(dataPath: string) {
        this.path = dataPath;
        fs.mkdirSync(dataPath, { recursive: true });
    }
    collections(): string[] {
        try {
            return fs.readdirSync(this.path)
                .filter(f => f.endsWith('.json') || !f.includes('.'))
                .map(f => f.replace(/\.json$/, ''));
        } catch { return []; }
    }
    private filePath(name: string): string {
        const jsonPath = path.join(this.path, name + '.json');
        if (fs.existsSync(jsonPath)) return jsonPath;
        return path.join(this.path, name);
    }
    private readDocs(name: string): any[] {
        const fp = this.filePath(name);
        if (!fs.existsSync(fp)) return [];
        try {
            const content = fs.readFileSync(fp, 'utf8');
            return content.split('\n')
                .filter(line => line.trim() && !line.includes('"o":"'))
                .slice(1)
                .map(line => { try { return JSON.parse(line); } catch { return null; } })
                .filter(Boolean)
                .map(doc => this.normalize(doc))
                .filter(doc => this.hasData(doc));
        } catch { return []; }
    }
    private hasData(doc: any): boolean {
        const keys = Object.keys(doc);
        return keys.length > 1 || (keys.length === 1 && keys[0] !== '_id');
    }
    private normalize(doc: any): any {
        const out: any = {};
        for (const key of Object.keys(doc)) {
            if (key === '_s' || key === '_dt' || key === '_uid') continue;
            const val = doc[key];
            if (key === '_id') {
                if (typeof val === 'object' && val !== null) {
                    out._id = val.v !== undefined ? String(val.v) : JSON.stringify(val);
                } else {
                    out._id = val;
                }
            } else if (typeof val === 'object' && val !== null && !Array.isArray(val) && val.$wrap) {
                // Tingodb wrapped types (oid, date, etc.)
                out[key] = val.v !== undefined ? String(val.v) : JSON.stringify(val);
            } else {
                out[key] = val;
            }
        }
        return out;
    }
    private writeDocs(name: string, docs: any[]): void {
        const fp = this.filePath(name);
        const meta = { k: '0000000078', o: '0000000126', v: '001' };
        const lines = [JSON.stringify(meta), ...docs.map(d => JSON.stringify(d))];
        // Create backup
        if (fs.existsSync(fp)) {
            fs.copyFileSync(fp, fp + '.bak');
        }
        fs.writeFileSync(fp, lines.join('\n') + '\n');
    }
    private evalClause(doc: any, clause: { field: string; operator: string; value: any }): boolean {
        const val = doc[clause.field];
        const cv = clause.value;
        switch (clause.operator) {
            case 'eq': return val == cv;
            case 'neq': return val != cv;
            case 'gt': return val > cv;
            case 'gte': return val >= cv;
            case 'lt': return val < cv;
            case 'lte': return val <= cv;
            case 'like': return typeof val === 'string' && val.toLowerCase().includes(String(cv).toLowerCase());
            case 'in': return Array.isArray(cv) && cv.includes(val);
            default: return false;
        }
    }
    private applyWhere(docs: any[], where: { field: string; operator: string; value: any; logic?: 'and'|'or' }[]): any[] {
        if (!where || where.length === 0) return [...docs];
        return docs.filter(doc => {
            let result = this.evalClause(doc, where[0]);
            for (let i = 1; i < where.length; i++) {
                const matches = this.evalClause(doc, where[i]);
                result = where[i].logic === 'or' ? (result || matches) : (result && matches);
            }
            return result;
        });
    }
    find(collection: string, where?: any[]): any[] {
        let docs = this.readDocs(collection);
        if (where && where.length > 0) docs = this.applyWhere(docs, where);
        return docs;
    }
    sort(docs: any[], sorts: { field: string; dir: 'asc'|'desc' }[]): any[] {
        return [...docs].sort((a, b) => {
            for (const s of sorts) {
                const av = a[s.field], bv = b[s.field];
                if (av < bv) return s.dir === 'asc' ? -1 : 1;
                if (av > bv) return s.dir === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }
    count(collection: string, where?: any[]): number {
        return this.find(collection, where).length;
    }
    insert(collection: string, data: any): any {
        const docs = this.readDocs(collection);
        const ids = docs.map((d: any) => typeof d._id === 'string' ? Number(d._id) : (d._id || 0));
        const maxId = Math.max(0, ...ids);
        const doc = { _id: maxId + 1, ...data };
        docs.push(doc);
        this.writeDocs(collection, docs);
        return this.normalize(doc);
    }
    update(collection: string, where: any[], data: any): number {
        const docs = this.readDocs(collection);
        let count = 0;
        const updated = docs.map(doc => {
            const matches = where.length === 0 || this.applyWhere([doc], where).length > 0;
            if (matches) { count++; return { ...doc, ...data }; }
            return doc;
        });
        this.writeDocs(collection, updated);
        return count;
    }
    delete(collection: string, where: any[]): number {
        const docs = this.readDocs(collection);
        const kept = docs.filter(doc => this.applyWhere([doc], where).length === 0);
        const deleted = docs.length - kept.length;
        this.writeDocs(collection, kept);
        return deleted;
    }
    close(): void {}
}

@injectable()
export class DbExplorerServiceImpl implements DbExplorerService {

    private driver: any = null;
    private driverName = '';
    private connected = false;
    private db: any = null;
    private projectRoot = '';

    async connect(projectRoot: string): Promise<void> {
        if (this.connected) await this.disconnect();
        this.projectRoot = projectRoot;

        const config = this.readConfig(projectRoot);
        if (!config) throw new Error('Could not read zumito.config.ts');
        if (!config.drivers[config.default]) throw new Error(`No config found for driver: ${config.default}`);

        const driverConfig = config.drivers[config.default];
        this.driverName = config.default;

        // Resolve relative paths
        const resolvedConfig: Record<string, any> = {};
        for (const [key, val] of Object.entries(driverConfig)) {
            resolvedConfig[key] = (key === 'path' || key === 'filename') && !path.isAbsolute(val)
                ? path.resolve(projectRoot, val)
                : val;
        }

        try {
            await this.connectDirect(config.default, resolvedConfig);
            this.connected = true;
        } catch (e: any) {
            throw new Error(`Failed to connect to ${config.default}: ${e.message}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            try { this.db.close(); } catch { /* */ }
        }
        this.db = null;
        this.driver = null;
        this.connected = false;
        this.driverName = '';
    }

    async getStatus(): Promise<{ connected: boolean; driver: string; collectionCount: number }> {
        if (!this.connected) return { connected: false, driver: '', collectionCount: 0 };
        const cols = await this.listAllCollections();
        return { connected: true, driver: this.driverName, collectionCount: cols.length };
    }

    async getCollections(): Promise<CollectionInfo[]> {
        if (!this.connected) return [];
        const names = await this.listAllCollections();
        const result: CollectionInfo[] = [];
        for (const col of names) {
            const docs = await this.getCollectionDocs(col, 1, 0);
            const sample = docs.length > 0 ? docs[0] : {};
            result.push({
                name: col,
                fields: inferFields(sample),
                documentCount: await this.countDocs(col),
            });
        }
        return result;
    }

    async queryDocuments(opts: QueryOptions): Promise<PaginatedResult> {
        if (!this.connected) return { documents: [], total: 0, limit: opts.limit || 50, offset: opts.offset || 0 };
        const limit = opts.limit || 50;
        const offset = opts.offset || 0;
        const where = opts.where || [];
        const sort = opts.sort || [];
        const documents = await this.getCollectionDocs(opts.collection, limit, offset, where, sort);
        const total = await this.countDocs(opts.collection, where);
        return { documents, total, limit, offset };
    }

    async getDocument(collection: string, id: any): Promise<Record<string, any> | null> {
        if (!this.connected) return null;
        const docs = await this.findDocs(collection, [{ field: '_id', operator: 'eq', value: id }]);
        return docs.length > 0 ? docs[0] : null;
    }

    async insertDocument(collection: string, data: Record<string, any>): Promise<Record<string, any>> {
        if (!this.connected) throw new Error('Not connected');
        return this.insertDoc(collection, data);
    }

    async updateDocument(collection: string, where: Record<string, any>, data: Record<string, any>): Promise<number> {
        if (!this.connected) return 0;
        const clauses = Object.entries(where).map(([field, value]) => ({ field, operator: 'eq' as const, value }));
        return this.updateDocs(collection, clauses, data);
    }

    async deleteDocument(collection: string, where: Record<string, any>): Promise<number> {
        if (!this.connected) return 0;
        const clauses = Object.entries(where).map(([field, value]) => ({ field, operator: 'eq' as const, value }));
        return this.deleteDocs(collection, clauses);
    }

    /* ── Private: connect to native driver ── */
    private async connectDirect(name: string, config: Record<string, any>): Promise<void> {
        switch (name) {
            case 'tingo':
            case 'tingodb': {
                this.db = new TingoFileDb(config.path);
                return;
            }
            case 'sqlite': {
                const BetterSqlite3 = loadFrom(this.projectRoot, 'better-sqlite3');
                this.driver = new BetterSqlite3(config.filename || ':memory:');
                this.driver.pragma('journal_mode = WAL');
                this.db = this.driver;
                return;
            }
            case 'mongo': {
                const mongoMod = loadFrom(this.projectRoot, 'mongodb');
                const client = new mongoMod.MongoClient(config.uri);
                await client.connect();
                const dbName = config.database || this.extractDbName(config.uri);
                this.driver = client;
                this.db = client.db(dbName);
                return;
            }
            default:
                throw new Error(`Unsupported driver: ${name}`);
        }
    }

    private extractDbName(uri: string): string {
        const match = uri.match(/\/([^/?]+)(\?|$)/);
        return match ? match[1] : 'zumito';
    }

    /* ── Private: collection / document operations ── */
    private async listAllCollections(): Promise<string[]> {
        if (this.db instanceof TingoFileDb) {
            return this.db.collections();
        }
        if (this.driverName === 'sqlite') {
            const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_zumito_%'").all();
            return rows.map((r: any) => r.name);
        }
        if (this.driverName === 'mongo') {
            const cols = await this.db.listCollections().toArray();
            return cols.map((c: any) => c.name);
        }
        return [];
    }


    private async getCollectionDocs(
        collection: string, limit: number, offset: number,
        where: { field: string; operator: string; value: any }[] = [],
        sort: { field: string; dir: 'asc' | 'desc' }[] = [],
    ): Promise<Record<string, any>[]> {
        if (this.driverName === 'sqlite') return this.sqliteDocs(collection, limit, offset, where, sort);
        if (this.db instanceof TingoFileDb) {
            let docs = this.db.find(collection, where);
            if (sort.length > 0) docs = this.db.sort(docs, sort);
            if (offset > 0) docs = docs.slice(offset);
            if (limit > 0) docs = docs.slice(0, limit);
            return docs;
        }
        // Mongo: existing logic
        const allDocs = await this.findDocs(collection, where);
        let results = allDocs;
        if (sort.length > 0) {
            results.sort((a, b) => {
                for (const s of sort) {
                    const av = a[s.field], bv = b[s.field];
                    if (av < bv) return s.dir === 'asc' ? -1 : 1;
                    if (av > bv) return s.dir === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        if (offset > 0) results = results.slice(offset);
        if (limit > 0) results = results.slice(0, limit);
        return results;
    }

    private sqliteDocs(
        collection: string, limit: number, offset: number,
        where: { field: string; operator: string; value: any }[] = [],
        sort: { field: string; dir: string }[] = [],
    ): Record<string, any>[] {
        const params: any[] = [];
        let sql = `SELECT * FROM "${collection}"`;
        const { sql: whereSql, params: whereParams } = this.buildSqlWhere(where, params.length);
        if (whereSql) sql += ' WHERE ' + whereSql;
        params.push(...whereParams);
        if (sort.length > 0) {
            sql += ' ORDER BY ' + sort.map(s => `"${s.field}" ${s.dir.toUpperCase()}`).join(', ');
        }
        if (limit > 0) { sql += ` LIMIT ${limit}`; }
        if (offset > 0) { sql += ` OFFSET ${offset}`; }
        return this.db.prepare(sql).all(...params);
    }

    private buildSqlWhere(where: any[], paramOffset: number): { sql: string; params: any[] } {
        if (!where || where.length === 0) return { sql: '', params: [] };
        const params: any[] = [];
        const clauses = where.map((w, i) => {
            const op = this.sqlOperator(w.operator);
            params.push(w.value);
            return `"${w.field}" ${op} $${paramOffset + i + 1}`;
        });
        return { sql: clauses.join(' AND '), params };
    }

    private sqlOperator(op: string): string {
        switch (op) {
            case 'eq': return '=';
            case 'neq': return '!=';
            case 'gt': return '>';
            case 'gte': return '>=';
            case 'lt': return '<';
            case 'lte': return '<=';
            case 'like': return 'LIKE';
            default: return '=';
        }
    }

    private async findDocs(
        collection: string,
        where: { field: string; operator: string; value: any }[] = [],
    ): Promise<Record<string, any>[]> {
        if (this.db instanceof TingoFileDb) return this.db.find(collection, where);
        if (this.driverName === 'sqlite') return this.sqliteDocs(collection, 10000, 0, where, []);
        if (this.driverName === 'mongo') return this.mongoFind(collection, where);
        return [];
    }

    private buildTingoFilter(where: any[]): Record<string, any> {
        if (!where || where.length === 0) return {};
        const filter: Record<string, any> = {};
        for (const w of where) {
            if (w.operator === 'eq') {
                filter[w.field] = w.value;
            } else if (w.operator === 'like') {
                filter[w.field] = { $regex: String(w.value) };
            } else {
                filter[w.field] = { ['$' + w.operator]: w.value };
            }
        }
        return filter;
    }

    private async mongoFind(collection: string, where: any[]): Promise<Record<string, any>[]> {
        const filter = this.buildTingoFilter(where);
        return this.db.collection(collection).find(filter).toArray();
    }

    private async countDocs(
        collection: string,
        where: { field: string; operator: string; value: any }[] = [],
    ): Promise<number> {
        if (this.db instanceof TingoFileDb) return this.db.count(collection, where);
        if (this.driverName === 'sqlite') {
            const params: any[] = [];
            let sql = `SELECT COUNT(*) as count FROM "${collection}"`;
            const { sql: whereSql, params: whereParams } = this.buildSqlWhere(where, params.length);
            if (whereSql) { sql += ' WHERE ' + whereSql; params.push(...whereParams); }
            const row = this.db.prepare(sql).get(...params);
            return row?.count || 0;
        }
        if (this.driverName === 'mongo') {
            const filter = this.buildTingoFilter(where);
            return this.db.collection(collection).countDocuments(filter);
        }
        const docs = await this.findDocs(collection, where);
        return docs.length;
    }

    private async insertDoc(collection: string, data: Record<string, any>): Promise<Record<string, any>> {
        if (this.db instanceof TingoFileDb) return this.db.insert(collection, data);
        if (this.driverName === 'sqlite') {
            const keys = Object.keys(data);
            const vals = keys.map(k => data[k]);
            const placeholders = vals.map(() => '?').join(', ');
            const sql = `INSERT INTO "${collection}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`;
            const result = this.db.prepare(sql).run(...vals);
            return { id: result.lastInsertRowid, ...data };
        }
        if (this.driverName === 'mongo') {
            const result = await this.db.collection(collection).insertOne(data);
            return { _id: result.insertedId, ...data };
        }
        throw new Error('Unsupported driver for insert');
    }

    private async updateDocs(
        collection: string,
        where: { field: string; operator: string; value: any }[],
        data: Record<string, any>,
    ): Promise<number> {
        if (this.db instanceof TingoFileDb) return this.db.update(collection, where, data);
        if (this.driverName === 'sqlite') {
            const sets = Object.keys(data).map(k => `"${k}" = ?`);
            const vals = Object.keys(data).map(k => data[k]);
            const { sql, params } = this.buildSqlWhere(where, vals.length);
            const sqlStr = `UPDATE "${collection}" SET ${sets.join(', ')}${sql ? ' WHERE ' + sql : ''}`;
            const result = this.db.prepare(sqlStr).run(...vals, ...params);
            return result.changes;
        }
        if (this.driverName === 'mongo') {
            const filter = this.buildTingoFilter(where);
            const result = await this.db.collection(collection).updateMany(filter, { $set: data });
            return result.modifiedCount;
        }
        throw new Error('Unsupported driver for update');
    }

    private async deleteDocs(
        collection: string,
        where: { field: string; operator: string; value: any }[],
    ): Promise<number> {
        if (this.db instanceof TingoFileDb) return this.db.delete(collection, where);
        if (this.driverName === 'sqlite') {
            const { sql, params } = this.buildSqlWhere(where, 0);
            const sqlStr = `DELETE FROM "${collection}"${sql ? ' WHERE ' + sql : ''}`;
            const result = this.db.prepare(sqlStr).run(...params);
            return result.changes;
        }
        if (this.driverName === 'mongo') {
            const filter = this.buildTingoFilter(where);
            const result = await this.db.collection(collection).deleteMany(filter);
            return result.deletedCount;
        }
        throw new Error('Unsupported driver for delete');
    }

    /* ── Private: config reader ── */
    private readConfig(projectRoot: string): DbConfig | null {
        const configPath = path.join(projectRoot, 'zumito.config.ts');
        if (!fs.existsSync(configPath)) return null;

        try {
            const content = fs.readFileSync(configPath, 'utf8');

            // Try compiled JS first
            const jsPath = path.join(projectRoot, 'zumito.config.js');
            if (fs.existsSync(jsPath)) {
                const mod = nativeRequire(jsPath);
                const cfg = mod.config || mod.default;
                if (cfg?.database) return cfg.database;
            }

            // Extract database block with brace matching
            const dbIdx = content.indexOf('database');
            if (dbIdx === -1) return null;

            const blockStart = content.indexOf('{', content.indexOf(':', dbIdx));
            if (blockStart === -1) return null;

            const block = this.extractBraces(content, blockStart);
            if (!block) return null;

            // Extract default driver
            const defMatch = block.match(/default\s*:\s*['"]([^'"]+)['"]/);
            if (!defMatch) return null;
            const driverName = defMatch[1];

            // Extract drivers block
            const driversIdx = block.indexOf('drivers');
            if (driversIdx === -1) return null;
            const driversStart = block.indexOf('{', driversIdx);
            if (driversStart === -1) return null;
            const driversBlock = this.extractBraces(block, driversStart);
            if (!driversBlock) return null;

            // Extract each driver config
            const drivers: Record<string, Record<string, string>> = {};
            const driverRx = /(\w+)\s*:\s*\{/g;
            let dm: RegExpExecArray | null;
            while ((dm = driverRx.exec(driversBlock)) !== null) {
                const dName = dm[1];
                const dBraceStart = dm.index + dm[0].length - 1;
                const dBlock = this.extractBraces(driversBlock, dBraceStart);
                if (!dBlock) continue;
                const cfg: Record<string, string> = {};
                const kvRx = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
                let kv: RegExpExecArray | null;
                while ((kv = kvRx.exec(dBlock)) !== null) {
                    cfg[kv[1]] = kv[2];
                }
                if (Object.keys(cfg).length > 0) drivers[dName] = cfg;
            }

            if (!drivers[driverName]) return null;
            return { default: driverName, drivers };
        } catch { return null; }
    }

    /** Extract balanced braces content starting from open brace position */
    private extractBraces(text: string, openIdx: number): string | null {
        let depth = 0;
        for (let i = openIdx; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') {
                depth--;
                if (depth === 0) return text.substring(openIdx + 1, i);
            }
        }
        return null;
    }
}

function inferFields(doc: Record<string, any>): any[] {
    if (!doc) return [];
    const fields: any[] = [];
    for (const [key, val] of Object.entries(doc)) {
        if (key === '_s' || key === '_dt' || key === '_uid') continue;
        let type = 'any';
        const t = typeof val;
        if (val === null || val === undefined) type = 'any';
        else if (t === 'string') type = 'string';
        else if (t === 'number') type = 'number';
        else if (t === 'boolean') type = 'boolean';
        else if (val instanceof Date) type = 'date';
        else if (Array.isArray(val)) type = 'array';
        else type = 'object';
        fields.push({ name: key, propertyKey: key, type, primary: key === '_id' || key === 'id', unique: false, nullable: true, default: undefined });
    }
    return fields;
}
