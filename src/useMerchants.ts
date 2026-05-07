import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, setDoc, getDoc, doc, deleteDoc, updateDoc, serverTimestamp, writeBatch, orderBy, limit, where } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import { Merchant, AuditLog, AppUser, UserPlan } from './types';
import { handleFirestoreError, OperationType, isFirestoreQuotaError } from './firebase/errorHandler';
import { onAuthStateChanged, User } from 'firebase/auth';

export function useAuth() {
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        // Use onSnapshot for real-time profile updates
        unsubProfile = onSnapshot(userDocRef, async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const isAdminEmail = firebaseUser.email === 'kyungmin.lee@placen.co.kr';
            const profile = { id: firebaseUser.uid, ...data } as AppUser;
            
            // Auto-promote admin email if not already admin
            if (isAdminEmail && (profile.role !== 'admin' || profile.status !== 'active')) {
              await updateDoc(userDocRef, { role: 'admin', status: 'active' });
              // Snapshot will trigger again
            } else {
              setUserProfile(profile);
              setLoading(false);
            }
          } else {
            // New user registration
            const isAdminEmail = firebaseUser.email === 'kyungmin.lee@placen.co.kr';
            const newProfile: Omit<AppUser, 'id'> = {
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              role: isAdminEmail ? 'admin' : 'user',
              status: isAdminEmail ? 'active' : 'pending',
              assignees: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };
            await setDoc(userDocRef, newProfile);
            // Snapshot will pick this up
          }
        }, (error) => {
          console.error("Profile sync error:", error);
          setLoading(false);
        });
      } else {
        setUserProfile(null);
        if (unsubProfile) unsubProfile();
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const updateProfile = async (updates: Partial<AppUser>) => {
    if (!userProfile) return;
    try {
      // Only admin can update role/status of others, but individuals can update their own name/assignees
      // Though here we are updating the current user's profile
      await updateDoc(doc(db, 'users', userProfile.id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userProfile.id}`);
    }
  };

  const approveUser = async (userId: string) => {
    if (userProfile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'active',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/approve`);
    }
  };

  const isAdmin = userProfile?.role === 'admin';
  const isActive = userProfile?.status === 'active';

  return { userProfile, loading, updateProfile, approveUser, isAdmin, isActive };
}

