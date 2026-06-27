import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PluginViewRegistry } from '@theia/plugin-ext/lib/main/browser/view/plugin-view-registry';
import { CommandService } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';

declare global {
    interface Window {
        zumito?: ZumitoBridge;
    }
}

interface ZumitoBridge {
    installModule(packageName: string): void;
    createProject(): void;
    createCommand(): void;
    createModule(): void;
    openFolder(): void;
}

const BRIDGE_SCRIPT = `
(function() {
    if (window.zumito) return;
    function send(msg) {
        window.parent.postMessage(msg, '*');
    }
    window.zumito = {
        installModule: function(name) { send({ zumito: 'installModule', name: name }); },
        createProject: function() { send({ zumito: 'createProject' }); },
        createCommand: function() { send({ zumito: 'createCommand' }); },
        createModule: function() { send({ zumito: 'createModule' }); },
        openFolder: function() { send({ zumito: 'openFolder' }); }
    };
})();
`.trim();

@injectable()
export class ZumitoContribution implements FrontendApplicationContribution {

    @inject(PluginViewRegistry)
    protected readonly pluginViewRegistry: PluginViewRegistry;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected readonly toDispose = new DisposableCollection();
    protected domObserver: MutationObserver | null = null;
    protected messageListener: ((event: MessageEvent) => void) | null = null;

    onStart(_app: FrontendApplication): void {
        this.pluginViewRegistry.registerViewWelcome({
            view: 'explorer',
            content: 'No project is open. Get started with Zumito:\n\n[Create Zumito Project](command:zumito-cli.createProject)\n[Open Folder](command:workbench.action.files.openFileFolder)',
            when: 'workspaceFolderCount == 0',
            order: 0
        });

        this.injectBridge();
        this.listenPostMessage();
        this.watchIframes();
        this.applyTheme();
        this.hideUnwantedViews();
    }

    onStop(_app: FrontendApplication): void {
        this.toDispose.dispose();
    }

    /* ── Close unwanted default views ── */
    private hideUnwantedViews(): void {
        const hideIds = ['outline-view', 'memory-inspector'];
        setTimeout(() => {
            for (const id of hideIds) {
                const widget = this.shell.getWidgets('left').find(w => w.id === id)
                    || this.shell.getWidgets('right').find(w => w.id === id)
                    || this.shell.getWidgets('bottom').find(w => w.id === id);
                if (widget && widget.isVisible) {
                    this.shell.closeWidget(widget.id);
                }
            }
        }, 1000);
    }

    /* ── Force Zumito theme colors ── */
    private applyTheme(): void {
        const style = document.createElement('style');
        style.textContent = `
            #theia-statusBar { background-color: #e11d48 !important; color: #ffffff !important; }
            #theia-statusBar .element { color: #ffffff !important; }
            #theia-statusBar .element.has-background { background-color: #ffffff33 !important; }
            #theia-statusBar .codicon { color: #ffffff !important; }
        `;
        document.head.appendChild(style);
    }

    /* ── Bridge in main window ── */
    private injectBridge(): void {
        const exec = (cmd: string, ...args: unknown[]) => this.commandService.executeCommand(cmd, ...args);
        window.zumito = {
            installModule: (name: string) => exec('zumito-cli.modules.install', name),
            createProject: () => exec('zumito-cli.createProject'),
            createCommand: () => exec('zumito-cli.createCommand'),
            createModule: () => exec('zumito-cli.createModule'),
            openFolder: () => exec('workbench.action.files.openFileFolder'),
        };
    }

    /* ── Receive postMessage from iframed pages ── */
    private listenPostMessage(): void {
        this.messageListener = (event: MessageEvent) => {
            const data = event.data;
            if (!data || typeof data !== 'object' || !data.zumito) return;

            const cmd = data.zumito;
            switch (cmd) {
                case 'installModule':
                    this.commandService.executeCommand('zumito-cli.modules.install', data.name);
                    this.messageService.info(`Installing module: ${data.name}...`);
                    break;
                case 'createProject':
                    this.commandService.executeCommand('zumito-cli.createProject');
                    break;
                case 'createCommand':
                    this.commandService.executeCommand('zumito-cli.createCommand');
                    break;
                case 'createModule':
                    this.commandService.executeCommand('zumito-cli.createModule');
                    break;
                case 'openFolder':
                    this.commandService.executeCommand('workbench.action.files.openFileFolder');
                    break;
            }
        };
        window.addEventListener('message', this.messageListener);
        this.toDispose.push(Disposable.create(() => {
            if (this.messageListener) {
                window.removeEventListener('message', this.messageListener);
                this.messageListener = null;
            }
        }));
    }

    /* ── Try direct injection into same-origin iframes ── */
    private watchIframes(): void {
        this.domObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of Array.from(m.addedNodes)) {
                    if (node instanceof HTMLIFrameElement) {
                        this.tryInjectIntoIframe(node);
                    } else if (node instanceof HTMLElement) {
                        node.querySelectorAll('iframe').forEach(f => this.tryInjectIntoIframe(f));
                    }
                }
            }
        });

        this.domObserver.observe(document.body, { childList: true, subtree: true });
        this.toDispose.push(Disposable.create(() => {
            if (this.domObserver) {
                this.domObserver.disconnect();
                this.domObserver = null;
            }
        }));

        // Also catch existing iframes
        document.querySelectorAll('iframe').forEach(f => this.tryInjectIntoIframe(f));
    }

    private tryInjectIntoIframe(frame: HTMLIFrameElement): void {
        const inject = () => {
            try {
                const win = frame.contentWindow;
                const doc = frame.contentDocument;
                if (!win || !doc) return;
                // Only inject if same-origin
                if (!doc.defaultView) return;

                const script = doc.createElement('script');
                script.textContent = BRIDGE_SCRIPT;
                (doc.head || doc.documentElement).appendChild(script);
            } catch {
                // cross-origin, handled via postMessage instead
            }
        };

        // Inject on load
        frame.addEventListener('load', inject);
        this.toDispose.push(Disposable.create(() => frame.removeEventListener('load', inject)));
        // Also try immediately in case already loaded
        inject();
    }
}
