import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { AbstractToolbarContribution } from '@theia/toolbar/lib/browser/abstract-toolbar-contribution';

interface RibbonButton {
    icon: string;
    label: string;
    command: string;
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
        label: 'Proyecto',
        groups: [
            {
                label: 'Nuevo',
                buttons: [
                    { icon: 'codicon codicon-file-directory', label: 'Crear Proyecto', command: 'zumito-cli.createProject' },
                    { icon: 'codicon codicon-file-symlink', label: 'Crear Módulo', command: 'zumito-cli.createModule' },
                ]
            },
            {
                label: 'Abrir',
                buttons: [
                    { icon: 'codicon codicon-folder-opened', label: 'Abrir Proyecto', command: 'workbench.action.files.openFolder' },
                ]
            },
            {
                label: 'Componentes',
                buttons: [
                    { icon: 'codicon codicon-symbol-method', label: 'Crear Embed', command: 'zumito-cli.createEmbedBuilder' },
                    { icon: 'codicon codicon-list-tree', label: 'Action Row', command: 'zumito-cli.createActionRowBuilder' },
                ]
            },
            {
                label: 'Herramientas',
                buttons: [
                    { icon: 'codicon codicon-wand', label: 'Inyectar Servicio', command: 'zumito-cli.injectService' },
                ]
            }
        ]
    },
    ejecutar: {
        label: 'Ejecutar',
        groups: [
            {
                label: 'Ejecución',
                buttons: [
                    { icon: 'codicon codicon-play', label: 'Ejecutar', command: 'zumito-cli.runDev' },
                    { icon: 'codicon codicon-debug', label: 'Ejecutar Debugger', command: 'zumito-cli.runDebug' },
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
                                        onClick={() => this.executeCommand(btn.command)}
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

    protected executeCommand(command: string): void {
        this.commandService.executeCommand(command);
    }
}
