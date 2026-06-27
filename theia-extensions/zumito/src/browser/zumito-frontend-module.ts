import '../../src/browser/ribbon/ribbon-style.css';
import '../../src/browser/framework-inspector/framework-inspector.css';
import '../../src/browser/db-explorer/db-explorer.css';

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, RemoteConnectionProvider } from '@theia/core/lib/browser';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { ToolbarContribution, ToolbarAlignment } from '@theia/toolbar/lib/browser/toolbar-interfaces';
import { ToolbarDefaultsFactory } from '@theia/toolbar/lib/browser/toolbar-defaults';
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common/command';
import { QuickInputService } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { ZumitoContribution } from './zumito-contribution';
import { RibbonWidget } from './ribbon/ribbon-widget';
import {
    ZumitoCodeActionContribution,
    executeInjectService,
} from './zumito-code-action-contribution';
import { FrameworkInspectorService } from './framework-inspector/framework-inspector-service';
import { FrameworkInspectorWidget } from './framework-inspector/framework-inspector-widget';
import { FrameworkInspectorContribution } from './framework-inspector/framework-inspector-contribution';
import { DbExplorerWidget } from './db-explorer/db-explorer-widget';
import { DbExplorerContribution } from './db-explorer/db-explorer-contribution';
import { DbExplorerService, DB_EXPLORER_PATH } from '../common/db-explorer-protocol';

export namespace ZumitoCommands {
    export const INJECT_SERVICE: Command = {
        id: 'zumito.injectService',
        label: 'Inject Service',
    };
}

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(ZumitoContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ZumitoContribution);

    bind(ZumitoCodeActionContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ZumitoCodeActionContribution);

    bind(RibbonWidget).toSelf().inSingletonScope();
    bind(ToolbarContribution).toService(RibbonWidget);

    bind(CommandContribution).toDynamicValue((ctx: interfaces.Context) => ({
        registerCommands(registry: CommandRegistry): void {
            registry.registerCommand(ZumitoCommands.INJECT_SERVICE, {
                execute: async () => {
                    const editorManager = ctx.container.get<EditorManager>(EditorManager);
                    const quickInput = ctx.container.get<QuickInputService>(QuickInputService);
                    const editor = editorManager.activeEditor;
                    if (editor && editor instanceof MonacoEditor) {
                        executeInjectService(editor, quickInput);
                    }
                },
            });
        },
    })).inSingletonScope();

    bind(FrameworkInspectorService).toSelf().inSingletonScope();
    bind(FrameworkInspectorWidget).toSelf();
    bind(WidgetFactory).toDynamicValue((ctx: interfaces.Context) => ({
        id: FrameworkInspectorWidget.ID,
        createWidget: () => ctx.container.get(FrameworkInspectorWidget),
    })).inSingletonScope();
    bind(FrameworkInspectorContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(FrameworkInspectorContribution);

    bind(DbExplorerWidget).toSelf();
    bind(WidgetFactory).toDynamicValue((ctx: interfaces.Context) => ({
        id: DbExplorerWidget.ID,
        createWidget: () => ctx.container.get(DbExplorerWidget),
    })).inSingletonScope();
    bind(DbExplorerContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(DbExplorerContribution);

    bind(DbExplorerService).toDynamicValue((ctx: interfaces.Context) => {
        const provider = ctx.container.get(RemoteConnectionProvider) as unknown as {
            createProxy: <T extends object>(path: string, arg?: object) => T;
        };
        return provider.createProxy<DbExplorerService>(DB_EXPLORER_PATH);
    }).inSingletonScope();

    const ribbonDefaults = () => ({
        items: {
            [ToolbarAlignment.LEFT]: [
                [{ id: 'zumito-ribbon', group: 'contributed' }],
            ],
            [ToolbarAlignment.CENTER]: [[]],
            [ToolbarAlignment.RIGHT]: [
                [{
                    id: 'workbench.action.showCommands',
                    command: 'workbench.action.showCommands',
                    icon: 'codicon codicon-terminal',
                    tooltip: 'Command Palette',
                }]
            ]
        }
    });

    if (isBound(ToolbarDefaultsFactory)) {
        rebind(ToolbarDefaultsFactory).toConstantValue(ribbonDefaults);
    } else {
        bind(ToolbarDefaultsFactory).toConstantValue(ribbonDefaults);
    }
});
