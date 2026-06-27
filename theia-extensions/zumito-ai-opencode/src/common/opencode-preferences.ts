import { PreferenceSchema } from '@theia/core';

export const OPENCODE_API_KEY_PREF = 'ai-features.openCode.apiKey';
export const OPENCODE_ZEN_ENABLED_PREF = 'ai-features.openCode.zenEnabled';
export const OPENCODE_GO_ENABLED_PREF = 'ai-features.openCode.goEnabled';

export const OpenCodePreferencesSchema: PreferenceSchema = {
    properties: {
        [OPENCODE_API_KEY_PREF]: {
            type: 'string',
            description: 'OpenCode API key for Zen and Go models. Get yours at https://opencode.ai/auth',
            default: ''
        },
        [OPENCODE_ZEN_ENABLED_PREF]: {
            type: 'boolean',
            description: 'Enable OpenCode Zen models (pay-as-you-go pricing).',
            default: true
        },
        [OPENCODE_GO_ENABLED_PREF]: {
            type: 'boolean',
            description: 'Enable OpenCode Go models (subscription-based pricing). Requires active Go subscription.',
            default: false
        }
    }
};
