import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ZumitoContribution } from './zumito-contribution';

export default new ContainerModule((bind, _unbind, _isBound, _rebind) => {
    bind(ZumitoContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ZumitoContribution);
});
