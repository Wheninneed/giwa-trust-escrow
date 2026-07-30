import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 컴파일 결과에서 ABI 만 뽑아 shared 패키지에 TypeScript 상수로 저장한다.
 * 프론트엔드가 hardhat artifacts 디렉터리에 직접 의존하지 않게 하려는 목적이다.
 */

const here = dirname(fileURLToPath(import.meta.url));
const artifacts = resolve(here, "../artifacts/contracts");
const outDir = resolve(here, "../../shared/src/abi");

const targets = ["MockKRW", "GiwaMilestoneEscrow"] as const;

mkdirSync(outDir, { recursive: true });

for (const name of targets) {
  const artifactPath = resolve(artifacts, `${name}.sol`, `${name}.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: unknown[] };

  const file = [
    "// 이 파일은 `pnpm --filter contracts export-abi` 로 생성됩니다. 직접 수정하지 마세요.",
    `export const ${name}Abi = ${JSON.stringify(artifact.abi, null, 2)} as const;`,
    "",
  ].join("\n");

  writeFileSync(resolve(outDir, `${name}.ts`), file, "utf8");
  console.log(`ABI 저장: ${name} (${artifact.abi.length} entries)`);
}

const indexFile = [
  "// 이 파일은 `pnpm --filter contracts export-abi` 로 생성됩니다. 직접 수정하지 마세요.",
  ...targets.map((name) => `export { ${name}Abi } from "./${name}";`),
  "",
].join("\n");

writeFileSync(resolve(outDir, "index.ts"), indexFile, "utf8");
