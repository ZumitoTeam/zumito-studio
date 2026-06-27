import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { FrameworkInspectorWidget } from './framework-inspector-widget';

export namespace FrameworkInspectorCommands {
    export const OPEN: Command = {
        id: 'zumito.frameworkInspector.open',
        label: 'Framework Inspector',
        category: 'Zumito',
    };

    export const REFRESH: Command = {
        id: 'zumito.frameworkInspector.refresh',
        label: 'Refresh Framework Inspector',
        category: 'Zumito',
    };
}

@injectable()
export class FrameworkInspectorContribution implements CommandContribution {

    @inject(WidgetManager)
    private readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    private readonly shell: ApplicationShell;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(FrameworkInspectorCommands.OPEN, {
            execute: () => this.openInspector(),
        });

        registry.registerCommand(FrameworkInspectorCommands.REFRESH, {
            execute: () => this.refreshInspector(),
        });
    }

    private async openInspector(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(FrameworkInspectorWidget.ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, {
                area: 'bottom',
                rank: 500,
            });
        }
        await this.shell.activateWidget(widget.id);
    }

    private async refreshInspector(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(FrameworkInspectorWidget.ID);
        if (widget instanceof FrameworkInspectorWidget) {
            widget['scheduleRefresh']();
        }
    }
}
