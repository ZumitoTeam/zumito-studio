import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceService } from '@theia/core';
import {
    OpenCodeLanguageModelsManager,
    OPENCODE_API_KEY_PREF,
    OPENCODE_ZEN_ENABLED_PREF,
    OPENCODE_GO_ENABLED_PREF
} from '../common';
import {
    FrontendLanguageModelRegistry,
    LanguageModelAliasRegistry,
    LanguageModel,
    LanguageModelAlias
} from '@theia/ai-core';

const OPENCODE_PREFIX = 'opencode-';
const TARGET_ALIASES = ['default/code', 'default/universal', 'default/code-completion', 'default/summarize', 'default/fast'];

@injectable()
export class OpenCodeFrontendContribution implements FrontendApplicationContribution {
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(OpenCodeLanguageModelsManager)
    protected readonly manager: OpenCodeLanguageModelsManager;

    @inject(FrontendLanguageModelRegistry)
    protected readonly frontendRegistry: FrontendLanguageModelRegistry;

    @inject(LanguageModelAliasRegistry)
    protected readonly aliasRegistry: LanguageModelAliasRegistry;

    @postConstruct()
    protected init(): void {
        let debounceTimer: ReturnType<typeof setTimeout> | undefined;
        this.frontendRegistry.onChange(({ models }) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = undefined;
                this.updateAliasesWithOpenCodeModels(models);
            }, 300);
        });
    }

    onStart(): void {
        this.preferenceService.ready.then(() => {
            this.syncFromPreferences();
            this.preferenceService.onPreferenceChanged(event => {
                const relevantPreferences = [
                    OPENCODE_API_KEY_PREF,
                    OPENCODE_ZEN_ENABLED_PREF,
                    OPENCODE_GO_ENABLED_PREF
                ];
                if (relevantPreferences.includes(event.preferenceName)) {
                    this.syncFromPreferences();
                }
            });
        });
    }

    private syncInProgress = false;

    private async syncFromPreferences(): Promise<void> {
        if (this.syncInProgress) return;
        this.syncInProgress = true;
        try {
            const apiKey = this.preferenceService.get<string>(OPENCODE_API_KEY_PREF, '');
            const zenEnabled = this.preferenceService.get<boolean>(OPENCODE_ZEN_ENABLED_PREF, true);
            const goEnabled = this.preferenceService.get<boolean>(OPENCODE_GO_ENABLED_PREF, false);

            this.manager.setApiKey(apiKey);
            this.manager.setZenEnabled(zenEnabled);
            this.manager.setGoEnabled(goEnabled);

            await this.manager.refreshModels();

            const models = await this.frontendRegistry.getLanguageModels();
            this.updateAliasesWithOpenCodeModels(models);
        } catch (e) {
            console.error('[OpenCode] Failed to sync preferences:', e);
        } finally {
            this.syncInProgress = false;
        }
    }

    private updateAliasesWithOpenCodeModels(models: LanguageModel[]): void {
        const openCodeIds = models
            .filter(m => m.id.startsWith(OPENCODE_PREFIX))
            .map(m => m.id);

        if (openCodeIds.length === 0) return;

        this.aliasRegistry.ready.then(() => {
            let updatedCount = 0;
            for (const aliasId of TARGET_ALIASES) {
                const existing = this.aliasRegistry.getAliases().find(a => a.id === aliasId);
                if (!existing) continue;

                if (existing.selectedModelId) continue;

                const mergedIds = [
                    ...openCodeIds,
                    ...existing.defaultModelIds.filter(id => !openCodeIds.includes(id))
                ];

                const updatedAlias: LanguageModelAlias = {
                    ...existing,
                    defaultModelIds: mergedIds
                };
                this.aliasRegistry.addAlias(updatedAlias);
                updatedCount++;
            }
            console.log(`[OpenCode] Updated ${updatedCount} aliases with ${openCodeIds.length} opencode models`);
        });
    }
}
