import { inject, injectable } from '@theia/core/shared/inversify';
import { LanguageModelRegistry } from '@theia/ai-core';
import {
    OpenCodeLanguageModelsManager,
    OpenCodeModelDescription,
    OPENCODE_PROVIDER_ID
} from '../common/opencode-protocol';
import { OpenCodeLanguageModel } from './opencode-language-model';

const ZEN_MODELS_URL = 'https://opencode.ai/zen/v1/models';
const GO_MODELS_URL = 'https://opencode.ai/zen/go/v1/models';

interface RawModelEntry {
    id: string;
    model?: string;
    endpoint?: string;
    sdk_package?: string;
    vendor?: string;
    max_input_tokens?: number;
    max_output_tokens?: number;
    name?: string;
}

function normalizeEndpoint(endpoint: string): string {
    let url = endpoint;
    if (!url.startsWith('http')) {
        url = `https://opencode.ai${url.startsWith('/') ? '' : '/'}${url}`;
    }
    return url.replace(/\/+$/, '');
}

function buildEndpoint(mode: 'zen' | 'go', apiFormat: 'openai-chat' | 'openai-responses' | 'anthropic-messages'): string {
    const base = mode === 'go' ? 'https://opencode.ai/zen/go/v1' : 'https://opencode.ai/zen/v1';
    switch (apiFormat) {
        case 'openai-chat':
            return `${base}/chat/completions`;
        case 'openai-responses':
            return `${base}/responses`;
        case 'anthropic-messages':
            return `${base}/messages`;
    }
}

function detectApiFormat(endpoint: string): 'openai-chat' | 'openai-responses' | 'anthropic-messages' {
    if (endpoint.includes('/responses')) return 'openai-responses';
    if (endpoint.includes('/messages')) return 'anthropic-messages';
    return 'openai-chat';
}

@injectable()
export class OpenCodeLanguageModelsManagerImpl implements OpenCodeLanguageModelsManager {
    @inject(LanguageModelRegistry)
    protected readonly registry: LanguageModelRegistry;

    private _apiKey = '';
    private zenEnabled = true;
    private goEnabled = false;

    setApiKey(key: string): void {
        this._apiKey = key;
    }

    setZenEnabled(enabled: boolean): void {
        this.zenEnabled = enabled;
    }

    setGoEnabled(enabled: boolean): void {
        this.goEnabled = enabled;
    }

    async refreshModels(): Promise<void> {
        if (!this._apiKey) {
            await this.removeAllOpenCodeModels();
            return;
        }

        const allModels: OpenCodeModelDescription[] = [];

        if (this.zenEnabled) {
            try {
                const zenModels = await this.fetchModels(ZEN_MODELS_URL, 'zen');
                allModels.push(...zenModels);
            } catch (e) {
                console.warn('[OpenCode] Failed to fetch Zen models:', e);
            }
        }

        if (this.goEnabled) {
            try {
                const goModels = await this.fetchModels(GO_MODELS_URL, 'go');
                allModels.push(...goModels);
            } catch (e) {
                console.warn('[OpenCode] Failed to fetch Go models:', e);
            }
        }

        if (allModels.length === 0) {
            await this.removeAllOpenCodeModels();
            return;
        }

        const existingModels = await this.registry.getLanguageModels();
        const existingIds = new Set(
            existingModels
                .filter(m => m.id.startsWith(`${OPENCODE_PROVIDER_ID}-`))
                .map(m => m.id)
        );

        const newIds = new Set<string>();

        for (const desc of allModels) {
            const modelId = `${OPENCODE_PROVIDER_ID}-${desc.mode}/${desc.id}`;
            newIds.add(modelId);

            const existing = existingModels.find(m => m.id === modelId);

            if (existing instanceof OpenCodeLanguageModel) {
                existing.updateApiKey(this._apiKey);
            } else {
                const apiFormat = detectApiFormat(desc.endpoint || '');
                const endpoint = desc.endpoint
                    ? normalizeEndpoint(desc.endpoint)
                    : buildEndpoint(desc.mode, apiFormat);

                const fullDesc: OpenCodeModelDescription = {
                    ...desc,
                    id: modelId,
                    model: desc.model,
                    apiFormat,
                    endpoint
                };
                const model = new OpenCodeLanguageModel(fullDesc, this._apiKey);
                this.registry.addLanguageModels([model]);
            }
        }

        const toRemove = [...existingIds].filter(id => !newIds.has(id));
        if (toRemove.length > 0) {
            this.registry.removeLanguageModels(toRemove);
        }
    }

    private async fetchModels(url: string, mode: 'zen' | 'go'): Promise<OpenCodeModelDescription[]> {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this._apiKey}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to fetch models from ${url}: ${response.status} ${text}`);
        }

        const json = await response.json();
        const entries: RawModelEntry[] = json.data || json.models || json || [];

        if (!Array.isArray(entries)) {
            return [];
        }

        return entries.map((entry: RawModelEntry) => ({
            id: entry.id,
            model: entry.model || entry.id,
            apiFormat: detectApiFormat(entry.endpoint || ''),
            endpoint: entry.endpoint || '',
            mode,
            vendor: entry.vendor || 'OpenCode',
            maxInputTokens: entry.max_input_tokens,
            maxOutputTokens: entry.max_output_tokens
        }));
    }

    private async removeAllOpenCodeModels(): Promise<void> {
        const models = await this.registry.getLanguageModels();
        const ids = models
            .filter(m => m.id.startsWith(`${OPENCODE_PROVIDER_ID}-`))
            .map(m => m.id);

        if (ids.length > 0) {
            this.registry.removeLanguageModels(ids);
        }
    }
}
