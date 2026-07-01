import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

export async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const absolutePath =
    path.resolve(filePath);

  await fs.mkdir(
    path.dirname(absolutePath),
    {
      recursive: true,
    },
  );

  const temporaryPath =
    `${absolutePath}.${process.pid}.tmp`;

  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );

  await fs.rename(
    temporaryPath,
    absolutePath,
  );
}
