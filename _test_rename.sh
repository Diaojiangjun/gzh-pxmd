export GITHUB_REF_NAME="v1.0.1"
set -e
VER="${GITHUB_REF_NAME#v}"
BASE="TreasureGzhEditor"
rename() { if [ -f "$1" ]; then mv -f -- "$1" "$2"; fi; }

for f in *; do
  case "$f" in
    *mac*|*dmg|*MacOS*) rename "$f" "${BASE}-macOS-${VER}$(echo "$f" | grep -q arm64 && echo '-arm64' || echo '-x64')$(echo "$f" | grep -q '\.zip' && echo '.zip' || echo '.dmg')" ;;
    *.AppImage)        rename "$f" "${BASE}-linux-${VER}-x86_64.AppImage" ;;
    *.deb)             rename "$f" "${BASE}-linux-${VER}-amd64.deb" ;;
    Setup*.exe)        rename "$f" "${BASE}-Setup-${VER}-x64.exe" ;;
    *.exe)             rename "$f" "${BASE}-${VER}-x64-portable.exe" ;;
  esac
done
echo "--- 重命名后 ---"
ls -1