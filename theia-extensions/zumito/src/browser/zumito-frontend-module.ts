import '../../src/browser/ribbon/ribbon-style.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ToolbarContribution, ToolbarAlignment } from '@theia/toolbar/lib/browser/toolbar-interfaces';
import { ToolbarDefaultsFactory } from '@theia/toolbar/lib/browser/toolbar-defaults';
import { ZumitoContribution } from './zumito-contribution';
import { RibbonWidget } from './ribbon/ribbon-widget';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(ZumitoContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ZumitoContribution);

    bind(RibbonWidget).toSelf().inSingletonScope();
    bind(ToolbarContribution).toService(RibbonWidget);

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
