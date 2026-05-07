import { auth } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isFirestoreQuotaError(error: any): boolean {
  if (!error) return false;
  
  // Custom JSON error check
  if (error.message) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error && (parsed.error.includes('Quota exceeded') || parsed.error.includes('quota-exceeded'))) {
        return true;
      }
    } catch {
      // Not JSON, continue to other checks
    }
  }

  // Raw Firebase error checks
  const message = error.message || String(error);
  return (
    error.code === 'resource-exhausted' ||
    message.includes('Quota exceeded') ||
    message.includes('quota-exceeded') ||
    message.includes('resource-exhausted')
  );
}