export function useMerchants(userProfile: AppUser | null) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [userPlans, setUserPlans] = useState<Record<string, { date: string, order: number }>>({}); // merchantId -> {date, order}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch if active or admin
    if (!userProfile || (userProfile.status !== 'active' && userProfile.role !== 'admin')) {
      if (userProfile && userProfile.status !== 'active') setLoading(false);
      return;
    }

    const qMerchants = query(
      collection(db, 'merchants'),
      orderBy('updatedAt', 'desc')
    );
    
    const unsubMerchants = onSnapshot(qMerchants, (snapshot) => {
      const data: Merchant[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Merchant);
      });
      setMerchants(data);
      if (!userProfile) setLoading(false); // If no user, we stop loading after merchants (though rules might block read if not signed in)
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'merchants');
      setLoading(false);
    });

    let unsubPlans: () => void = () => {};

    if (userProfile) {
      // Fetch user's personal plans
      const qPlans = query(
        collection(db, 'userPlans'),
        where('userId', '==', userProfile.id)
      );

      unsubPlans = onSnapshot(qPlans, (snapshot) => {
        const plans: Record<string, { date: string, order: number }> = {};
        snapshot.forEach((docSnap) => {
          const planData = docSnap.data();
          plans[planData.merchantId] = { 
            date: planData.plannedDate, 
            order: planData.order || 0 
          };
        });
        setUserPlans(plans);
        setLoading(false);
      }, (error) => {
        console.error('Failed to fetch personal plans:', error);
        setLoading(false);
      });
    }

    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      unsubMerchants();
      unsubPlans();
      clearTimeout(timeout);
    };
  }, [userProfile?.id]);

  // Merge merchants with personal plans
  const mergedMerchants = merchants.map(m => ({
    ...m,
    plannedDate: userPlans[m.id]?.date || '',
    plannedOrder: userPlans[m.id]?.order || 0
  }));

  const updatePlannedDate = async (merchantId: string, plannedDate: string, order: number = 0) => {
    if (!userProfile) return;
    try {
      const planId = `${userProfile.id}_${merchantId}`;
      const planRef = doc(db, 'userPlans', planId);
      
      if (!plannedDate) {
        await deleteDoc(planRef);
      } else {
        await setDoc(planRef, {
          userId: userProfile.id,
          merchantId,
          plannedDate,
          order,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `userPlans/${userProfile.id}_${merchantId}`);
    }
  };

  const batchUpdatePlannedDate = async (merchantIds: string[], plannedDate: string) => {
    console.log('batchUpdatePlannedDate called', { merchantIds, plannedDate });
    if (!userProfile || !merchantIds.length) {
      console.log('batchUpdatePlannedDate aborted', { userProfile: !!userProfile, length: merchantIds.length });
      return;
    }
    try {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < merchantIds.length; i += CHUNK_SIZE) {
        const chunk = merchantIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        const timestamp = serverTimestamp();
        
        chunk.forEach((merchantId, index) => {
          const planId = `${userProfile.id}_${merchantId}`;
          const planRef = doc(db, 'userPlans', planId);
          
          if (!plannedDate) {
            batch.delete(planRef);
          } else {
            batch.set(planRef, {
              userId: userProfile.id,
              merchantId,
              plannedDate,
              order: index, // Default order in batch
              updatedAt: timestamp
            });
          }
        });
        await batch.commit();
        console.log('Batch committed');
      }
    } catch (error) {
      console.error('Batch error', error);
      handleFirestoreError(error, OperationType.WRITE, 'userPlans/batch');
    }
  };

  const updatePlanOrder = async (merchantId: string, order: number) => {
    if (!userProfile) return;
    try {
      const planId = `${userProfile.id}_${merchantId}`;
      await updateDoc(doc(db, 'userPlans', planId), {
        order,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `userPlans/${userProfile.id}_${merchantId}/order`);
    }
  };

  const addMerchant = async (merchant: Omit<Merchant, 'id'>) => {
    if (!userProfile) return;
    try {
      const newDocRef = doc(collection(db, 'merchants'));
      const timestamp = serverTimestamp();
      await setDoc(newDocRef, {
        ...merchant,
        ownerId: userProfile.id,
        ownerName: userProfile.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'merchants');
    }
  };

  const addMerchants = async (newMerchants: Omit<Merchant, 'id'>[]) => {
    if (!newMerchants.length || !userProfile) return;
    try {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < newMerchants.length; i += CHUNK_SIZE) {
        const chunk = newMerchants.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        const timestamp = serverTimestamp();
        chunk.forEach(merchant => {
          const newDocRef = doc(collection(db, 'merchants'));
          batch.set(newDocRef, {
            ...merchant,
            ownerId: userProfile.id,
            ownerName: userProfile.name,
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

  return { 
    merchants: mergedMerchants, 
    loading, 
    addMerchant, 
    addMerchants, 
    updateMerchant, 
    deleteMerchant, 
    deleteMerchants,
    updatePlannedDate,
    batchUpdatePlannedDate,
    updatePlanOrder
  };
}

export function useSettings(userProfile: AppUser | null) {
  const [assignees, setAssignees] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) {
      setLoading(false);
      return;
    }

    // Individual users manage their own assignees
    setAssignees(userProfile.assignees || []);
    setLoading(false);
  }, [userProfile?.assignees]);

  const updateAssignees = async (newAssignees: string[]) => {
    if (!userProfile) return;
    try {
      await updateDoc(doc(db, 'users', userProfile.id), {
        assignees: newAssignees,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userProfile.id}/assignees`);
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

export function useUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('updatedAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: AppUser[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as AppUser);
      });
      setUsers(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { users, loading };
}

export function useAllPlans(isAdmin: boolean) {
  const [plans, setPlans] = useState<UserPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'userPlans'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: UserPlan[] = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() } as UserPlan);
      });
      setPlans(data);
      setLoading(false);
    }, (error) => {
      console.error('Failed to fetch all plans:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [isAdmin]);

  return { plans, loading };
}
