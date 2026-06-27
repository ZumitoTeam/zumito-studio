import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common/event';

export interface FrameworkSnapshot {
    version: string;
    uptime: number;
    discord: {
        status: 'connected' | 'disconnected';
        user: { id: string; tag: string } | null;
        guildCount: number;
    };
    database: {
        connected: boolean;
        driver: string;
    };
    commands: { total: number; items: CommandItem[] };
    modules: { total: number; items: ModuleItem[] };
    services: { total: number; items: ServiceItem[] };
    events: { total: number; items: EventItem[] };
}

export interface CommandItem {
    name: string;
    type: string;
    description: string;
    aliases: string[];
    categories: string[];
    hidden: boolean;
}

export interface ModuleItem {
    name: string;
    displayName: string;
    status: string;
    dependencies: string[];
    commandCount: number;
    eventCount: number;
}

export interface ServiceItem {
    name: string;
    singleton: boolean;
    hasInstance: boolean;
    dependencies: string[];
}

export interface EventItem {
    name: string;
    source: string;
}

@injectable()
export class FrameworkInspectorService {

    @inject(WorkspaceService)
    private readonly workspaceService: WorkspaceService;

    @inject(FileService)
    private readonly fileService: FileService;

    private readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    private inspectorUri: URI | undefined;
    private inspectorPath: string | undefined;

    @postConstruct()
    init(): void {
        this.resolveInspectorUri();
        this.workspaceService.onWorkspaceChanged(() => {
            this.resolveInspectorUri();
            this.onDidChangeEmitter.fire(undefined);
        });
    }

    private resolveInspectorUri(): void {
        try {
            const roots = this.workspaceService.tryGetRoots();
            if (roots && roots.length > 0) {
                const rootUri = roots[0].resource;
                this.inspectorUri = rootUri.resolve('.zumito/inspector-state.json');
                this.inspectorPath = this.inspectorUri.path.toString();
                return;
            }
        } catch {
            // workspace not open yet
        }
        this.inspectorUri = undefined;
        this.inspectorPath = undefined;
    }

    getInspectorFilePath(): string | undefined {
        return this.inspectorPath;
    }

    async getSnapshot(): Promise<FrameworkSnapshot | null> {
        if (!this.inspectorUri) { return null; }

        try {
            const content = await this.fileService.read(this.inspectorUri);
            const text = content.value.toString();
            if (!text || text.trim().length === 0) { return null; }
            return JSON.parse(text) as FrameworkSnapshot;
        } catch {
            return null;
        }
    }
}
