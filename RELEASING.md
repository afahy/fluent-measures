# Maintainer release runbook

<!-- cspell:words runbook mktemp -->

This is the canonical process for releasing `@afahy/fluent-measures` and its verified
GitHub Pages documentation. Follow it for each stable version. Merging a PR does not publish
npm or deploy docs. npm publication and documentation promotion are **not atomic**: the public
site can continue to identify the previous verified release while npm has the new version.

## Prerequisites and boundaries

- Use a release ticket, a reviewed version PR, and a clean checkout of this repository with
  `origin` pointing to `afahy/fluent-measures`. Run commands from the repository root.
  Run each step in order and stop on any failed command; do not paste later steps after a failure.
- Use Node 24, the `packageManager` version of pnpm, Git, and authenticated GitHub CLI (`gh`).
  Have the maintainer's normal npm publishing access and 2FA available. Do not put credentials
  in this repository or pass them to an agent. Check that npm's default and `@afahy` scope
  registry configuration select `https://registry.npmjs.org` before publication.
- Keep the release ticket's record of the version PR, full merged SHA, successful main CI URL,
  local validation and tarball integrity, explicit publication approval, registry result, tag and docs run URL.
- Agents may prepare the version PR and run validation. **Publishing npm needs separate,
  explicit maintainer approval naming the exact version and full commit SHA.** Permission to
  implement a ticket, merge a PR or follow this runbook is not publication approval.
- Never push `main` as part of release, use `--follow-tags`/`--tags`, force a tag, republish a
  version, or rewrite `verified-docs`. Serialize releases with the maintainer; the CLI is not
  a distributed lock or an approval service.

The bounded guard supports stable `X.Y.Z` versions and full 40-character commit SHAs.
`pnpm release <version> <sha>` is an alias for **validation only**. It no longer publishes.
`release:publish` requires the same inputs and `--approved`; that flag acknowledges recorded
approval and does not grant it. Pass the integrity from the release ticket after this flag
to pin the upload to that independent record. No command creates a version PR or changes repository settings.

## 1. Prepare and review a version PR

Start from current main on a branch for the release ticket, following `AGENTS.md`. Substitute
that ticket's actual branch name below; do not work directly on main.

```bash
git fetch --no-tags origin main
git switch -c afahy/release-ticket origin/main
pnpm install --frozen-lockfile
pnpm exec changeset status
pnpm release:version
git diff -- package.json pnpm-lock.yaml CHANGELOG.md .changeset
pnpm check
```

`release:version` runs `changeset version` and `pnpm install`. Changesets consumes the pending
changesets and updates versions and changelogs; the install reconciles the lockfile. Review all
of those changes, including removed changesets, against the release ticket. Do not hand-edit
the version or use publication as a way to prepare it. Do not create or push a release tag yet.

Commit the reviewed changes with a Conventional Commit, push only the ticket branch, and open
a PR using `.github/pull_request_template.md` with the release ticket's `Fixes` line. Follow
normal reviews and required checks. Merge the PR under `AGENTS.md`; do not bypass protection.
A green PR run is not the required main run.

## 2. Record the merged SHA and verify its main CI

Record the merge commit, not the version branch's pre-merge head and not whichever commit main
happens to point to later. Set these shell variables to the reviewed PR and version:

```bash
release_pr=123 # Replace with the merged version PR number.
release_version=0.3.0 # Replace with the version in that PR.
release_sha="$(gh pr view "$release_pr" --repo afahy/fluent-measures --json mergeCommit --jq '.mergeCommit.oid')"
gh pr view "$release_pr" --repo afahy/fluent-measures --json state,mergeCommit,url
gh run list --repo afahy/fluent-measures --workflow ci.yml --branch main --event push \
  --commit "$release_sha" --limit 1 --json headSha,headBranch,event,status,conclusion,url
```

Confirm the PR is merged and the latest **CI** run is for that exact SHA, `main`, and the `push`
event, with `status: completed` and `conclusion: success`. Wait for completion or fix failures
through another PR and select a new approved release commit. Do not substitute a successful
run on a different SHA. Save the successful run URL on the release ticket. The release CLI
checks these same fields using `gh`, failing closed on a missing, running or failed run.

A push to `main` runs only CI's `test` and `package` jobs. Mutation testing runs again in step 3's
`pnpm check`. The docs audit runs only on pull requests and in the Nightly workflow
(`nightly.yml`). So also find a successful Nightly run on `main` whose head SHA is the release
commit or a later commit, and save its URL on the release ticket:

```bash
gh run list --repo afahy/fluent-measures --workflow nightly.yml --branch main --status completed \
  --limit 5 --json headSha,conclusion,url
```

If the latest such run failed, fix the failure through a PR before you release. If none has run
since the release commit, start one with `gh workflow run nightly.yml --ref main` and wait for it.

## 3. Fetch the validated release candidate

