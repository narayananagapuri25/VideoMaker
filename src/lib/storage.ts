import type { StudioProject } from "../types";

const DB_NAME = "sochozara-studio";
const STORE_NAME = "projects";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support local project storage."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

export async function saveProject(project: StudioProject): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...project, updatedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save project."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Project save was cancelled."));
  });
  db.close();
}

export async function loadLatestProject(): Promise<StudioProject | null> {
  const db = await openDatabase();
  const project = await new Promise<StudioProject | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const items = request.result as StudioProject[];
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(items[0] ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not load saved project."));
  });
  db.close();
  return project;
}