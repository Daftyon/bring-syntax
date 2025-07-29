// src/extension.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Bring Language Support is now active!');

    // Register validation command
    const validateCommand = vscode.commands.registerCommand('bring.validateFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        if (editor.document.languageId !== 'bring') {
            vscode.window.showErrorMessage('This command only works with Bring files');
            return;
        }

        validateBringFile(editor.document);
    });

    // Register format command
    const formatCommand = vscode.commands.registerCommand('bring.formatDocument', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        if (editor.document.languageId !== 'bring') {
            vscode.window.showErrorMessage('This command only works with Bring files');
            return;
        }

        formatBringDocument(editor);
    });

    // Register document symbol provider
    const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
        { language: 'bring' },
        new BringDocumentSymbolProvider()
    );

    // Register completion provider
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'bring' },
        new BringCompletionProvider(),
        '=', '@', '{', '['
    );

    // Register hover provider
    const hoverProvider = vscode.languages.registerHoverProvider(
        { language: 'bring' },
        new BringHoverProvider()
    );

    // Add to subscriptions
    context.subscriptions.push(
        validateCommand,
        formatCommand,
        symbolProvider,
        completionProvider,
        hoverProvider
    );

    // Show welcome message
    vscode.window.showInformationMessage('🚀 Bring Language Support loaded!');
}

function validateBringFile(document: vscode.TextDocument) {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip comments and empty lines
        if (line.startsWith('#') || line === '') {
            continue;
        }

        // Check for unterminated strings
        if ((line.includes('"') && line.split('"').length % 2 === 0) ||
            (line.includes("'") && line.split("'").length % 2 === 0)) {
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(i, 0, i, line.length),
                'Unterminated string',
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
        }

        // Check for invalid attribute syntax
        const attrMatch = line.match(/@(\w+)=([^@\s]+)/g);
        if (attrMatch) {
            attrMatch.forEach(attr => {
                if (!attr.match(/@\w+=(true|false|\d+(\.\d+)?|"[^"]*"|'[^']*')/)) {
                    const startPos = line.indexOf(attr);
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(i, startPos, i, startPos + attr.length),
                        'Invalid attribute syntax',
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostics.push(diagnostic);
                }
            });
        }
    }

    // Clear existing diagnostics and set new ones
    const collection = vscode.languages.createDiagnosticCollection('bring');
    collection.set(document.uri, diagnostics);

    if (diagnostics.length === 0) {
        vscode.window.showInformationMessage('✅ Bring file is valid!');
    } else {
        vscode.window.showWarningMessage(`⚠️ Found ${diagnostics.length} issue(s) in Bring file`);
    }
}

function formatBringDocument(editor: vscode.TextEditor) {
    const document = editor.document;
    const text = document.getText();
    const lines = text.split('\n');
    const formatted: string[] = [];
    let indentLevel = 0;
    const indentSize = 4; // 4 spaces

    for (let line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (trimmed === '' || trimmed.startsWith('#')) {
            formatted.push(line);
            continue;
        }

        // Decrease indent for closing braces/brackets
        if (trimmed === '}' || trimmed === ']') {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        // Add formatted line with proper indentation
        formatted.push(' '.repeat(indentLevel * indentSize) + trimmed);

        // Increase indent for opening braces/brackets
        if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
            indentLevel++;
        }
    }

    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length)
    );

    editor.edit(editBuilder => {
        editBuilder.replace(fullRange, formatted.join('\n'));
    });

    vscode.window.showInformationMessage('✅ Bring document formatted!');
}

class BringDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Schema definitions
            const schemaMatch = line.match(/^schema\s+(\w+)\s*\{/);
            if (schemaMatch) {
                const symbol = new vscode.DocumentSymbol(
                    schemaMatch[1],
                    'Schema',
                    vscode.SymbolKind.Class,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, 0, i, line.length)
                );
                symbols.push(symbol);
            }

            // Key-value pairs
            const kvMatch = line.match(/^(\w+)\s*(?:@[^=]*=[^@\s]*\s*)*=\s*/);
            if (kvMatch) {
                const symbol = new vscode.DocumentSymbol(
                    kvMatch[1],
                    'Property',
                    vscode.SymbolKind.Property,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, 0, i, line.length)
                );
                symbols.push(symbol);
            }
        }

        return symbols;
    }
}

class BringCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        // Common attribute completions
        const attributes = [
            { name: 'required', detail: 'Mark field as required' },
            { name: 'default', detail: 'Set default value' },
            { name: 'min', detail: 'Minimum value' },
            { name: 'max', detail: 'Maximum value' },
            { name: 'minLength', detail: 'Minimum string length' },
            { name: 'maxLength', detail: 'Maximum string length' },
            { name: 'format', detail: 'String format validation' },
            { name: 'enum', detail: 'Allowed values list' },
            { name: 'version', detail: 'Version information' },
            { name: 'env', detail: 'Environment variable' },
            { name: 'unit', detail: 'Unit of measurement' }
        ];

        attributes.forEach(attr => {
            const item = new vscode.CompletionItem(`@${attr.name}=`, vscode.CompletionItemKind.Property);
            item.detail = attr.detail;
            item.insertText = new vscode.SnippetString(`@${attr.name}=\${1:value}`);
            items.push(item);
        });

        // Schema types
        const types = ['string', 'number', 'integer', 'float', 'boolean', 'array', 'object'];
        types.forEach(type => {
            const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter);
            item.detail = `${type} type`;
            items.push(item);
        });

        return items;
    }
}

class BringHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return undefined;
        }

        const word = document.getText(range);
        const line = document.lineAt(position.line).text;

        // Hover for schema keyword
        if (word === 'schema') {
            return new vscode.Hover(
                new vscode.MarkdownString(`
**Schema Definition**

Define validation rules for data structures.

\`\`\`bring
schema User {
    id = number @min=1
    name = string @required=true
}
\`\`\`
                `),
                range
            );
        }

        // Hover for attributes
        if (line.includes(`@${word}=`)) {
            const attributeHelp = this.getAttributeHelp(word);
            if (attributeHelp) {
                return new vscode.Hover(
                    new vscode.MarkdownString(attributeHelp),
                    range
                );
            }
        }

        // Hover for types - FIX: Use proper typing
        const typeHelp = this.getTypeHelp(word);
        if (typeHelp) {
            return new vscode.Hover(
                new vscode.MarkdownString(`**${word}** - ${typeHelp}`),
                range
            );
        }

        return undefined;
    }

    private getTypeHelp(type: string): string | undefined {
        const types: Record<string, string> = {
            'string': 'Text data type. Supports escape sequences.',
            'number': 'Numeric data type (integer or float).',
            'integer': 'Whole number data type.',
            'float': 'Decimal number data type.',
            'boolean': 'True/false data type.',
            'array': 'List of values.',
            'object': 'Key-value pairs structure.',
            'null': 'Null/empty value.'
        };

        return types[type];
    }

    private getAttributeHelp(attribute: string): string | undefined {
        const help: Record<string, string> = {
            'required': '**@required** - Mark field as mandatory\n\nExample: `name = string @required=true`',
            'default': '**@default** - Set default value\n\nExample: `active = boolean @default=true`',
            'min': '**@min** - Minimum value/length\n\nExample: `age = number @min=18`',
            'max': '**@max** - Maximum value/length\n\nExample: `port = number @max=65535`',
            'minLength': '**@minLength** - Minimum string length\n\nExample: `username = string @minLength=3`',
            'maxLength': '**@maxLength** - Maximum string length\n\nExample: `name = string @maxLength=50`',
            'format': '**@format** - String format validation\n\nExample: `email = string @format="email"`',
            'enum': '**@enum** - Allowed values list\n\nExample: `role = string @enum=["admin", "user"]`',
            'version': '**@version** - Version information\n\nExample: `app = string @version="1.0.0"`',
            'env': '**@env** - Environment variable\n\nExample: `host = string @env="HOST"`',
            'unit': '**@unit** - Unit of measurement\n\nExample: `timeout = number @unit="seconds"`'
        };

        return help[attribute];
    }
}

export function deactivate() {
    console.log('Bring Language Support deactivated');
}
