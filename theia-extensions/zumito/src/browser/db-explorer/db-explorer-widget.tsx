import { injectable, inject } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

import {
    DbExplorerService,
    CollectionInfo,
} from '../../common/db-explorer-protocol';

import * as React from 'react';
import * as ReactDOM from '@theia/core/shared/react-dom';

export const DB_EXPLORER_WIDGET_ID = 'db-explorer-widget';

interface DbExplorerState {
    connected: boolean;
    driver: string;
    connecting: boolean;
    collections: CollectionInfo[];
    selectedCollection: string;
    documents: Record<string, any>[];
    total: number;
    offset: number;
    limit: number;
    filters: FilterRow[];
    sorts: SortRow[];
    editingDoc: Record<string, any> | null;
    isNew: boolean;
    searchTerm: string;
}

interface FilterRow {
    id: number;
    field: string;
    operator: string;
    value: string;
    logic: 'and' | 'or';
}

interface SortRow {
    id: number;
    field: string;
    dir: 'asc' | 'desc';
}

const OPERATORS_BY_TYPE: Record<string, string[]> = {
    string: ['eq', 'neq', 'like', 'in'],
    number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
    boolean: ['eq'],
    date: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
    object: ['eq'],
    array: ['eq'],
    any: ['eq', 'neq'],
};

const OP_LABELS: Record<string, string> = {
    eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'contains', 'in': 'in', between: 'between',
};

const PAGE_SIZES = [10, 25, 50, 100];

let _filterIdCounter = 0;
let _sortIdCounter = 0;

@injectable()
export class DbExplorerWidget extends ReactWidget {

    @inject(WorkspaceService) protected readonly workspaceService!: WorkspaceService;
    @inject(DbExplorerService) protected readonly service!: DbExplorerService;

    protected state: DbExplorerState = {
        connected: false, driver: '', connecting: false,
        collections: [], selectedCollection: '', documents: [], total: 0, offset: 0, limit: 50,
        filters: [], sorts: [], editingDoc: null, isNew: false, searchTerm: '',
    };

    static readonly ID = DB_EXPLORER_WIDGET_ID;

    get id(): string { return DB_EXPLORER_WIDGET_ID; }

    get label(): string { return 'DB Explorer'; }
    get caption(): string { return 'Database Explorer'; }
    get closable(): boolean { return true; }

    protected onAfterAttach(msg: any): void {
        super.onAfterAttach(msg);
        this.title.label = this.label;
        this.title.caption = this.caption;
        this.title.closable = this.closable;
        this.title.iconClass = 'codicon codicon-database';
        this.node.tabIndex = 0;
        this.update();
    }

    protected render(): React.ReactNode {
        const s = this.state;

        return (
            <div className='db-explorer-widget'>
                {this.renderToolbar(s)}
                {s.connected ? this.renderBody(s) : this.renderDisconnected(s)}
                {s.editingDoc && ReactDOM.createPortal(this.renderModal(s), document.body)}
            </div>
        );
    }

