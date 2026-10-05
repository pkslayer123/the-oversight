// @ontology
// system: build
// description: Build version stamp. Updated by bump-sw-version.sh on every player-facing commit.
// provides:
//   - window.BUILD_VERSION (string)
// rules:
//   - version_synced: true (code: bump-sw-version.sh)
// consumes:
//   - (none documented)
/* Build version — stamped by scripts/bump-sw-version.sh on every player-facing commit.
   Displayed in the title-screen footer so we always know which build is running. */
window.BUILD_VERSION = 'e8fe43b-20261005-223310';
