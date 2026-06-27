import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrameworkInspectorService, FrameworkSnapshot } from './framework-inspector-service';

interface InspectorState {
    snapshot: FrameworkSnapshot | null;
    loading: boolean;
    error: string | null;
    expandedSections: Record<string, boolean>;
    inspectorFile: string | undefined;
}

@injectable()
export class FrameworkInspectorWidget extends ReactWidget {

    static readonly ID = 'framework-inspector:widget';
    static readonly LABEL = 'Framework Inspector';

    @inject(FrameworkInspectorService)
    private readonly service: FrameworkInspectorService;

    private state: InspectorState = {
        snapshot: null,
        loading: false,
        error: null,
        expandedSections: {
            framework: true,
            commands: true,
            modules: true,
            services: true,
            events: true,
        },
        inspectorFile: undefined,
    };

    private pollTimer: ReturnType<typeof setInterval> | undefined;
    private pendingRefresh: boolean = false;

    @postConstruct()
    init(): void {
        this.id = FrameworkInspectorWidget.ID;
        this.title.label = FrameworkInspectorWidget.LABEL;
        this.title.caption = FrameworkInspectorWidget.LABEL;
        this.title.iconClass = 'codicon codicon-inspect';
        this.title.closable = true;
        this.node.style.overflow = 'auto';
        this.node.style.padding = '4px 8px';
        this.service.onDidChange(() => this.scheduleRefresh());
        this.startPolling();
    }

    dispose(): void {
        this.stopPolling();
        super.dispose();
    }

    protected onAfterAttach(msg: any): void {
        super.onAfterAttach(msg);
        this.scheduleRefresh();
    }

    private startPolling(): void {
        this.stopPolling();
        this.pollTimer = setInterval(() => this.scheduleRefresh(), 3000);
    }

    private stopPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    private toggleSection(section: string): void {
        const expanded = { ...this.state.expandedSections };
        expanded[section] = !expanded[section];
        this.state = { ...this.state, expandedSections: expanded };
        this.update();
    }

    private scheduleRefresh(): void {
        if (this.pendingRefresh || this.state.loading) { return; }
        this.pendingRefresh = true;
        // Use setTimeout(0) to batch rapid events
        setTimeout(() => {
            this.pendingRefresh = false;
            this.doRefresh();
        }, 0);
    }

    private async doRefresh(): Promise<void> {
        if (this.state.loading) { return; }

        this.state = { ...this.state, loading: true, error: null };
        this.update();

        // Safety timeout: if getSnapshot hangs, reset loading after 5s
        const timeout = setTimeout(() => {
            if (this.state.loading) {
                this.state = { ...this.state, loading: false, error: 'Timeout al leer el inspector.' };
                this.update();
            }
        }, 5000);

        try {
            const snapshot = await this.service.getSnapshot();
            clearTimeout(timeout);

            const inspectorFile = this.service.getInspectorFilePath();

            this.state = {
                snapshot,
                loading: false,
                error: !inspectorFile
                    ? 'Abre un proyecto de bot para usar el inspector.'
                    : !snapshot
                        ? 'Esperando al bot... El inspector se activa cuando el framework se inicializa.'
                        : null,
                expandedSections: this.state.expandedSections,
                inspectorFile,
            };
        } catch (e) {
            clearTimeout(timeout);
            this.state = {
                ...this.state,
                loading: false,
                error: 'Error inesperado: ' + String(e),
            };
        }
        this.update();
    }

    protected render(): React.ReactNode {
        const { snapshot, loading, error, expandedSections, inspectorFile } = this.state;

        const hasData = !!snapshot;

        return <div className='fi-container'>
            <div className='fi-header'>
                <span className='codicon codicon-inspect' />
                <span> Framework Inspector</span>
                <span className='fi-refresh' onClick={() => this.scheduleRefresh()} title='Refrescar'>
                    <span className='codicon codicon-refresh' />
                </span>
            </div>

            {loading && <div className='fi-loading'>Cargando...</div>}
            {error && <div className='fi-error'>{error}</div>}
            {!loading && !error && !snapshot && inspectorFile &&
                <div className='fi-hint'>Esperando al bot...</div>
            }
            {!loading && !error && !snapshot && !inspectorFile &&
                <div className='fi-hint'>Abre un proyecto de bot para usar el inspector.</div>
            }

            {hasData && <>
                {this.renderFrameworkSection(snapshot!, expandedSections)}
                {this.renderCommandsSection(snapshot!, expandedSections)}
                {this.renderModulesSection(snapshot!, expandedSections)}
                {this.renderServicesSection(snapshot!, expandedSections)}
                {this.renderEventsSection(snapshot!, expandedSections)}
            </>}
        </div>;
    }

    private isExpanded(expandedSections: Record<string, boolean>, key: string): boolean {
        return expandedSections[key] !== false;
    }

    private renderSectionHeader(
        key: string,
        label: string,
        count: number | undefined,
        expandedSections: Record<string, boolean>,
    ): React.ReactNode {
        const isExpanded = this.isExpanded(expandedSections, key);
        return <div
            className='fi-section-header'
            onClick={() => this.toggleSection(key)}
        >
            <span className={'codicon codicon-chevron-' + (isExpanded ? 'down' : 'right')} />
            <span className='fi-section-label'>{label}</span>
            {count !== undefined && <span className='fi-section-count'>{count}</span>}
        </div>;
    }