    /* ── Toolbar ── */
    protected renderToolbar(s: DbExplorerState): React.ReactNode {
        const root = this.workspaceService.tryGetRoots()[0]?.resource.path.fsPath();
        return (
            <div className='db-explorer-toolbar'>
                <button onClick={() => this.connect()} disabled={s.connecting || !root}>
                    {s.connecting ? 'Connecting...' : s.connected ? 'Reconnect' : 'Connect'}
                </button>
                {s.connected && (
                    <button onClick={() => this.disconnect()}>Disconnect</button>
                )}
                <span className='db-explorer-status'>
                    {s.connected
                        ? <span className='connected'>&#9679; {s.driver}</span>
                        : <span className='disconnected'>&#9679; Disconnected</span>}
                </span>
            </div>
        );
    }

    protected renderDisconnected(s: DbExplorerState): React.ReactNode {
        const root = this.workspaceService.tryGetRoots()[0]?.resource.path.fsPath();
        return (
            <div className='db-explorer-empty'>
                {root
                    ? 'Click Connect to explore the database'
                    : 'Open a workspace to connect'}
            </div>
        );
    }

    /* ── Body ── */
    protected renderBody(s: DbExplorerState): React.ReactNode {
        return (
            <div className='db-explorer-body'>
                {this.renderSidebar(s)}
                <div className='db-explorer-content'>
                    {this.renderFilters(s)}
                    {this.renderTable(s)}
                    {this.renderPagination(s)}
                </div>
            </div>
        );
    }

    protected renderSidebar(s: DbExplorerState): React.ReactNode {
        const filtered = s.collections.filter(c =>
            c.name.toLowerCase().includes(s.searchTerm.toLowerCase())
        );
        return (
            <div className='db-explorer-sidebar'>
                <div className='db-explorer-sidebar-search'>
                    <input
                        placeholder='Search...'
                        value={s.searchTerm}
                        onChange={e => this.setState({ searchTerm: e.target.value })}
                    />
                </div>
                <div className='db-explorer-collection-list'>
                    {filtered.map(c => (
                        <div
                            key={c.name}
                            className={`db-explorer-collection-item${s.selectedCollection === c.name ? ' active' : ''}`}
                            onClick={() => this.selectCollection(c.name)}
                        >
                            <span className='codicon codicon-table' />
                            {c.name}
                            <span className='count'>{c.documentCount}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    protected renderFilters(s: DbExplorerState): React.ReactNode {
        const collection = s.collections.find(c => c.name === s.selectedCollection);
        const fields = collection?.fields || [];
        return (
            <div className='db-explorer-filters'>
                {s.filters.map((f, i) => {
                    const field = fields.find(ff => ff.name === f.field);
                    const ops = field ? (OPERATORS_BY_TYPE[field.type] || ['eq', 'neq']) : ['eq', 'neq'];
                    return (
                        <div key={f.id} className='db-explorer-filter-row'>
                            {i > 0 && (
                                <span className='db-explorer-filter-logic' onClick={() => this.toggleFilterLogic(f.id)}>
                                    {f.logic.toUpperCase()}
                                </span>
                            )}
                            {i === 0 && <span style={{ width: 32 }} />}
                            <select value={f.field} onChange={e => this.updateFilter(f.id, 'field', e.target.value)}>
                                <option value=''>-- field --</option>
                                {fields.map(ff => (
                                    <option key={ff.name} value={ff.name}>{ff.name}</option>
                                ))}
                            </select>
                            <select value={f.operator} onChange={e => this.updateFilter(f.id, 'operator', e.target.value)}>
                                {ops.map(op => (
                                    <option key={op} value={op}>{OP_LABELS[op] || op}</option>
                                ))}
                            </select>
                            <input
                                type={field?.type === 'number' ? 'number' : 'text'}
                                value={f.value}
                                onChange={e => this.updateFilter(f.id, 'value', e.target.value)}
                                placeholder='value'
                            />
                            <button className='remove-btn' onClick={() => this.removeFilter(f.id)}>&times;</button>
                        </div>
                    );
                })}
                {s.sorts.map((sr, i) => (
                    <div key={sr.id} className='db-explorer-sort-row'>
                        <span className='db-explorer-sort-label'>sort:</span>
                        <select value={sr.field} onChange={e => this.updateSort(sr.id, 'field', e.target.value)}>
                            <option value=''>-- field --</option>
                            {fields.map(ff => (
                                <option key={ff.name} value={ff.name}>{ff.name}</option>
                            ))}
                        </select>
                        <select value={sr.dir} onChange={e => this.updateSort(sr.id, 'dir', e.target.value as 'asc' | 'desc')}>
                            <option value='asc'>ASC</option>
                            <option value='desc'>DESC</option>
                        </select>
                        <button className='remove-btn' onClick={() => this.removeSort(sr.id)}>&times;</button>
                    </div>
                ))}
                <div className='db-explorer-filter-actions'>
                    <button onClick={() => this.addFilter()}>+ Filter</button>
                    <button onClick={() => this.addSort()}>+ Sort</button>
                    <button onClick={() => this.applyQuery()}>Apply</button>
                    <button onClick={() => this.resetQuery()}>Reset</button>
                    <button onClick={() => this.openNewDocument()}>+ New Doc</button>
                </div>
            </div>
        );
    }

    protected renderTable(s: DbExplorerState): React.ReactNode {
        const collection = s.collections.find(c => c.name === s.selectedCollection);
        const fields = collection?.fields || [];
        const sampleKeys = s.documents.length > 0
            ? Object.keys(s.documents[0]).filter(k => k !== '_id' && !k.startsWith('_'))
            : [];

        const columns = fields.length > 0 ? fields.map(f => f.name) : sampleKeys;
        if (s.documents.length > 0 && !columns.includes('_id')) {
            columns.unshift('_id');
        }

        if (s.documents.length === 0 && s.selectedCollection) {
            return (
                <div className='db-explorer-table-wrap'>
                    <div className='db-explorer-empty'>No documents</div>
                </div>
            );
        }
        if (!s.selectedCollection) {
            return (
                <div className='db-explorer-table-wrap'>
                    <div className='db-explorer-empty'>Select a collection</div>
                </div>
            );
        }

        return (
            <div className='db-explorer-table-wrap'>
                <table className='db-explorer-table'>
                    <thead>
                        <tr>
                            {columns.map(c => (
                                <th key={c}>{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {s.documents.map((doc, idx) => (
                            <tr key={idx} onClick={() => this.openEditDocument(doc)}>
                                {columns.map(c => this.renderCell(doc[c], fields.find(f => f.name === c)?.type || 'any'))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    protected renderCell(value: any, type: string): React.ReactNode {
        if (value === null || value === undefined) {
            return <td key={Math.random()}><span className='null-value'>null</span></td>;
        }
        if (type === 'boolean') {
            return <td key={Math.random()}><span className={value ? 'bool-true' : 'bool-false'}>{String(value)}</span></td>;
        }
        if (type === 'object' || type === 'array') {
            return <td key={Math.random()}><span className='type-number'>{JSON.stringify(value).slice(0, 40)}</span></td>;
        }
        if (type === 'number') {
            return <td key={Math.random()}><span className='type-number'>{String(value)}</span></td>;
        }
        return <td key={Math.random()}><span className='type-string'>{String(value)}</span></td>;
    }

    protected renderPagination(s: DbExplorerState): React.ReactNode {
        const totalPages = Math.ceil(s.total / s.limit);
        const currentPage = Math.floor(s.offset / s.limit) + 1;

        return (
            <div className='db-explorer-pagination'>
                <span>{s.total} document{s.total !== 1 ? 's' : ''} total</span>
                <div className='db-explorer-pagination-buttons'>
                    <button disabled={s.offset === 0} onClick={() => this.goToPage(1)}>First</button>
                    <button disabled={s.offset === 0} onClick={() => this.goToPage(currentPage - 1)}>Prev</button>
                    <span>{currentPage} / {totalPages || 1}</span>
                    <button disabled={s.offset + s.limit >= s.total} onClick={() => this.goToPage(currentPage + 1)}>Next</button>
                    <button disabled={s.offset + s.limit >= s.total} onClick={() => this.goToPage(totalPages)}>Last</button>
                </div>
                <div className='db-explorer-page-size'>
                    Page size:
                    <select value={s.limit} onChange={e => this.setPageSize(Number(e.target.value))}>
                        {PAGE_SIZES.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                    </select>
                </div>
            </div>
        );
    }

    /* ── Modal ── */
    protected renderModal(s: DbExplorerState): React.ReactNode {
        const collection = s.collections.find(c => c.name === s.selectedCollection);
        const fields = collection?.fields || [];
        const doc = s.editingDoc || {};
        const allKeys = Object.keys(doc).filter(k => k !== '_s' && k !== '_dt' && k !== '_uid');
        const displayFields = fields.length > 0 ? fields : allKeys.map(k => ({ name: k, propertyKey: k, type: 'any' as const, primary: false, unique: false, nullable: true, default: undefined }));

        return (
            <div className='db-explorer-modal-overlay' onClick={e => { if ((e.target as HTMLElement).className === 'db-explorer-modal-overlay') this.closeModal(); }}>
                <div className='db-explorer-modal'>
                    <div className='db-explorer-modal-header'>
                        <span>{s.isNew ? 'New Document' : 'Edit Document'} / {s.selectedCollection}</span>
                        <button onClick={() => this.closeModal()}>&times;</button>
                    </div>
                    <div className='db-explorer-modal-body'>
                        {displayFields.map(f => (
                            <div key={f.name} className='db-explorer-modal-field'>
                                <label>
                                    {f.name}
                                    <span className='type-tag' style={{ fontSize: 9, opacity: 0.5 }}>({f.type})</span>
                                    {f.primary && <span className='pk-badge'>PK</span>}
                                </label>
                                {this.renderFieldInput(f, doc)}
                            </div>
                        ))}
                    </div>
                    <div className='db-explorer-modal-actions'>
                        {!s.isNew && (
                            <button className='delete-btn' onClick={() => this.deleteDocument(s.editingDoc!)}>Delete</button>
                        )}
                        <button className='cancel-btn' onClick={() => this.closeModal()}>Cancel</button>
                        <button className='save-btn' onClick={() => this.saveDocument()}>Save</button>
                    </div>
                </div>
            </div>
        );
    }

    protected renderFieldInput(field: any, doc: Record<string, any>): React.ReactNode {
        const val = doc[field.name];
        const strVal = val === null || val === undefined ? '' : String(val);

        switch (field.type) {
            case 'boolean':
                return (
                    <div className='bool-field'>
                        <label><input type='radio' name={field.name} checked={val === true} onChange={() => this.updateEditingDoc(field.name, true)} />true</label>
                        <label><input type='radio' name={field.name} checked={val === false} onChange={() => this.updateEditingDoc(field.name, false)} />false</label>
                        <label><input type='radio' name={field.name} checked={val === null} onChange={() => this.updateEditingDoc(field.name, null)} />null</label>
                    </div>
                );
            case 'number':
                return (
                    <input
                        type='number'
                        value={val === null || val === undefined ? '' : val}
                        onChange={e => this.updateEditingDoc(field.name, e.target.value === '' ? null : Number(e.target.value))}
                        disabled={field.primary}
                    />
                );
            case 'object':
            case 'array':
                return (
                    <textarea
                        value={typeof val === 'object' ? JSON.stringify(val, null, 2) : strVal}
                        onChange={e => {
                            try {
                                this.updateEditingDoc(field.name, JSON.parse(e.target.value));
                            } catch {
                                this.updateEditingDoc(field.name, e.target.value);
                            }
                        }}
                    />
                );
            default:
                return (
                    <input
                        type='text'
                        value={strVal}
                        onChange={e => this.updateEditingDoc(field.name, e.target.value || null)}
                        disabled={field.primary}
                    />
                );
        }
    }

    /* ── RPC helpers ── */
    protected async connect(): Promise<void> {
        const root = this.workspaceService.tryGetRoots()[0]?.resource.path.fsPath();
        if (!root) return;

        this.setState({ connecting: true });
        try {
            const svc = this.service;
            await svc.connect(root);
            const status = await svc.getStatus();
            const collections = await svc.getCollections();
            this.setState({
                connected: true, connecting: false,
                driver: status.driver, collections,
            });
        } catch (e: any) {
            this.setState({ connecting: false });
            console.error('DB Explorer connect error:', e.message);
        }
    }

    protected async disconnect(): Promise<void> {
        try {
            const svc = this.service;
            await svc.disconnect();
        } catch { /* */ }
        this.setState({
            connected: false, driver: '', collections: [],
            selectedCollection: '', documents: [], total: 0,
        });
    }

    protected async selectCollection(name: string): Promise<void> {
        this.setState({ selectedCollection: name, documents: [], total: 0, offset: 0, filters: [], sorts: [] });
        await this.applyQuery();
    }

    protected async applyQuery(): Promise<void> {
        const s = this.state;
        if (!s.selectedCollection) return;

        try {
            const svc = this.service;
            const where = s.filters.filter(f => f.field && f.operator).map(f => ({
                field: f.field,
                operator: f.operator,
                value: s.collections.find(c => c.name === s.selectedCollection)?.fields.find(ff => ff.name === f.field)?.type === 'number' ? Number(f.value) || 0 : f.value,
                logic: f.logic,
            }));
            const sort = s.sorts.filter(sr => sr.field).map(sr => ({
                field: sr.field,
                dir: sr.dir,
            }));
            const result = await svc.queryDocuments({
                collection: s.selectedCollection,
                where: where.length > 0 ? where : undefined,
                sort: sort.length > 0 ? sort : undefined,
                limit: s.limit,
                offset: s.offset,
            });
            this.setState({ documents: result.documents, total: result.total });
        } catch (e: any) {
            console.error('Query error:', e.message);
        }
    }

    protected resetQuery(): void {
        this.setState({ filters: [], sorts: [], offset: 0 });
        this.applyQuery();
    }

    protected addFilter(): void {
        const filters = [...this.state.filters, { id: ++_filterIdCounter, field: '', operator: 'eq', value: '', logic: 'and' as const }];
        this.setState({ filters });
    }

    protected removeFilter(id: number): void {
        this.setState({ filters: this.state.filters.filter(f => f.id !== id) });
    }

    protected updateFilter(id: number, key: string, value: any): void {
        const filters = this.state.filters.map(f => f.id === id ? { ...f, [key]: value } : f);
        this.setState({ filters });
    }

    protected toggleFilterLogic(id: number): void {
        const filters = this.state.filters.map(f => f.id === id ? { ...f, logic: f.logic === 'and' ? 'or' as const : 'and' as const } : f);
        this.setState({ filters });
    }

    protected addSort(): void {
        const sorts = [...this.state.sorts, { id: ++_sortIdCounter, field: '', dir: 'asc' as const }];
        this.setState({ sorts });
    }

    protected removeSort(id: number): void {
        this.setState({ sorts: this.state.sorts.filter(s => s.id !== id) });
    }

    protected updateSort(id: number, key: string, value: any): void {
        const sorts = this.state.sorts.map(s => s.id === id ? { ...s, [key]: value } : s);
        this.setState({ sorts });
    }

    protected goToPage(page: number): void {
        const offset = (page - 1) * this.state.limit;
        this.setState({ offset });
        this.applyQuery();
    }

    protected setPageSize(limit: number): void {
        this.setState({ limit, offset: 0 });
        this.applyQuery();
    }

    protected openEditDocument(doc: Record<string, any>): void {
        this.setState({ editingDoc: { ...doc }, isNew: false });
    }

    protected openNewDocument(): void {
        const collection = this.state.collections.find(c => c.name === this.state.selectedCollection);
        const empty: Record<string, any> = {};
        (collection?.fields || []).forEach(f => {
            if (f.default !== undefined) empty[f.name] = f.default;
            else if (f.type === 'boolean') empty[f.name] = false;
            else if (f.type === 'number') empty[f.name] = 0;
            else if (f.nullable) empty[f.name] = null;
            else empty[f.name] = '';
        });
        this.setState({ editingDoc: empty, isNew: true });
    }

    protected updateEditingDoc(field: string, value: any): void {
        if (!this.state.editingDoc) return;
        this.setState({ editingDoc: { ...this.state.editingDoc, [field]: value } });
    }

    protected async saveDocument(): Promise<void> {
        const doc = this.state.editingDoc;
        if (!doc || !this.state.selectedCollection) return;

        try {
            const svc = this.service;
            const collection = this.state.collections.find(c => c.name === this.state.selectedCollection);
            const pkField = collection?.fields.find(f => f.primary);
            const cleanDoc: Record<string, any> = {};

            for (const key of Object.keys(doc)) {
                if (key === '_s' || key === '_dt' || key === '_uid') continue;
                cleanDoc[key] = doc[key];
            }

            if (this.state.isNew) {
                await svc.insertDocument(this.state.selectedCollection, cleanDoc);
            } else {
                const pkName = pkField?.name || '_id';
                const pkValue = doc[pkName] || doc._id;
                await svc.updateDocument(this.state.selectedCollection, { [pkName]: pkValue }, cleanDoc);
            }

            this.closeModal();
            await this.applyQuery();

            // Refresh collection list for updated counts
            const collections = await svc.getCollections();
            this.setState({ collections });
        } catch (e: any) {
            console.error('Save error:', e.message);
        }
    }

    protected async deleteDocument(doc: Record<string, any>): Promise<void> {
        if (!this.state.selectedCollection) return;

        try {
            const svc = this.service;
            const collection = this.state.collections.find(c => c.name === this.state.selectedCollection);
            const pkField = collection?.fields.find(f => f.primary);
            const pkName = pkField?.name || '_id';
            const pkValue = doc[pkName] || doc._id;

            await svc.deleteDocument(this.state.selectedCollection, { [pkName]: pkValue });
            this.closeModal();
            await this.applyQuery();

            const collections = await svc.getCollections();
            this.setState({ collections });
        } catch (e: any) {
            console.error('Delete error:', e.message);
        }
    }

    protected closeModal(): void {
        this.setState({ editingDoc: null, isNew: false });
    }

    protected setState(partial: Partial<DbExplorerState>): void {
        Object.assign(this.state, partial);
        this.update();
    }
}
