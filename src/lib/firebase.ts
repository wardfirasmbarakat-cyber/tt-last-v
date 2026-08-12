import { initializeApp, getApps, getApp, setLogLevel } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Mute internal Firebase gRPC idle stream warnings
setLogLevel("error");

// Initialize Firebase app as a strict singleton
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize services cleanly without duplicate instances
let dbInstance;
const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)" ? firebaseConfig.firestoreDatabaseId : undefined;
try {
  dbInstance = dbId
    ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, dbId)
    : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch (e) {
  dbInstance = dbId
    ? getFirestore(app, dbId)
    : getFirestore(app);
}

export const db = dbInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || "";

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  console.warn(`Firestore Warning/Error [${operationType}] path='${path}':`, JSON.stringify(errInfo));

  if (
    errCode === "unavailable" ||
    errCode === "resource-exhausted" ||
    errCode === "permission-denied" ||
    errMessage.includes("unavailable") ||
    errMessage.includes("offline") ||
    errMessage.includes("permission") ||
    errMessage.includes("Quota limit exceeded") ||
    errMessage.includes("Quota exceeded") ||
    errMessage.includes("resource-exhausted") ||
    errMessage.includes("free daily read units") ||
    errMessage.includes("Could not reach Cloud Firestore") ||
    errMessage.includes("didn't respond") ||
    errMessage.includes("Backend didn't respond")
  ) {
    console.warn(`Firestore connectivity or permission notice [${operationType}] path='${path}'; operating in fallback mode.`);
    return;
  }

  console.error(`[Firestore Error] ${operationType} on ${path}:`, errMessage);
}

export async function loginWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    return null;
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  }
}

