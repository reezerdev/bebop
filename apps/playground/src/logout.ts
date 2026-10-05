type LocalJazzDb = {
  shutdown: (options?: { waitForSync?: boolean }) => Promise<void>;
  logout: (options?: { wipeData?: boolean }) => Promise<void>;
};

/** Finish sign-out when Jazz cannot synchronize pending local writes. */
export async function signOutWithLocalFallback(logout: () => Promise<void>, db: LocalJazzDb): Promise<boolean> {
  let leftWritesLocal = false;
  try {
    // useJazzAuth().logout() deliberately swallows failures in this Jazz pin.
    // Perform the same sync barrier here so we can handle its error explicitly.
    await db.shutdown({ waitForSync: true });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "GracefulShutdownSyncError") throw error;
    // Closing without wipeData retains IndexedDB for the same account's next login.
    await db.logout();
    leftWritesLocal = true;
  }

  await logout();
  return leftWritesLocal;
}
