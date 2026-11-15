"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createEncryptionSetup,
  decryptString,
  encryptString,
  unlockWithPassword,
  unlockWithRecoveryKey,
  type EncryptionBundle,
} from "./crypto";

type E2eeContextValue = {
  ready: boolean;
  dek: CryptoKey | null;
  bundle: EncryptionBundle | null;
  hasBundle: boolean;
  needsUnlock: boolean;
  needsSetup: boolean;
  refreshBundle: () => Promise<EncryptionBundle | null>;
  setupWithPassword: (password: string) => Promise<string>;
  unlockPassword: (password: string) => Promise<void>;
  unlockRecovery: (recoveryKey: string) => Promise<void>;
  lock: () => void;
  encryptContent: (plaintext: string) => Promise<{ ciphertext: string; iv: string }>;
  decryptContent: (ciphertext: string, iv: string) => Promise<string>;
};

const E2eeContext = createContext<E2eeContextValue | null>(null);

export function E2eeProvider({ children }: { children: ReactNode }) {
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [bundle, setBundle] = useState<EncryptionBundle | null>(null);
  const [fetched, setFetched] = useState(false);

  const refreshBundle = useCallback(async () => {
    const res = await fetch("/api/encryption-key", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load encryption key.");
    const data = (await res.json()) as { bundle: EncryptionBundle | null };
    setBundle(data.bundle);
    setFetched(true);
    return data.bundle;
  }, []);

  const setupWithPassword = useCallback(async (password: string) => {
    const { bundle: nextBundle, dek: nextDek, recoveryKey } =
      await createEncryptionSetup(password);
    const res = await fetch("/api/encryption-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextBundle),
    });
    if (!res.ok) throw new Error("Failed to save encryption key.");
    setBundle(nextBundle);
    setDek(nextDek);
    setFetched(true);
    return recoveryKey;
  }, []);

  const unlockPassword = useCallback(
    async (password: string) => {
      let b = bundle;
      if (!b) b = await refreshBundle();
      if (!b) throw new Error("No encryption key found.");
      const nextDek = await unlockWithPassword(password, b);
      setDek(nextDek);
    },
    [bundle, refreshBundle],
  );

  const unlockRecovery = useCallback(
    async (recoveryKey: string) => {
      let b = bundle;
      if (!b) b = await refreshBundle();
      if (!b) throw new Error("No encryption key found.");
      const nextDek = await unlockWithRecoveryKey(recoveryKey, b);
      setDek(nextDek);
    },
    [bundle, refreshBundle],
  );

  const lock = useCallback(() => setDek(null), []);

  const encryptContent = useCallback(
    async (plaintext: string) => {
      if (!dek) throw new Error("Notes are locked.");
      return encryptString(plaintext, dek);
    },
    [dek],
  );

  const decryptContent = useCallback(
    async (ciphertext: string, iv: string) => {
      if (!dek) throw new Error("Notes are locked.");
      return decryptString(ciphertext, iv, dek);
    },
    [dek],
  );

  const value = useMemo<E2eeContextValue>(
    () => ({
      ready: fetched,
      dek,
      bundle,
      hasBundle: Boolean(bundle),
      needsUnlock: fetched && Boolean(bundle) && !dek,
      needsSetup: fetched && !bundle,
      refreshBundle,
      setupWithPassword,
      unlockPassword,
      unlockRecovery,
      lock,
      encryptContent,
      decryptContent,
    }),
    [fetched, dek, bundle, refreshBundle, setupWithPassword, unlockPassword, unlockRecovery, lock, encryptContent, decryptContent],
  );

  return <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>;
}

export function useE2ee() {
  const ctx = useContext(E2eeContext);
  if (!ctx) throw new Error("useE2ee must be used within E2eeProvider");
  return ctx;
}

export function useOptionalE2ee() {
  return useContext(E2eeContext);
}