After CI passes on the merged version commit, **Prepare release candidate** checks out that exact
SHA on a clean runner. It runs the frozen install and full `pnpm check`, packs the build, installs
the archive in an empty consumer, checks its files and metadata, and tests the installed package.
The run summary names the version, source SHA, npm SHA-512 digest, main CI run and candidate run.
Only a version change on main produces an artifact. Nightly verification in step 2 still applies.

Open the successful candidate summary for the version PR's merge SHA. Copy the candidate run ID
into `candidate_run` and the displayed SHA-512 into `release_integrity`. Record both on the
release ticket with the summary link. From a new clone, use the command from that summary:

```bash
release_checkout="../fluent-measures-release-$release_version"
git clone https://github.com/afahy/fluent-measures.git "$release_checkout"
cd "$release_checkout"
git switch --detach "$release_sha"
pnpm release:fetch "$release_version" "$release_sha" "$candidate_run" "$release_integrity"
```

The fetch checks the clean source, main ancestry, exact-SHA main CI and candidate workflow run.
It verifies the downloaded package name, version, commit and archive bytes against the digest,
then saves the tarball and record together in the checkout's Git directory. Keep this checkout
for publication. If the 14-day artifact expires, re-run the successful candidate workflow and
check its digest against the release record. A failed candidate needs investigation before release.

For manual clean-checkout validation, run `pnpm release:validate "$release_version" "$release_sha"`.
It performs the same checks and saves the same files. Record the output and digest on the ticket.
Use this fallback for a version commit that predates the candidate workflow.

For a reviewed version commit that predates artifact preparation (including 0.3.1), use the
guard from a separate clean checkout of its reviewed, merged tooling commit. Run both commands
from the detached release checkout. Set `release_guard` to the absolute path of
`.github/scripts/release.mjs` in the tooling checkout and use
`node "$release_guard" validate "$release_version" "$release_sha"` in this step and
`node "$release_guard" publish "$release_version" "$release_sha" --approved "$release_integrity"` in step 4.
All builds, tests, Git checks and packing use the release checkout as their working directory.
Record the tooling SHA with the release record.

## 4. Obtain publication approval, then publish

Ask the maintainer to approve this concrete statement on the release ticket:

> Publish `@afahy/fluent-measures@<version>` to npm from `<full merged SHA>`. The version PR is
> merged, the exact main CI run succeeded, and the clean release checkout passed validation.

Include the PR/CI links, validation result and tarball integrity. Wait for an explicit answer. Approval for an
earlier version or SHA does not cover a different one. After approval, from the same checkout:

```bash
# On the maintainer's Mac, use the signed-in Google Chrome profile for npm 2FA.
npm_config_browser='Google Chrome' pnpm release:publish "$release_version" "$release_sha" --approved "$release_integrity"
```

Run publication with terminal input, output and error attached. Redirecting output or piping it
through `tee` prevents interactive authentication. On macOS the guard defaults to Google Chrome;
set `npm_config_browser` to override it. Elsewhere, omit the macOS browser setting to use
npm's normal browser. Press Enter when npm prompts and complete 2FA in the signed-in browser.

The guard rechecks the clean source, main ancestry, exact-SHA CI
and version/tag availability. It verifies the stored archive against the recorded package,
version, commit and SHA-512 digest, then passes those exact bytes to `npm publish` with
lifecycle scripts disabled. It verifies the version and integrity reported by the public
registry before creating an annotated tag on the approved commit. While npm processes an accepted
upload, the guard retries exact-version 404 reads with backoff for up to five minutes.

Only that exact tag is pushed, with an explicit source/destination ref and `--no-follow-tags`
even if local Git configuration enables following tags. No branch is pushed. The tag push skips
the pre-push hook because the stronger checks already passed before npm; a second hook failure
must not strand an otherwise completed publish. Server-side push failures still fail the command.
Another PR may advance main during publication: the approved SHA remains the release source,
and the tag push still works without changing main. Never update to the newer main mid-release.

A nonzero exit after publication starts can mean npm succeeded but a later step failed.
Do not simply repeat the publish command; use the recovery section below.

## 5. Verify documentation deployment

The tag push triggers **Request release documentation** (`release-docs.yml`), which dispatches
**Deploy to GitHub Pages** (`deploy-docs.yml`) on main with the exact version. Main is the workflow
execution context required by the Pages environment; the docs' API content comes from the release
commit, not main. The dispatcher has no Pages access and publishes no npm package.

```bash
gh run list --repo afahy/fluent-measures --workflow release-docs.yml --limit 5
gh run list --repo afahy/fluent-measures --workflow deploy-docs.yml --limit 5
```

Inspect the matching runs, including the deployment run's requested `version`, and record their
URLs. The deployment must complete all of these stages:

1. Export the tag's merged commit and verify its package name/version. Build with its frozen
   lockfile and install the exact npm package with scripts disabled. Compare npm integrity,
   `gitHead` when present, all distributed files and consumer metadata against the source build;
   run the release's package examples and rendered-document checks.
