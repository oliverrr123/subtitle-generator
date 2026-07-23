#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_DIR="${SUBGEN_APP_DIR:-/Applications}"

mkdir -p "$APP_DIR"

make_app() {
  local app_name="$1"
  local shell_script="$2"
  local bundle_id="$3"
  local app_path="$APP_DIR/$app_name.app"
  local apple_script

  apple_script="do shell script quoted form of \"$shell_script\""
  rm -rf "$app_path"
  osacompile -o "$app_path" -e "$apple_script"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $bundle_id" "$app_path/Contents/Info.plist" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $bundle_id" "$app_path/Contents/Info.plist"
  codesign --force --deep --sign - "$app_path" >/dev/null
}

make_app "Start Subgen" "$SCRIPT_DIR/start-subgen.sh" "local.subgen.start"
make_app "Stop Subgen" "$SCRIPT_DIR/stop-subgen.sh" "local.subgen.stop"

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
"$LSREGISTER" -f "$APP_DIR/Start Subgen.app" "$APP_DIR/Stop Subgen.app"

echo "Installed Start Subgen and Stop Subgen in $APP_DIR"
