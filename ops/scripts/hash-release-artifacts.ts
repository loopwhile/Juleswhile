#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUTPUT = "dist/release-hashes.sha256";

async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch {
		return false;
	}
}

async function listFiles(root: string): Promise<string[]> {
	const files: string[] = [];

	async function walk(directory: string): Promise<void> {
		const entries = await fs.readdir(directory, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const entryPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				await walk(entryPath);
				continue;
			}

			if (entry.isFile()) {
				files.push(entryPath);
			}
		}
	}

	try {
		await walk(root);
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return files;
		}

		throw error;
	}

	return files.sort();
}

async function sha256File(filePath: string): Promise<string> {
	const hash = createHash("sha256");
	hash.update(await fs.readFile(filePath));
	return hash.digest("hex");
}

async function main(): Promise<void> {
	const outputPath = process.argv[2] ?? DEFAULT_OUTPUT;
	const candidates = [
		"package-lock.json",
		...(await listFiles("dist")),
	].filter((filePath) => filePath !== outputPath);

	const lines: string[] = [];

	for (const filePath of candidates) {
		if (!(await fileExists(filePath))) {
			continue;
		}

		lines.push(`${await sha256File(filePath)}  ${filePath}`);
	}

	await fs.mkdir(path.dirname(outputPath), {
		recursive: true,
	});

	await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

	console.log(`Wrote ${lines.length} SHA-256 hashes to ${outputPath}`);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
