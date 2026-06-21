# Agent Instructions

## Build Notes

### Rebuilding after changes

After modifying any Theia extension in `theia-extensions/`, you MUST regenerate the `lib/` and `src-gen/` directories before the app will reflect those changes. Run:

```sh
# 1. Build all extensions (compiles TypeScript → lib/)
yarn build:extensions

# 2. Rebuild the electron app (regenerates lib/backend, lib/frontend, src-gen/)
cd applications/electron && yarn build
```

Simply running `yarn build:extensions` without rebuilding the application will NOT make the changes visible at runtime — the application bundles its own copy of the extension output.

If the app has previously crashed or entered an inconsistent state (unexplained errors, module-not-found errors), delete the stale build artifacts before rebuilding:

```sh
rm -rf applications/electron/lib applications/electron/src-gen
# then rebuild as above
```

### Symlink for zumito-extension VS Code plugin

The `plugins/zumito-extension` directory is a symlink to `../zumito-cli/extension/` (the VS Code extension). If missing, recreate it:

```sh
ln -s ../../zumito-cli/extension plugins/zumito-extension
```
