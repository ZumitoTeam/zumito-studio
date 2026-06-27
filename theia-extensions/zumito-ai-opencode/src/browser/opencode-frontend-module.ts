import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, RemoteConnectionProvider } from '@theia/core/lib/browser';
import { PreferenceContribution } from '@theia/core';
import {
    OpenCodeLanguageModelsManager,
    OPENCODE_LANGUAGE_MODELS_MANAGER_PATH
} from '../common/opencode-protocol';
import { OpenCodePreferencesSchema } from '../common/opencode-preferences';
import { OpenCodeFrontendContribution } from './opencode-frontend-contribution';

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: OpenCodePreferencesSchema });

    bind(OpenCodeFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OpenCodeFrontendContribution);

    bind(OpenCodeLanguageModelsManager).toDynamicValue(ctx => {
        const provider = ctx.container.get(RemoteConnectionProvider) as unknown as {
            createProxy: <T extends object>(path: string, arg?: object) => T;
        };
        return provider.createProxy<OpenCodeLanguageModelsManager>(OPENCODE_LANGUAGE_MODELS_MANAGER_PATH);
    }).inSingletonScope();
});
