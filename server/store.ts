import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";
import type { PromoCode, StoreData } from "./types";

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const storePath = path.join(dataDir, "store.json");
const githubToken = process.env.GITHUB_TOKEN;
const githubRepo = process.env.GITHUB_REPO;
const githubBranch = process.env.GITHUB_BRANCH || "main";

let writeQueue = Promise.resolve();

export async function readStore(): Promise<StoreData> {
  const raw = await readTextFile("data/store.json");
  return repairMojibake(JSON.parse(raw.replace(/^\uFEFF/, ""))) as StoreData;
}

export async function writeStore(nextStore: StoreData) {
  writeQueue = writeQueue.then(() => writeTextFile("data/store.json", `${JSON.stringify(nextStore, null, 2)}\n`));
  await writeQueue;
}

export async function updateStore(mutator: (store: StoreData) => void | Promise<void>) {
  const store = await readStore();
  await mutator(store);
  await writeStore(store);
  return store;
}

export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeUsername(username: string) {
  return username.trim().replace(/^@/, "").toLowerCase();
}

export function findPromo(promocodes: PromoCode[], code: string) {
  const normalized = normalizeCode(code);
  return promocodes.find((promo) => promo.active && promo.code === normalized);
}

export async function savePublicFile(relativePath: string, bytes: Buffer) {
  const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");

  if (useGithubStorage()) {
    await writeGithubFile(normalizedPath, bytes.toString("base64"), `Upload ${normalizedPath}`, true);
    return `https://raw.githubusercontent.com/${githubRepo}/${githubBranch}/${normalizedPath}`;
  }

  const filePath = path.join(rootDir, normalizedPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
  return `/${normalizedPath.replace(/^public\//, "")}`;
}

function useGithubStorage() {
  return Boolean(githubToken && githubRepo);
}

async function readTextFile(relativePath: string) {
  if (!useGithubStorage()) {
    return readFile(path.join(rootDir, relativePath), "utf8");
  }

  const data = await readGithubFile(relativePath);
  return Buffer.from(data.content, "base64").toString("utf8");
}

async function writeTextFile(relativePath: string, content: string) {
  if (!useGithubStorage()) {
    await mkdir(dataDir, { recursive: true });
    await writeFile(storePath, content, "utf8");
    return;
  }

  await writeGithubFile(relativePath, Buffer.from(content, "utf8").toString("base64"), `Update ${relativePath}`, false);
}

async function readGithubFile(relativePath: string) {
  const response = await githubRequest(`/repos/${githubRepo}/contents/${encodeURIComponentPath(relativePath)}?ref=${githubBranch}`, {
    method: "GET",
  });
  return (await response.json()) as { content: string; sha: string };
}

async function writeGithubFile(relativePath: string, base64Content: string, message: string, binary: boolean) {
  let sha: string | undefined;
  try {
    sha = (await readGithubFile(relativePath)).sha;
  } catch {
    sha = undefined;
  }

  const response = await githubRequest(`/repos/${githubRepo}/contents/${encodeURIComponentPath(relativePath)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: githubBranch,
      sha,
      committer: {
        name: "Direallised Bot",
        email: "bot@direallised.local",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ${binary ? "upload" : "write"} failed: ${text}`);
  }
}

async function githubRequest(pathname: string, init: RequestInit) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok && init.method === "GET") {
    const text = await response.text();
    throw new Error(`GitHub read failed: ${text}`);
  }

  return response;
}

function encodeURIComponentPath(relativePath: string) {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

function looksLikeMojibake(value: string) {
  return /(?:Р[’“”џґµ°ёѕє»ЊЅ±ќњЎў]|С[Ѓ‹„ЂЊЏЌ])|вЂ/.test(value);
}

function repairString(value: string) {
  if (!looksLikeMojibake(value)) return value;
  try {
    return iconv.encode(value, "win1251").toString("utf8");
  } catch {
    return value;
  }
}

function repairMojibake(value: unknown): unknown {
  if (typeof value === "string") return repairString(value);
  if (Array.isArray(value)) return value.map((item) => repairMojibake(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, repairMojibake(entry)]));
  }
  return value;
}