    private renderFrameworkSection(snapshot: FrameworkSnapshot, expandedSections: Record<string, boolean>): React.ReactNode {
        const fw = snapshot;
        const open = this.isExpanded(expandedSections, 'framework');
        return <div className='fi-section'>
            {this.renderSectionHeader('framework', 'Framework', undefined, expandedSections)}
            {open && <div className='fi-section-body'>
                <div className='fi-row'>
                    <span className='fi-label'>Versión</span>
                    <span className='fi-value'>{fw.version}</span>
                </div>
                <div className='fi-row'>
                    <span className='fi-label'>Tiempo activo</span>
                    <span className='fi-value'>{this.formatUptime(fw.uptime)}</span>
                </div>
                <div className='fi-row'>
                    <span className='fi-label'>Discord</span>
                    <span className={'fi-value ' + (fw.discord.status === 'connected' ? '' : '')}>
                        {fw.discord.status === 'connected'
                            ? <><span className='fi-dot fi-dot-green' /> {fw.discord.user?.tag} ({fw.discord.guildCount} s)</>
                            : <><span className='fi-dot fi-dot-red' /> Desconectado</>}
                    </span>
                </div>
                <div className='fi-row'>
                    <span className='fi-label'>Base de datos</span>
                    <span className='fi-value'>
                        {fw.database.connected
                            ? <><span className='fi-dot fi-dot-green' /> {fw.database.driver}</>
                            : <><span className='fi-dot fi-dot-red' /> Desconectada</>}
                    </span>
                </div>
            </div>}
        </div>;
    }

    private renderCommandsSection(snapshot: FrameworkSnapshot, expandedSections: Record<string, boolean>): React.ReactNode {
        const cmds = snapshot.commands;
        const open = this.isExpanded(expandedSections, 'commands');
        return <div className='fi-section'>
            {this.renderSectionHeader('commands', 'Comandos', cmds.total, expandedSections)}
            {open && <div className='fi-section-body'>
                {cmds.items.length === 0 && <div className='fi-empty'>No hay comandos cargados</div>}
                {cmds.items.map((cmd, i) =>
                    <div key={i} className='fi-entry fi-entry-level1' title={cmd.description}>
                        <span className='fi-entry-name'>{cmd.name}</span>
                        <span className='fi-entry-tag'>{cmd.type}</span>
                        {cmd.aliases.length > 0 &&
                            <span className='fi-entry-meta'>({cmd.aliases.join(', ')})</span>
                        }
                        {cmd.hidden && <span className='fi-badge fi-badge-hidden'>oculto</span>}
                    </div>
                )}
            </div>}
        </div>;
    }

    private renderModulesSection(snapshot: FrameworkSnapshot, expandedSections: Record<string, boolean>): React.ReactNode {
        const mods = snapshot.modules;
        const open = this.isExpanded(expandedSections, 'modules');
        return <div className='fi-section'>
            {this.renderSectionHeader('modules', 'Módulos', mods.total, expandedSections)}
            {open && <div className='fi-section-body'>
                {mods.items.length === 0 && <div className='fi-empty'>No hay módulos cargados</div>}
                {mods.items.map((mod, i) =>
                    <div key={i} className='fi-entry fi-entry-level1'>
                        <span className={'fi-dot ' + (mod.status === 'loaded' ? 'fi-dot-green' : 'fi-dot-yellow')} />
                        <span className='fi-entry-name'>{mod.displayName}</span>
                        <span className='fi-entry-tag'>{mod.status}</span>
                        <span className='fi-entry-meta'>{mod.commandCount} cmd · {mod.eventCount} ev</span>
                        {mod.dependencies.length > 0 &&
                            <span className='fi-entry-meta'>dep: {mod.dependencies.join(', ')}</span>}
                    </div>
                )}
            </div>}
        </div>;
    }

    private renderServicesSection(snapshot: FrameworkSnapshot, expandedSections: Record<string, boolean>): React.ReactNode {
        const svcs = snapshot.services;
        const open = this.isExpanded(expandedSections, 'services');
        return <div className='fi-section'>
            {this.renderSectionHeader('services', 'Servicios', svcs.total, expandedSections)}
            {open && <div className='fi-section-body'>
                {svcs.items.length === 0 && <div className='fi-empty'>No hay servicios registrados</div>}
                {svcs.items.map((svc, i) =>
                    <div key={i} className='fi-entry fi-entry-level1'>
                        <span className={'fi-dot ' + (svc.hasInstance ? 'fi-dot-green' : 'fi-dot-gray')} />
                        <span className='fi-entry-name'>{svc.name}</span>
                        {svc.singleton && <span className='fi-entry-tag fi-tag-singleton'>singleton</span>}
                        {svc.dependencies.length > 0 &&
                            <span className='fi-entry-meta'>dep: {svc.dependencies.join(', ')}</span>}
                    </div>
                )}
            </div>}
        </div>;
    }

    private renderEventsSection(snapshot: FrameworkSnapshot, expandedSections: Record<string, boolean>): React.ReactNode {
        const evts = snapshot.events;
        const open = this.isExpanded(expandedSections, 'events');
        return <div className='fi-section'>
            {this.renderSectionHeader('events', 'Eventos', evts.total, expandedSections)}
            {open && <div className='fi-section-body'>
                {evts.items.length === 0 && <div className='fi-empty'>No hay eventos registrados</div>}
                {evts.items.map((evt, i) =>
                    <div key={i} className='fi-entry fi-entry-level1'>
                        <span className='fi-entry-name'>{evt.name}</span>
                        <span className='fi-entry-tag'>{evt.source}</span>
                    </div>
                )}
            </div>}
        </div>;
    }

    private formatUptime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) { return hours + 'h ' + (minutes % 60) + 'm'; }
        if (minutes > 0) { return minutes + 'm ' + (seconds % 60) + 's'; }
        return seconds + 's';
    }
}
