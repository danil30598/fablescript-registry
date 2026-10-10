#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
INSTALL_ROOT="$HOME/Library/Application Support/FableScript"
RUNTIME_TARGET="$INSTALL_ROOT/runtime"
BIN_TARGET="$HOME/.local/bin"

find_vscode_node() {
  for candidate in \
    "/Applications/Visual Studio Code.app/Contents/MacOS/Electron" \
    "$HOME/Applications/Visual Studio Code.app/Contents/MacOS/Electron" \
    "/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron" \
    "$HOME/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron"
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

VSCODE_NODE=$(find_vscode_node) || {
  echo "VS Code не найден в папке Applications. Установите VS Code и повторите запуск." >&2
  exit 1
}

mkdir -p "$RUNTIME_TARGET" "$BIN_TARGET"
rm -rf "$RUNTIME_TARGET/native-modules"
cp "$PROJECT_ROOT/runtime/engine.js" "$RUNTIME_TARGET/engine.js"
cp "$PROJECT_ROOT/runtime/module-loader.js" "$RUNTIME_TARGET/module-loader.js"
cp "$PROJECT_ROOT/runtime/package-manager.js" "$RUNTIME_TARGET/package-manager.js"
cp "$PROJECT_ROOT/runtime/cli.js" "$RUNTIME_TARGET/cli.js"
cp "$PROJECT_ROOT/runtime/builder.js" "$RUNTIME_TARGET/builder.js"
cp "$PROJECT_ROOT/runtime/console-input.js" "$RUNTIME_TARGET/console-input.js"
cp -R "$PROJECT_ROOT/runtime/native-modules" "$RUNTIME_TARGET/native-modules"
rm -f "$RUNTIME_TARGET/native-modules/window-host.py"

cat > "$BIN_TARGET/fable" <<EOF
#!/bin/sh
export ELECTRON_RUN_AS_NODE=1
exec "$VSCODE_NODE" "$RUNTIME_TARGET/cli.js" "\$@"
EOF
chmod 755 "$BIN_TARGET/fable"

PROFILE="$HOME/.zprofile"
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
touch "$PROFILE"
if ! grep -Fqx "$PATH_LINE" "$PROFILE"; then
  printf '\n%s\n' "$PATH_LINE" >> "$PROFILE"
fi

echo "FableScript CLI установлен: $BIN_TARGET/fable"
echo "Откройте новое окно Terminal и выполните: fable install window"
