import type { StudioProject } from "../types";

const DB_NAME = "sochozara-studio";
const STORE_NAME = "projects";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
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
    request.onsuccess = () => {
      const db = request.result;
      // Release old connections before a future IndexedDB schema upgrade.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

export async function saveProject(project: StudioProject): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ ...project, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the project. Your browser may be low on storage."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Project save was cancelled."));
    });
  } finally {
    db.close();
  }
}

export async function loadLatestProject(): Promise<StudioProject | null> {
  const db = await openDatabase();
  try {
    return await new Promise<StudioProject | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const items = (request.result as StudioProject[])
          .filter((item) => item && typeof item.id === "string" && Number.isFinite(item.updatedAt));
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(items[0] ?? null);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not load the saved project."));
    });
  } finally {
    db.close();
  }
}
