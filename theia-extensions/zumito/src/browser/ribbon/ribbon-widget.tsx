import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { AbstractToolbarContribution } from '@theia/toolbar/lib/browser/abstract-toolbar-contribution';

interface RibbonButton {
    icon: string;
    label: string;
    command: string;
    args?: unknown[];
}

interface RibbonGroup {
    label: string;
    buttons: RibbonButton[];
}

interface RibbonTab {
    label: string;
    groups: RibbonGroup[];
}

const RIBBON_TABS: Record<string, RibbonTab> = {
    proyecto: {
        label: 'Project',
        groups: [
            {
                label: 'New',
                buttons: [
                    { icon: 'codicon codicon-file-directory', label: 'Create Project', command: 'zumito-cli.createProject' },
                    { icon: 'codicon codicon-file-symlink', label: 'Create Module', command: 'zumito-cli.createModule' },
                ]
            },
            {
                label: 'Open',
                buttons: [
                    { icon: 'codicon codicon-folder-opened', label: 'Open Project', command: 'workbench.action.files.openFolder' },
                    { icon: 'codicon codicon-home', label: 'Welcome Screen', command: 'getting.started.widget' },
                ]
            },
        ]
    },
    modulos: {
        label: 'Modules',
        groups: [
            {
                label: 'External Modules',
                buttons: [
                    { icon: 'codicon codicon-package', label: 'Manage Modules', command: 'zumito-cli.modules.configure' },
                    { icon: 'codicon codicon-cloud-download', label: 'Install Module', command: 'zumito-cli.modules.install' },
                    { icon: 'codicon codicon-globe', label: 'Explore Store', command: 'mini-browser.openUrl', args: ['https://modules.zumito.dev/modules'] },
                ]
            },
            {
                label: 'Bot Modules',
                buttons: [
                    { icon: 'codicon codicon-plus', label: 'Create Module', command: 'zumito-cli.createModule' },
                ]
            }
        ]
    },
    ejecutar: {
        label: 'Run',
        groups: [
            {
                label: 'Execution',
                buttons: [
                    { icon: 'codicon codicon-play', label: 'Run', command: 'zumito-cli.runDev' },
                    { icon: 'codicon codicon-debug', label: 'Run Debugger', command: 'zumito-cli.runDebug' },
                ]
            }
        ]
    },
    herramientas: {
        label: 'Tools',
        groups: [
            {
                label: 'Development',
                buttons: [
                    { icon: 'codicon codicon-database', label: 'DB Explorer', command: 'zumito.dbExplorer.open' },
                    { icon: 'codicon codicon-server', label: 'Discord Portal', command: 'zumito-cli.discordPortal' },
                    { icon: 'codicon codicon-settings', label: 'Edit Config', command: 'zumito-cli.editConfig' },
                ]
            }
        ]
    }
};

@injectable()
export class RibbonWidget extends AbstractToolbarContribution {

    id = 'zumito-ribbon';
    protected activeTab = 'proyecto';

    render(): React.ReactNode {
        const tab = RIBBON_TABS[this.activeTab];

        return (
            <div className='zumito-ribbon'>
                <div className='zumito-ribbon-tabs'>
                    {Object.entries(RIBBON_TABS).map(([key, t]) => (
                        <button
                            key={key}
                            className={`zumito-ribbon-tab${key === this.activeTab ? ' active' : ''}`}
                            onClick={() => this.switchTab(key)}
                        >
                            {t.label}
                        </button>
                    ))}
                    <div className='zumito-ribbon-spacer' />
                </div>
                <div className='zumito-ribbon-groups'>
                    {tab.groups.map((group, gi) => (
                        <div key={gi} className='zumito-ribbon-group'>
                            <div className='zumito-ribbon-buttons'>
                                {group.buttons.map((btn, bi) => (
                                    <button
                                        key={bi}
                                        className='zumito-ribbon-button'
                                        title={btn.label}
                                        onClick={() => this.executeCommand(btn.command, btn.args)}
                                    >
                                        <span className={btn.icon}></span>
                                        <span className='zumito-ribbon-button-label'>{btn.label}</span>
                                    </button>
                                ))}
                            </div>
                            <div className='zumito-ribbon-group-label'>{group.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    protected switchTab(key: string): void {
        this.activeTab = key;
        this.didChangeEmitter.fire();
    }

    protected executeCommand(command: string, args?: unknown[]): void {
        this.commandService.executeCommand(command, ...(args ?? []));
    }
}
