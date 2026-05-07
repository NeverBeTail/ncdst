import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, setDoc, getDoc, doc, deleteDoc, updateDoc, serverTimestamp, writeBatch, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase/config';
import { Merchant, AuditLog } from './types';
import { handleFirestoreError, OperationType, isFirestoreQuotaError } from './firebase/errorHandler';

export function useMerchants() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 실시간 동기화 효율을 높이기 위해 리스너를 한 번만 연결하고 로컬 캐시를 활용합니다.
    // onSnapshot은 변경된 문서의 차이점(diff)만 가져오므로 전체 재조회보다 효율적입니다.
    const q = query(
      collection(db, 'merchants'),
      orderBy('updatedAt', 'desc')
    );
    
    // includeMetadataChanges를 통해 캐시 상태 변화를 감지할 수 있습니다.
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const data: Merchant[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Merchant);
      });
      
      setMerchants(data);
      setLoading(false);
    }, (error: any) => {
      if (isFirestoreQuotaError(error)) {
        console.warn('Firestore Quota exceeded. Using cached data if available.');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'merchants');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Note: removing triggerWebhook from individual DB calls
  // we will handle auto-sync when merchants data array updates.
  const addMerchant = async (merchant: Omit<Merchant, 'id'>) => {
    try {
      const newDocRef = doc(collection(db, 'merchants'));
      const timestamp = serverTimestamp();
      await setDoc(newDocRef, {
        ...merchant,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'merchants');
    }
  };

  const addMerchants = async (newMerchants: Omit<Merchant, 'id'>[]) => {
    if (!newMerchants.length) return;
    try {
      // Firestore batch size limit is 500
      const CHUNK_SIZE = 500;
      for (let i = 0; i < newMerchants.length; i += CHUNK_SIZE) {
        const chunk = newMerchants.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        const timestamp = serverTimestamp();
        chunk.forEach(merchant => {
          const newDocRef = doc(collection(db, 'merchants'));
          batch.set(newDocRef, {
            ...merchant,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        });
        await batch.commit();
      }
    } catch (error: any) {
      if (isFirestoreQuotaError(error)) {
        console.error('Batch upload failed: Resource exhausted.');
        throw new Error('데이터 처리 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
      }
      handleFirestoreError(error, OperationType.CREATE, 'merchants/batch');
    }
  };

  const updateMerchant = async (id: string, updates: Partial<Omit<Merchant, 'id'>>) => {
    try {
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'merchants', id), {
          ...updates,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `merchants/${id}`);
    }
  };

  const deleteMerchant = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'merchants', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `merchants/${id}`);
    }
  };

  const deleteMerchants = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(id => {
          batch.delete(doc(db, 'merchants', id));
        });
        await batch.commit();
      }
    } catch (error: any) {
      if (isFirestoreQuotaError(error)) {
        throw new Error('삭제 실패: 데이터 처리 한도를 초과했습니다.');
      }
      handleFirestoreError(error, OperationType.DELETE, `merchants/batch`);
    }
  };

  return { merchants, loading, addMerchant, addMerchants, updateMerchant, deleteMerchant, deleteMerchants };
}

export function useSettings() {
  const [assignees, setAssignees] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'app');
    const unsubscribe = onSnapshot(settingsRef, { includeMetadataChanges: true }, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setAssignees(data.assignees || []);
      } else {
        // Init if not exists
        setDoc(settingsRef, { assignees: [] }).catch(e => console.error(e));
      }
      setLoading(false);
    }, (error: any) => {
      if (isFirestoreQuotaError(error)) {
        console.warn('Settings fetch failed due to quota. Using cache.');
      } else {
        handleFirestoreError(error, OperationType.GET, 'settings/app');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const updateAssignees = async (newAssignees: string[]) => {
    try {
      await setDoc(doc(db, 'settings', 'app'), {
        assignees: newAssignees
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/app');
    }
  };

  return { assignees, loading, updateAssignees };
}

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'merchants_audit'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: AuditLog[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
      });
      setLogs(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'merchants_audit');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const addLog = async (log: Omit<AuditLog, 'id' | 'timestamp'>) => {
    try {
      const newDocRef = doc(collection(db, 'merchants_audit'));
      await setDoc(newDocRef, {
        ...log,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Audit log failed:', error);
    }
  };

  return { logs, loading, addLog };
}
