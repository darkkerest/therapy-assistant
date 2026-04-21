#!/bin/bash
# Run this ONCE after dragging Therapy Assistant to /Applications.
# It removes the macOS quarantine flag so the app can launch without Gatekeeper blocks.
# This is needed because the app is not signed with an Apple Developer ID.

APP="/Applications/Therapy Assistant.app"

if [ ! -d "$APP" ]; then
    osascript -e 'display dialog "Сначала перетащи Therapy Assistant в папку Applications, потом запусти этот файл ещё раз." buttons {"OK"} default button 1 with icon stop'
    exit 1
fi

xattr -cr "$APP" 2>/dev/null
xattr -dr com.apple.quarantine "$APP" 2>/dev/null

osascript -e 'display dialog "Готово! Therapy Assistant можно запускать из папки Applications." buttons {"Открыть"} default button 1 with icon note'
open "$APP"
