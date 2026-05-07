import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, setDoc, getDoc, doc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase/config';
import { Merchant } from './types';
import { handleFirestoreError, OperationType } from './firebase/errorHandler';

export function useMerchants() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'merchants'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Merchant[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Merchant);
      });
      setMerchants(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'merchants');
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
    } catch (error) {
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
      const batch = writeBatch(db);
      ids.forEach(id => {
        batch.delete(doc(db, 'merchants', id));
      });
      await batch.commit();
    } catch (error) {
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
    const unsubscribe = onSnapshot(settingsRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setAssignees(data.assignees || []);
      } else {
        // Init if not exists
        setDoc(settingsRef, { assignees: [] }).catch(e => console.error(e));
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/app');
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
