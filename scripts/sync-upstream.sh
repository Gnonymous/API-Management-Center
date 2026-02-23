#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
MIRROR_BRANCH="${MIRROR_BRANCH:-upstream-main}"
CUSTOM_BRANCH="${CUSTOM_BRANCH:-main}"
AUTO_STASH="${AUTO_STASH:-0}"
RUN_CHECKS="${RUN_CHECKS:-1}"
PUSH_CHANGES="${PUSH_CHANGES:-1}"

AUTOSTASH_APPLIED=0
INITIAL_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

info() {
  echo "[sync-upstream] $*"
}

fail() {
  echo "[sync-upstream] ERROR: $*" >&2
  exit 1
}

require_remote() {
  local remote="$1"
  git remote get-url "$remote" >/dev/null 2>&1 || fail "missing git remote: $remote"
}

is_dirty() {
  ! git diff --quiet || ! git diff --cached --quiet
}

restore_autostash() {
  if [[ "$AUTOSTASH_APPLIED" == "1" ]]; then
    info "restoring stashed local changes"
    git stash pop || true
    AUTOSTASH_APPLIED=0
  fi
}

cleanup_on_exit() {
  local exit_code=$?
  if [[ "$exit_code" != "0" ]]; then
    restore_autostash
    if [[ -n "$INITIAL_BRANCH" ]]; then
      git checkout "$INITIAL_BRANCH" >/dev/null 2>&1 || true
    fi
  fi
  exit "$exit_code"
}

trap cleanup_on_exit EXIT

require_remote "$UPSTREAM_REMOTE"
require_remote "$ORIGIN_REMOTE"

if is_dirty; then
  if [[ "$AUTO_STASH" == "1" ]]; then
    info "working tree is dirty, creating temporary stash"
    git stash push -u -m "sync-upstream-$(date +%F-%H%M%S)"
    AUTOSTASH_APPLIED=1
  else
    fail "working tree is dirty; commit/stash first, or run with AUTO_STASH=1"
  fi
fi

info "fetching remotes"
git fetch "$UPSTREAM_REMOTE" --prune
git fetch "$ORIGIN_REMOTE" --prune

if git show-ref --verify --quiet "refs/heads/$MIRROR_BRANCH"; then
  info "updating mirror branch $MIRROR_BRANCH from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  git checkout "$MIRROR_BRANCH"
  git merge --ff-only "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
else
  info "creating mirror branch $MIRROR_BRANCH from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  git checkout -b "$MIRROR_BRANCH" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
fi

if [[ "$PUSH_CHANGES" == "1" ]]; then
  info "pushing mirror branch to $ORIGIN_REMOTE/$MIRROR_BRANCH"
  git push -u "$ORIGIN_REMOTE" "$MIRROR_BRANCH"
fi

info "rebasing $CUSTOM_BRANCH onto $MIRROR_BRANCH"
git checkout "$CUSTOM_BRANCH"
git rebase "$MIRROR_BRANCH"

if [[ "$RUN_CHECKS" == "1" ]]; then
  info "running quality checks"
  npm run lint
  npm run type-check
fi

if [[ "$PUSH_CHANGES" == "1" ]]; then
  info "pushing $CUSTOM_BRANCH to $ORIGIN_REMOTE with force-with-lease"
  git push "$ORIGIN_REMOTE" "$CUSTOM_BRANCH" --force-with-lease
fi

restore_autostash
info "sync completed"
