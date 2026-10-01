import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type AwsFixtureEvidencePhase = "before" | "during" | "after";

export async function createAwsFixtureEvidence(testName: string, uniqueTag: string) {
  const root = process.env.WMS_AWS_EVIDENCE_DIR ?? path.join("output", "aws-fixture-evidence");
  await mkdir(root, { recursive: true });
  const directory = path.join(root, `${testName}-${uniqueTag.toLowerCase()}`);
  await mkdir(directory, { recursive: false });

  return {
    directory,
    async write(phase: AwsFixtureEvidencePhase, evidence: unknown) {
      await writeFile(path.join(directory, `${phase}.json`), JSON.stringify(evidence, null, 2), {
        encoding: "utf8",
        flag: "wx",
      });
    },
  };
}
