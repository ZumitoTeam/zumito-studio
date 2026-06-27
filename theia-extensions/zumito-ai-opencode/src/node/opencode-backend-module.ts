import { ContainerModule } from '@theia/core/shared/inversify';
import { OpenCodeLanguageModelsManager, OPENCODE_LANGUAGE_MODELS_MANAGER_PATH } from '../common/opencode-protocol';
import { OpenCodePreferencesSchema } from '../common/opencode-preferences';
import { PreferenceContribution, ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { OpenCodeLanguageModelsManagerImpl } from './opencode-language-models-manager-impl';

const openCodeConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bind(OpenCodeLanguageModelsManagerImpl).toSelf().inSingletonScope();
    bind(OpenCodeLanguageModelsManager).toService(OpenCodeLanguageModelsManagerImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(
            OPENCODE_LANGUAGE_MODELS_MANAGER_PATH,
            () => ctx.container.get(OpenCodeLanguageModelsManager)
        )
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: OpenCodePreferencesSchema });
    bind(ConnectionContainerModule).toConstantValue(openCodeConnectionModule);
});
