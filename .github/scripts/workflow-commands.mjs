// GitHub reads a workflow command, such as `::error file=<path>,line=<n>::<message>`, from one log
// line. A pull request controls its file names, which can hold any character but NUL. So the
// scripts escape each name with GitHub's rules, as `@actions/core` does (AFA-79).

/**
 * Escapes text for the message of a workflow command: "%", CR and LF.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeData(text) {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * Escapes text for a property of a workflow command, such as `file=`: also ":" and ",".
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeProperty(text) {
  return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/**
 * Writes CR and LF in text for a plain log line as `\r` and `\n`, so the text can't start a new
 * line that GitHub could read as a workflow command.
 *
 * @param {string} text
 * @returns {string}
 */
export function logText(text) {
  return text.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}
