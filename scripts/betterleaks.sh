#!/usr/bin/env bash
set -euo pipefail

# Betterleaks secret scanner — installer, cacher, and runner.
# Used by pre-commit hook and CI. Auto-downloads if not found on PATH.

# --- Pinned version and checksums ---
# Update these when upgrading. Get checksums from:
# https://github.com/betterleaks/betterleaks/releases/download/vX.Y.Z/checksums.txt
BETTERLEAKS_VERSION="1.1.1"
BETTERLEAKS_SHA256_DARWIN_ARM64="81eb78a8328f9159421855f282a03ad40c2cfeaa7c7a79f4c42308d705be31c4"  # pragma: allowlist secret
BETTERLEAKS_SHA256_DARWIN_X64="9462919fc8b625cc86f5ca216a0ca8366b1492c795f2a52710338e38875078f4"  # pragma: allowlist secret
BETTERLEAKS_SHA256_LINUX_ARM64="97b774367630846a5f2298f7f3e3f8096f0567d3fc0275b1b63c0e1e16f856f1"  # pragma: allowlist secret
BETTERLEAKS_SHA256_LINUX_X64="d590d5f051e49f6769c61dc8cebbce947b20a4042e2915ee234760f81a01c8c4"  # pragma: allowlist secret

# --- Configuration ---
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${REPO_ROOT}/.bin"
BINARY="${BIN_DIR}/betterleaks"
DOWNLOAD_BASE="https://github.com/betterleaks/betterleaks/releases/download"

# --- Helpers ---
die() { printf "ERROR: %s\n" "$*" >&2; exit 1; }

detect_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "${os}" in
    darwin) os="darwin" ;;
    linux)  os="linux" ;;
    *)      die "Unsupported OS: ${os}. Supported: darwin, linux." ;;
  esac

  case "${arch}" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *)             die "Unsupported architecture: ${arch}. Supported: arm64, x64." ;;
  esac

  echo "${os}_${arch}"
}

expected_checksum() {
  local platform="$1"
  case "${platform}" in
    darwin_arm64) echo "${BETTERLEAKS_SHA256_DARWIN_ARM64}" ;;
    darwin_x64)   echo "${BETTERLEAKS_SHA256_DARWIN_X64}" ;;
    linux_arm64)  echo "${BETTERLEAKS_SHA256_LINUX_ARM64}" ;;
    linux_x64)    echo "${BETTERLEAKS_SHA256_LINUX_X64}" ;;
  esac
}

verify_checksum() {
  local file="$1" expected="$2" actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "${file}" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "${file}" | awk '{print $1}')"
  else
    die "Neither sha256sum nor shasum found. Cannot verify checksum."
  fi
  if [ "${actual}" != "${expected}" ]; then
    rm -f "${file}"
    printf "ERROR: Checksum mismatch!\n  Expected: %s\n  Actual:   %s\nThe downloaded binary has been removed.\nThis could indicate a corrupted download or supply chain compromise.\n" "${expected}" "${actual}" >&2
    exit 1
  fi
}

# --- Installation ---
ensure_binary() {
  # 1. Check if available on PATH with matching version (e.g. via brew install betterleaks)
  if command -v betterleaks >/dev/null 2>&1; then
    local system_version
    system_version="$(betterleaks version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" || true
    if [ "${system_version}" = "${BETTERLEAKS_VERSION}" ]; then
      BINARY="$(command -v betterleaks)"
      echo "Using system-installed betterleaks v${system_version}: ${BINARY}"
      return 0
    else
      echo "System betterleaks v${system_version:-unknown} != pinned v${BETTERLEAKS_VERSION}, using cached/downloaded version..."
    fi
  fi

  # 2. Check if already cached and valid
  if [ -x "${BINARY}" ]; then
    local cached_version
    cached_version="$("${BINARY}" version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" || true
    if [ "${cached_version}" = "${BETTERLEAKS_VERSION}" ]; then
      return 0
    fi
    echo "Cached binary v${cached_version:-unknown} != pinned v${BETTERLEAKS_VERSION}, re-downloading..."
    rm -f "${BINARY}"
  fi

  # 3. Download
  local platform tarball url expected_sha
  platform="$(detect_platform)"
  tarball="betterleaks_${BETTERLEAKS_VERSION}_${platform}.tar.gz"
  url="${DOWNLOAD_BASE}/v${BETTERLEAKS_VERSION}/${tarball}"
  expected_sha="$(expected_checksum "${platform}")"

  echo "Downloading betterleaks v${BETTERLEAKS_VERSION} for ${platform}..."
  mkdir -p "${BIN_DIR}"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${url}" -o "${BIN_DIR}/${tarball}" || die "Download failed. Install manually: brew install betterleaks"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "${url}" -O "${BIN_DIR}/${tarball}" || die "Download failed. Install manually: brew install betterleaks"
  else
    die "Neither curl nor wget found. Install manually: brew install betterleaks"
  fi

  # 4. Verify checksum of tarball
  verify_checksum "${BIN_DIR}/${tarball}" "${expected_sha}"

  # 5. Extract
  tar -xzf "${BIN_DIR}/${tarball}" -C "${BIN_DIR}" betterleaks
  rm -f "${BIN_DIR}/${tarball}"
  chmod +x "${BINARY}"

  echo "Installed betterleaks v${BETTERLEAKS_VERSION} to ${BINARY}"
}

# --- Main ---
usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [flags]

Commands:
  pre-commit    Scan staged files (for git hooks)
  scan          Scan full git history
  help          Show this help

Examples:
  ./scripts/betterleaks.sh pre-commit
  ./scripts/betterleaks.sh scan
  ./scripts/betterleaks.sh scan --log-opts="main..HEAD"
EOF
}

main() {
  local cmd="${1:-help}"
  shift || true

  ensure_binary

  case "${cmd}" in
    pre-commit)
      echo "→ Scanning staged files for secrets..."
      "${BINARY}" git --pre-commit --redact --staged --verbose -c "${REPO_ROOT}/.betterleaks.toml" "${REPO_ROOT}" "$@"
      ;;
    scan)
      echo "→ Scanning git history for secrets..."
      "${BINARY}" git --redact --verbose -c "${REPO_ROOT}/.betterleaks.toml" "${REPO_ROOT}" "$@"
      ;;
    help|--help|-h)
      usage
      ;;
    *)
      die "Unknown command: ${cmd}. Run with 'help' for usage."
      ;;
  esac
}

main "$@"
