import { ContainerModule } from '@theia/core/shared/inversify';
import { DbExplorerService, DB_EXPLORER_PATH } from '../common/db-explorer-protocol';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { DbExplorerServiceImpl } from './db-explorer-service';

const dbExplorerConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bind(DbExplorerServiceImpl).toSelf().inSingletonScope();
    bind(DbExplorerService).toService(DbExplorerServiceImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(
            DB_EXPLORER_PATH,
            () => ctx.container.get(DbExplorerService)
        )
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(dbExplorerConnectionModule);
});
