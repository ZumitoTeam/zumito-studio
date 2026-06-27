import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';

interface ServiceOption extends QuickPickItem {
    importPath: string;
    className: string;
    propertyName?: string;
}

const COMMON_SERVICES: ServiceOption[] = [
    {
        label: 'TranslationManager',
        description: 'zumito-framework',
        detail: 'Translation and i18n service',
        importPath: 'zumito-framework',
        className: 'TranslationManager',
    },
    {
        label: 'DatabaseManager',
        description: 'zumito-framework',
        detail: 'ORM and database access',
        importPath: 'zumito-framework',
        className: 'DatabaseManager',
    },
    {
        label: 'ErrorHandler',
        description: 'zumito-framework',
        detail: 'Centralized error handling',
        importPath: 'zumito-framework',
        className: 'ErrorHandler',
    },
    {
        label: 'GuildDataGetter',
        description: 'zumito-framework',
        detail: 'Guild settings from DB',
        importPath: 'zumito-framework',
        className: 'GuildDataGetter',
    },
    {
        label: 'TextFormatter',
        description: 'zumito-framework',
        detail: 'Text formatting utilities',
        importPath: 'zumito-framework',
        className: 'TextFormatter',
    },
    {
        label: 'FileManager',
        description: '@zumito-team/file-manager',
        detail: 'Abstract file storage',
        importPath: '@zumito-team/file-manager',
        className: 'FileManager',
    },
    {
        label: 'LocalFileManager',
        description: '@zumito-team/local-filesystem',
        detail: 'Local filesystem storage',
        importPath: '@zumito-team/local-filesystem',
        className: 'LocalFileManager',
    },
    {
        label: 'S3FileManager',
        description: '@zumito-team/s3-assets',
        detail: 'S3-compatible storage',
        importPath: '@zumito-team/s3-assets',
        className: 'S3FileManager',
    },
];

@injectable()
export class ZumitoCodeActionContribution implements FrontendApplicationContribution {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @postConstruct()
    protected init(): void {
        this.registerCodeActionProvider();
    }

    onStart(_app: FrontendApplication): void { }

    private registerCodeActionProvider(): void {
        monaco.languages.registerCodeActionProvider('typescript', {
            provideCodeActions: (model, range, _context, _token) => {
                const actions: monaco.languages.CodeAction[] = [];

                if (!range) {
                    return { actions, dispose: () => { } };
                }

                const lines = model.getLinesContent();
                const startLine = range.startLineNumber;

                let inConstructor = false;
                for (let i = Math.max(0, startLine - 1); i < Math.min(lines.length, startLine + 1); i++) {
                    if (/^\s*(public\s+|private\s+|protected\s+)?constructor\s*\(/.test(lines[i])) {
                        inConstructor = true;
                        break;
                    }
                }

                if (inConstructor) {
                    const action: monaco.languages.CodeAction = {
                        title: 'Inject Service',
                        kind: 'refactor.extract',
                        isPreferred: true,
                        command: {
                            id: 'zumito.injectService',
                            title: 'Inject Service',
                        },
                    };
                    actions.push(action);
                }

                return { actions, dispose: () => { } };
            },
        });
    }
}

export function executeInjectService(
    editor: MonacoEditor,
    quickInputService: QuickInputService
): void {
    const model = editor.getControl().getModel();
    if (!model) return;

    quickInputService.showQuickPick(COMMON_SERVICES, {
        placeholder: 'Select a service to inject',
        canSelectMany: false,
    }).then((selected) => {
        if (!selected) return;

        const service = selected as ServiceOption;
        const paramName = service.propertyName ||
            service.className.charAt(0).toLowerCase() + service.className.slice(1);

        const lines = model.getLinesContent();
        const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];

        // Find last import line
        let lastImportLine = 0;
        for (let i = 0; i < lines.length; i++) {
            if (/^import\s/.test(lines[i])) {
                lastImportLine = i;
            }
        }

        // Find constructor
        let ctorLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/^\s*(public\s+|private\s+|protected\s+)?constructor\s*\(/.test(lines[i])) {
                ctorLine = i;
                break;
            }
        }

        // Add import for the service
        const hasServiceImport = lines.some(l =>
            l.includes(`from '${service.importPath}'`) || l.includes(`from "${service.importPath}"`)
        );
        const hasSCImport = lines.some(l =>
            l.includes('ServiceContainer') && l.includes('zumito-framework')
        );

        const importLines: string[] = [];
        if (!hasServiceImport) {
            importLines.push(`import { ${service.className} } from '${service.importPath}';`);
        }
        if (!hasSCImport) {
            importLines.push(`import { ServiceContainer } from 'zumito-framework';`);
        }
        if (importLines.length > 0) {
            edits.push({
                range: {
                    startLineNumber: lastImportLine + 1,
                    startColumn: 1,
                    endLineNumber: lastImportLine + 1,
                    endColumn: 1,
                },
                text: importLines.join('\n') + '\n',
            });
        }

        // Add constructor parameter
        if (ctorLine >= 0) {
            const ctorText = lines[ctorLine];
            const openParen = ctorText.indexOf('(');
            const closeParen = ctorText.lastIndexOf(')');

            if (openParen >= 0 && closeParen >= 0) {
                const inner = ctorText.substring(openParen + 1, closeParen).trim();
                const hasParam = ctorText.includes(paramName);
                if (!hasParam) {
                    const indent = ctorText.match(/^\s*/)?.[0] || '    ';
                    const newParam = inner
                        ? `,\n${indent}    private readonly ${paramName}: ${service.className} = ServiceContainer.get(${service.className})`
                        : `\n${indent}    private readonly ${paramName}: ${service.className} = ServiceContainer.get(${service.className}),\n${indent}`;

                    edits.push({
                        range: {
                            startLineNumber: ctorLine + 1,
                            startColumn: closeParen + 1,
                            endLineNumber: ctorLine + 1,
                            endColumn: closeParen + 1,
                        },
                        text: newParam,
                    });
                }
            }
        }

        if (edits.length > 0) {
            model.pushEditOperations([], edits, () => null);
        }
    });
}
