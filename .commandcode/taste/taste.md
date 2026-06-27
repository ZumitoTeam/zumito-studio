# zumito-cli
- Import zumito-cli as a package and call its functions directly instead of shelling out via terminal. Confidence: 0.80

# workflow
- After modifying Theia extensions in theia-extensions/, delete applications/electron/lib and applications/electron/src-gen before rebuilding to avoid stale build artifacts. Confidence: 0.85

# architecture
- VS Code extensions for this project live as symlinks in plugins/ pointing to their source directories (e.g., plugins/zumito-extension -> ../../zumito-cli/extension). Do not copy them. Confidence: 0.75
- New Theia extensions go in theia-extensions/ following the monorepo pattern (package.json with theiaExtensions field, tsconfig extending configs/base.tsconfig.json). Confidence: 0.75

# workflow
- When working with symlinked extensions in plugins/, read and edit files directly from their source directory (e.g., ../zumito-cli/extension/) rather than through the workspace symlink path, since the symlink target is outside the workspace. Confidence: 0.65

# architecture
- Distinguish between two types of modules in the zumito ecosystem: internal modules (bot modules within a project, the current system) and external modules (npm packages installed as dependencies and registered in zumito.config.ts). Both must coexist and function together. Confidence: 0.80

# ux
- Prefer native IDE UI (QuickPick dialogs, webviews, modal notifications) over opening terminals for user-facing interactions in VS Code/Theia extensions. For complex configuration/management workflows, use WebView panels instead of sequential QuickPick/InputBox dialogs. Confidence: 0.80
- For configuration/editing workflows in WebViews, use separate panels/tabs for detail screens instead of inline expandable sections within a single list view. When user needs to edit an item, open a new panel focused on that item's details. Confidence: 0.70
- For array-type configuration values in WebView config editors, use a list-based/key-value editor instead of a plain text input, with type validation based on the schema. Confidence: 0.70

# theia
- In Theia WebViews, register `onDidReceiveMessage` listener AFTER setting `panel.webview.html`, and use a `{ type: 'ready' }` message from the WebView to trigger the initial data push. Theia processes messages differently than VS Code. Confidence: 0.75
- In Theia WebViews, use `.then()` chains instead of async/await in the `onDidReceiveMessage` handler callback for better compatibility. Confidence: 0.60
- In Theia WebView HTML template strings, prefer DOM API (document.createElement + property assignment) over innerHTML string concatenation for dynamic content. Multi-layer escaping through Node.js template literals → HTML → inline JavaScript frequently breaks, causing scripts not to execute or attribute values to be incorrectly placed outside HTML attributes. Confidence: 0.70

# architecture
- Translation JSON files in module translation directories can be nested in subdirectories (e.g., translations/command/prefix/en.json), not just flat at the top level. Always recursively scan subdirectories when loading translations. Confidence: 0.65

# code-style
- Avoid using `sourceFile.formatText()` from ts-morph after targeted edits — it reformats the entire file, causing unintended whitespace/style changes across unrelated code. Instead, use surgical text replacements that only touch the target area. Confidence: 0.75

# ux
- For translation decoration hints in the editor, place them at the end of the line using `after` renderOptions with `contentText` (e.g., `// English value`) rather than using `hoverMessage`. Confidence: 0.70
- Provide an "Edit translation" option in the context menu that opens the translation's source JSON file. Confidence: 0.65
- The "Edit translation" context menu item and code action (lightbulb) should only appear on lines that contain a `trans()` call, not on every line of TypeScript files. Confidence: 0.80
- For embed field values that can contain concatenations of mixed types (literal text + trans() + variable), use inline labels/inputs within a unified text field rather than separate tag pills. This supports complex patterns like text+trans+text+trans. Confidence: 0.70
