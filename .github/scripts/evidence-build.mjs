// Records failures as evidence instead of hiding a failed install/build behind `|| true`.
// Each invocation uses the pnpm that the workflow set up from this revision's package.json.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [directory, diagnosticsPath, sizePath, setup, requireInstall] = process.argv.slice(2);
// The old head setup step failed the job on setup/install failure. Base failures, builds and
// measurements remain informational, as in the old size step. Always write diagnostics first.
const installationFailure = () => {
  if (requireInstall === '--require-install') process.exitCode = 1;
};
const diagnostics = [];

/** @param {string[]} args @param {boolean} capture */
function run(args, capture = false) {
  return spawnSync('pnpm', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** @param {ReturnType<typeof run>} result */
function failure(result) {
  return result.error?.message ?? `exit ${result.status} (${result.signal ?? 'no signal'})`;
}

if (setup !== 'success') {
  installationFailure();
  diagnostics.push(
    `pnpm setup unavailable (${setup}); install, build and size measurement were not run.`
  );
} else {
  const install = run(['install', '--frozen-lockfile']);
  if (install.error || install.status !== 0) {
    installationFailure();
    diagnostics.push(
      `dependency installation unavailable (${failure(install)}); build and size measurement were not run. See the build step logs.`
    );
  } else {
    const build = run(['build']);
    if (build.error || build.status !== 0) {
      diagnostics.push(
        `build unavailable (${failure(build)}); corpus replay and size measurement are unavailable. See the build step logs.`
      );
    } else {
      const measure = run(['exec', 'size-limit', '--json'], true);
      // Going over a budget exits nonzero but still supplies usable measurements.
      writeFileSync(sizePath, measure.stdout ?? '');
      let valid = false;
      try {
        const sizes = JSON.parse(measure.stdout);
        valid =
          Array.isArray(sizes) &&
          sizes.length > 0 &&
          sizes.every(entry => typeof entry.name === 'string' && Number.isFinite(entry.size));
      } catch {
        // The diagnostic below makes missing or malformed output explicit in the summary.
      }
      if (!valid)
        diagnostics.push(
          `size measurement unavailable (${failure(measure)}); no valid sizes were recorded. See the build step logs.`
        );
    }
  }
}
writeFileSync(diagnosticsPath, JSON.stringify(diagnostics));
