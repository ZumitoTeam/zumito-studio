export const OPENCODE_LANGUAGE_MODELS_MANAGER_PATH = '/services/opencode/language-model-manager';
export const OpenCodeLanguageModelsManager = Symbol('OpenCodeLanguageModelsManager');

export const OPENCODE_PROVIDER_ID = 'opencode';

export type OpenCodeApiMode = 'zen' | 'go';

export type OpenCodeApiFormat = 'openai-chat' | 'openai-responses' | 'anthropic-messages';

export interface OpenCodeModelDescription {
    id: string;
    model: string;
    apiFormat: OpenCodeApiFormat;
    endpoint: string;
    mode: OpenCodeApiMode;
    vendor?: string;
    maxInputTokens?: number;
    maxOutputTokens?: number;
}

export interface OpenCodeLanguageModelsManager {
    setApiKey(key: string): void;
    setZenEnabled(enabled: boolean): void;
    setGoEnabled(enabled: boolean): void;
    refreshModels(): Promise<void>;
}
