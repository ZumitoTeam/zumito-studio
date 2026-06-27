import {
    LanguageModel,
    LanguageModelStreamResponse,
    LanguageModelTextResponse,
    LanguageModelStreamResponsePart,
    TextResponsePart,
    ToolCallResponsePart,
    ToolCall,
    UsageResponsePart,
    UserRequest,
    LanguageModelMessage,
    isLanguageModelStreamResponsePart
} from '@theia/ai-core';
import { OpenCodeModelDescription } from '../common/opencode-protocol';
import { CancellationToken } from '@theia/core';

function normalizeEndpoint(endpoint: string): string {
    let url = endpoint;
    if (!url.startsWith('http')) {
        url = `https://opencode.ai${url.startsWith('/') ? '' : '/'}${url}`;
    }
    return url.replace(/\/+$/, '');
}

interface TextMsg {
    actor: string;
    type: 'text';
    text: string;
}
interface ThinkMsg {
    actor: 'ai';
    type: 'thinking';
}
interface ToolUseMsg {
    actor: 'ai';
    type: 'tool_use';
    id: string;
    name: string;
    input: unknown;
}
interface ToolResultMsg {
    actor: 'user';
    type: 'tool_result';
    tool_use_id: string;
    content?: unknown;
}
interface ImageMsg {
    type: 'image';
    image: { url?: string; base64data?: string; mimeType?: string };
}

type AnyMsg = TextMsg | ThinkMsg | ToolUseMsg | ToolResultMsg | ImageMsg;

function isText(msg: unknown): msg is TextMsg {
    return !!msg && (msg as Record<string, unknown>).type === 'text';
}
function isThinking(msg: unknown): msg is ThinkMsg {
    return !!msg && (msg as Record<string, unknown>).type === 'thinking';
}
function isToolUse(msg: unknown): msg is ToolUseMsg {
    return !!msg && (msg as Record<string, unknown>).type === 'tool_use';
}
function isToolResult(msg: unknown): msg is ToolResultMsg {
    return !!msg && (msg as Record<string, unknown>).type === 'tool_result';
}
function isImage(msg: unknown): msg is ImageMsg {
    return !!msg && (msg as Record<string, unknown>).type === 'image';
}

export class OpenCodeLanguageModel implements LanguageModel {
    readonly id: string;
    readonly name: string;
    readonly vendor: string;
    readonly model: string;
    readonly status = { status: 'ready' as const };
    private _apiKey: string;
    private _endpoint: string;
    maxInputTokens?: number;
    maxOutputTokens?: number;

    constructor(desc: OpenCodeModelDescription, apiKey: string) {
        this.id = desc.id;
        this.model = desc.model;
        this._apiKey = apiKey;
        this._endpoint = normalizeEndpoint(desc.endpoint);
        this.maxInputTokens = desc.maxInputTokens;
        this.maxOutputTokens = desc.maxOutputTokens;
        this.name = desc.model;
        this.vendor = desc.vendor || 'OpenCode';
    }

    updateApiKey(key: string): void {
        this._apiKey = key;
    }

    async request(userRequest: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelTextResponse | LanguageModelStreamResponse> {
        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
        }

        const endpoint = this.getEndpoint();
        console.log(`[OpenCode] Request for model '${this.id}' -> endpoint: ${endpoint}, model name: ${this.model}`);

        if (endpoint.includes('/messages')) {
            console.log('[OpenCode] Using Anthropic Messages format');
            return this.requestAnthropic(userRequest, endpoint, cancellationToken);
        }
        console.log('[OpenCode] Using OpenAI Chat format');
        return this.requestOpenAIChat(userRequest, endpoint, cancellationToken);
    }

    private getEndpoint(): string {
        return this._endpoint;
    }

    private async requestOpenAIChat(
        userRequest: UserRequest,
        endpoint: string,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelTextResponse | LanguageModelStreamResponse> {
        const messages = this.toOpenAIChatMessages(userRequest.messages);
        const tools = this.toOpenAIChatTools(userRequest.tools);

        const body: Record<string, unknown> = {
            model: this.model,
            messages,
            stream: true
        };

        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        if (userRequest.response_format?.type === 'json_object') {
            body.response_format = { type: 'json_object' };
        }

        if (userRequest.settings) {
            Object.assign(body, userRequest.settings);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this._apiKey}`
            },
            body: JSON.stringify(body),
            signal: cancellationToken ? this.toAbortSignal(cancellationToken) : undefined
        });

        console.log(`[OpenCode] OpenAI response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OpenCode] API error response body:`, errorText);
            throw new Error(`OpenCode API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
            console.error('[OpenCode] No response body');
            throw new Error('No response body');
        }

