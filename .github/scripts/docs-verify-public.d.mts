export interface DocsArtifact {
  revision: string;
  documents: Record<string, string>;
}
export function readDocsArtifact(directory: string): DocsArtifact;
export function verifyPublicDocs(
  artifact: DocsArtifact,
  options?: {
    fetchImpl?: typeof fetch;
    sleepImpl?: (ms: number) => Promise<unknown>;
    report?: (message: string) => void;
    attempts?: number;
    timeoutMs?: number;
    delayMs?: number;
  }
): Promise<void>;
