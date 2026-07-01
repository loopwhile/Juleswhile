import { minimatch } from "minimatch";

export function normalizePath(filePath: string): string {
	return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function matchesPattern(filePath: string, pattern: string): boolean {
	const normalizedFile = normalizePath(filePath);

	const normalizedPattern = normalizePath(pattern);

	return minimatch(normalizedFile, normalizedPattern, {
		dot: true,
		nocase: false,
		matchBase: false,
	});
}

export function overlapsPattern(left: string, right: string): boolean {
	const normalizedLeft = normalizePath(left);

	const normalizedRight = normalizePath(right);

	const leftRoot = normalizedLeft
		.replace(/[*?[\]{}()!+@].*$/, "")
		.replace(/\/+$/, "");

	const rightRoot = normalizedRight
		.replace(/[*?[\]{}()!+@].*$/, "")
		.replace(/\/+$/, "");

	if (leftRoot === "" || rightRoot === "") {
		return true;
	}

	return (
		leftRoot === rightRoot ||
		leftRoot.startsWith(`${rightRoot}/`) ||
		rightRoot.startsWith(`${leftRoot}/`)
	);
}