        console.log('[OpenCode] Response OK, starting stream');
        return { stream: this.createOpenAIStreamIterator(response.body, cancellationToken) };
    }

    private async requestAnthropic(
        userRequest: UserRequest,
        endpoint: string,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelTextResponse | LanguageModelStreamResponse> {
        const { system, messages } = this.toAnthropicMessages(userRequest.messages);
        const tools = this.toAnthropicTools(userRequest.tools);

        const body: Record<string, unknown> = {
            model: this.model,
            max_tokens: this.maxOutputTokens || 32000,
            messages,
            stream: true
        };

        if (system) {
            body.system = system;
        }

        if (tools && tools.length > 0) {
            body.tools = tools;
        }

        if (userRequest.settings) {
            Object.assign(body, userRequest.settings);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this._apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body),
            signal: cancellationToken ? this.toAbortSignal(cancellationToken) : undefined
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenCode Anthropic API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
            throw new Error('No response body');
        }

        return { stream: this.createAnthropicStreamIterator(response.body, cancellationToken) };
    }

    private async *createOpenAIStreamIterator(
        body: ReadableStream<Uint8Array>,
        cancellationToken?: CancellationToken
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const toolCalls: Map<number, ToolCall> = new Map();

        try {
            while (true) {
                if (cancellationToken?.isCancellationRequested) {
                    return;
                }

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const choice = parsed.choices?.[0];

                        if (choice?.delta?.content) {
                            const part: TextResponsePart = { content: choice.delta.content };
                            if (isLanguageModelStreamResponsePart(part)) {
                                yield part;
                            }
                        }

                        if (choice?.delta?.tool_calls) {
                            for (const tc of choice.delta.tool_calls) {
                                const index: number = tc.index ?? 0;
                                const existing = toolCalls.get(index) || {
                                    function: { name: '', arguments: '' },
                                    finished: false
                                };
                                if (tc.id) {
                                    existing.id = tc.id;
                                }
                                if (tc.function?.name) {
                                    if (!existing.function) {
                                        existing.function = { name: '', arguments: '' };
                                    }
                                    existing.function.name += tc.function.name;
                                }
                                if (tc.function?.arguments) {
                                    if (!existing.function) {
                                        existing.function = { name: '', arguments: '' };
                                    }
                                    existing.function.arguments += tc.function.arguments;
                                }
                                toolCalls.set(index, existing);
                            }
                        }

                        if (choice?.finish_reason === 'tool_calls') {
                            const part: ToolCallResponsePart = {
                                tool_calls: Array.from(toolCalls.values()).map(tc => ({
                                    ...tc,
                                    finished: true
                                }))
                            };
                            if (isLanguageModelStreamResponsePart(part)) {
                                yield part;
                            }
                            toolCalls.clear();
                        }

                        if (parsed.usage) {
                            const part: UsageResponsePart = {
                                input_tokens: parsed.usage.prompt_tokens || 0,
                                output_tokens: parsed.usage.completion_tokens || 0
                            };
                            if (isLanguageModelStreamResponsePart(part)) {
                                yield part;
                            }
                        }
                    } catch {
                        // skip unparseable JSON lines
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    private async *createAnthropicStreamIterator(
        body: ReadableStream<Uint8Array>,
        cancellationToken?: CancellationToken
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const toolCalls: Map<number, ToolCall> = new Map();

        try {
            while (true) {
                if (cancellationToken?.isCancellationRequested) {
                    return;
                }

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();

                    if (trimmed.startsWith('event: ')) {
                        continue;
                    }

                    if (!trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6);
                    try {
                        const parsed = JSON.parse(data);

                        switch (parsed.type) {
                            case 'content_block_start': {
                                const block = parsed.content_block;
                                if (block?.type === 'tool_use') {
                                    const index = toolCalls.size;
                                    toolCalls.set(index, {
                                        id: block.id,
                                        function: { name: block.name, arguments: '' },
                                        finished: false
                                    });
                                }
                                break;
                            }
                            case 'content_block_delta': {
                                const delta = parsed.delta;
                                if (delta?.type === 'text_delta') {
                                    const part: TextResponsePart = { content: delta.text };
                                    if (isLanguageModelStreamResponsePart(part)) {
                                        yield part;
                                    }
                                } else if (delta?.type === 'input_json_delta') {
                                    const lastTc = Array.from(toolCalls.values()).pop();
                                    if (lastTc?.function) {
                                        lastTc.function.arguments += delta.partial_json;
                                    }
                                }
                                break;
                            }
                            case 'content_block_stop': {
                                const toolCallsArray = Array.from(toolCalls.values());
                                if (toolCallsArray.length > 0 && toolCallsArray.some(tc => tc.function?.name)) {
                                    const part: ToolCallResponsePart = {
                                        tool_calls: toolCallsArray.map(tc => ({
                                            ...tc,
                                            finished: true
                                        }))
                                    };
                                    if (isLanguageModelStreamResponsePart(part)) {
                                        yield part;
                                    }
                                    toolCalls.clear();
                                }
                                break;
                            }
                            case 'message_delta': {
                                if (parsed.usage) {
                                    const part: UsageResponsePart = {
                                        input_tokens: parsed.usage.input_tokens || 0,
                                        output_tokens: parsed.usage.output_tokens || 0
                                    };
                                    if (isLanguageModelStreamResponsePart(part)) {
                                        yield part;
                                    }
                                }
                                break;
                            }
                        }
                    } catch {
                        // skip unparseable JSON lines
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    private toOpenAIChatMessages(messages: LanguageModelMessage[]): Record<string, unknown>[] {
        const result: Record<string, unknown>[] = [];
        const msgs = messages as unknown as AnyMsg[];

        for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];

            if (isThinking(msg)) continue;

            if (isText(msg)) {
                const role = msg.actor === 'ai' ? 'assistant' : msg.actor === 'system' ? 'system' : 'user';
                const entry: Record<string, unknown> = { role, content: msg.text };

                if (msg.actor === 'user') {
                    const nextMsg = msgs[i + 1];
                    if (nextMsg && isImage(nextMsg)) {
                        const content: Record<string, unknown>[] = [{ type: 'text', text: msg.text }];
                        if (nextMsg.image.url) {
                            content.push({ type: 'image_url', image_url: { url: nextMsg.image.url } });
                        } else if (nextMsg.image.base64data) {
                            content.push({
                                type: 'image_url',
                                image_url: { url: `data:${nextMsg.image.mimeType || 'image/png'};base64,${nextMsg.image.base64data}` }
                            });
                        }
                        entry.content = content;
                    }
                }
                result.push(entry);
            } else if (isToolUse(msg)) {
                result.push({
                    role: 'assistant',
                    tool_calls: [{
                        id: msg.id,
                        type: 'function',
                        function: {
                            name: msg.name,
                            arguments: typeof msg.input === 'string' ? msg.input : JSON.stringify(msg.input)
                        }
                    }]
                });
            } else if (isToolResult(msg)) {
                result.push({
                    role: 'tool',
                    tool_call_id: msg.tool_use_id,
                    content: typeof msg.content === 'string'
                        ? msg.content
                        : msg.content !== undefined && typeof msg.content === 'object'
                            ? JSON.stringify(msg.content)
                            : ''
                });
            }
        }

        return result;
    }

    private toOpenAIChatTools(tools: UserRequest['tools']): Record<string, unknown>[] | undefined {
        if (!tools || tools.length === 0) return undefined;
        return tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }

    private toAnthropicMessages(messages: LanguageModelMessage[]): {
        system: string;
        messages: Record<string, unknown>[];
    } {
        const result: Record<string, unknown>[] = [];
        let systemContent = '';
        const msgs = messages as unknown as AnyMsg[];

        for (const msg of msgs) {
            if (isThinking(msg)) continue;

            if (isText(msg)) {
                if (msg.actor === 'system') {
                    systemContent += msg.text + '\n';
                } else {
                    result.push({
                        role: msg.actor === 'ai' ? 'assistant' : 'user',
                        content: msg.text
                    });
                }
            } else if (isToolUse(msg)) {
                let input: unknown = msg.input;
                if (typeof input === 'string') {
                    try { input = JSON.parse(input); } catch { /* keep as string */ }
                }
                result.push({
                    role: 'assistant',
                    content: [{
                        type: 'tool_use',
                        id: msg.id,
                        name: msg.name,
                        input
                    }]
                });
            } else if (isToolResult(msg)) {
                let content: unknown = msg.content;
                if (content !== undefined && typeof content !== 'string') {
                    content = JSON.stringify(content);
                }
                result.push({
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: msg.tool_use_id,
                        content
                    }]
                });
            }
        }

        return {
            system: systemContent.trim() || 'You are a helpful AI assistant.',
            messages: result
        };
    }

    private toAnthropicTools(tools: UserRequest['tools']): Record<string, unknown>[] | undefined {
        if (!tools || tools.length === 0) return undefined;
        return tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters
        }));
    }

    private toAbortSignal(cancellationToken: CancellationToken): AbortSignal {
        const controller = new AbortController();
        cancellationToken.onCancellationRequested(() => controller.abort());
        return controller.signal;
    }
}