2. Audit the docs and retain the verified artifact in `verified-docs`, preserving every previous
   version directory byte-for-byte and rejecting older promotions or changed bytes for an
   existing version. This branch is an append-only artifact ledger, not a release branch.
3. Upload and deploy Pages, then compare the public responses with the exact uploaded artifact,
   including all retained versions. The workflow's public verification step must succeed.

Confirm the root aliases and versioned references identify the intended version and full SHA:

```bash
site=https://afahy.github.io/fluent-measures
curl --fail --silent --show-error "$site/release.json"
curl --fail --silent --show-error "$site/llms.txt"
curl --fail --silent --show-error "$site/versions/$release_version/release.json"
curl --fail --silent --show-error "$site/versions/$release_version/llms.txt"
curl --fail --silent --show-error "$site/versions.json"
```

Check `version` and `revision` in both `release.json` files, and the package version and source
revision link in both `llms.txt` files, against the release record. Open the HTML, README and
parsing links for that version. The npm badge may show a newer registry version; it is separate
from the documented version. If a later release has since been promoted, the root should name
that newer release while this release's versioned URLs must retain the recorded content.

## Recovery: do not republish or rewrite history

### Publication failed or its outcome is uncertain

Check the registry before retrying, using the explicit public registry:

```bash
npm view "@afahy/fluent-measures@$release_version" --json --registry=https://registry.npmjs.org
```

A timeout or authentication/network error does not establish absence. Confirm the registry is
reachable and its version list does not contain the intended version. Only if publication truly
did not happen may the maintainer authorize another attempt for the same version/SHA after the
cause is fixed. Reuse the validated archive from step 3. If its files are missing or damaged,
repeat step 3 in a fresh checkout and check the digest against the release record. If source changes are needed, prepare a reviewed commit
and obtain approval for its new SHA. If the version exists, proceed below; do not rerun publish.

### npm succeeded but the tag is missing or has not been pushed

Use the validated checkout and the digest recorded before upload. If you lost the checkout,
repeat `release:fetch` in a clean clone to restore the CI validation record and archive.
Fetch works after publication. Resume requires the local record to bind the archive to the
approved commit.

```bash
pnpm release:resume "$release_version" "$release_sha" --approved "$release_integrity"
```

Resume performs registry reads, checks the actual downloaded npm tarball against the approved
digest, and finishes the single release tag. It never uploads a package. A matching remote tag
completes the command. An existing local tag and any remote tag must resolve to the approved SHA. A mismatch stops recovery. If the registry still reports the version missing, leave
the release pending and retry resume later. Continue with the docs checks in step 5.

### Docs verification, deployment or public verification failed

Keep npm and the release tag intact. Diagnose the failed stage. A failed package/content check
must not be bypassed to deploy the site. A failed Pages deployment can leave `verified-docs`
ahead of the live site. After correcting an operational problem, dispatch verification again:

```bash
gh workflow run deploy-docs.yml --repo afahy/fluent-measures --ref main \
  --field "version=$release_version"
```

This re-verifies the published version and ordering before deployment; it never publishes npm.
An identical rerun is safe. A stale release cannot replace a newer retained release. Do not
rewrite the ledger to make a rerun pass.

For a delivery-only problem after deployment, download that run's exact `github-pages` artifact
and retry its read-only public checks. Substitute the deployment run ID:

```bash
docs_run=123 # Replace with the actual deployment run ID.
artifact_dir="$(mktemp -d)"
gh run download "$docs_run" --repo afahy/fluent-measures --name github-pages --dir "$artifact_dir"
mkdir "$artifact_dir/expected"
tar -xf "$artifact_dir/artifact.tar" -C "$artifact_dir/expected"
node .github/scripts/docs-verify-public.mjs "$artifact_dir/expected"
```

Never rebuild the expected public artifact from newer main. Public verification can detect a
bad delivery but cannot roll back a completed deployment.

### Already-published version or artifact mismatch

Stop promotion and preserve the evidence, npm version, release tag and retained archive. A
matching version string alone is not enough: the source, package bytes and metadata must match.
Investigate the mismatch with the maintainer. Correct source changes require a new version PR,
new successful main CI, clean validation and new publication approval. Never overwrite an npm
version, move a released tag, or edit an archived version to make verification pass.

## Completion checklist

- [ ] Reviewed version/changelog/lockfile PR merged; version and full release SHA recorded.
- [ ] Latest main push CI for that exact SHA succeeded; URL recorded.
- [ ] Fresh clean release checkout passed full validation; tested tarball integrity recorded.
- [ ] Explicit maintainer npm approval names the version and SHA.
- [ ] npm serves the recorded tarball integrity at that version; only its matching release tag was pushed.
- [ ] Matching docs dispatch/deploy and public verification succeeded; run URLs recorded.
- [ ] Root and versioned `release.json`/`llms.txt` identify the expected version and source.
- [ ] Release ticket records completion or the precise recovery stage still outstanding.
