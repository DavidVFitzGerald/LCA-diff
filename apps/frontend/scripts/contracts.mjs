import { URL } from "node:url";
import process from "node:process";
import console from "node:console";
import openapiTS, { astToString } from "openapi-typescript";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const input = new URL("../../api/openapi.json", import.meta.url);
const output = new URL(
  "../../../packages/contracts/openapi.ts",
  import.meta.url,
);
const generated = astToString(await openapiTS(input));
const bytes =
  "// Generated from apps/api/openapi.json. Do not edit.\n" + generated;
if (process.argv.includes("--check")) {
  const directory = await mkdtemp(join(tmpdir(), "lca-contracts-"));
  try {
    const candidate = join(directory, "openapi.ts");
    await writeFile(candidate, bytes);
    if (!(await readFile(candidate)).equals(await readFile(output))) {
      console.error(
        "Generated contracts have drifted. Run npm run contracts:generate.",
      );
      process.exitCode = 1;
    }
  } finally {
    await rm(directory, { recursive: true });
  }
} else await writeFile(output, bytes);
