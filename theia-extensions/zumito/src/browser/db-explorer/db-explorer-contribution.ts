import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { DbExplorerWidget } from './db-explorer-widget';

export namespace DbExplorerCommands {
    export const OPEN: Command = {
        id: 'zumito.dbExplorer.open',
        label: 'DB Explorer',
        category: 'Zumito',
    };
}

@injectable()
export class DbExplorerContribution implements CommandContribution {

    @inject(WidgetManager)
    private readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    private readonly shell: ApplicationShell;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(DbExplorerCommands.OPEN, {
            execute: () => this.openExplorer(),
        });
    }

    private async openExplorer(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(DbExplorerWidget.ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, {
                area: 'main',
                rank: 600,
            });
        }
        await this.shell.activateWidget(widget.id);
    }
}
