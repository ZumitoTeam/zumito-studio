import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PluginViewRegistry } from '@theia/plugin-ext/lib/main/browser/view/plugin-view-registry';

@injectable()
export class ZumitoContribution implements FrontendApplicationContribution {

    @inject(PluginViewRegistry)
    protected readonly pluginViewRegistry: PluginViewRegistry;

    onStart(_app: FrontendApplication): void {
        this.pluginViewRegistry.registerViewWelcome({
            view: 'explorer',
            content: 'Create a new Zumito project by clicking the button below.\n[Create Zumito Project](command:zumito-cli.createProject)',
            when: 'workspaceFolderCount == 0',
            order: 0
        });
    }
}
