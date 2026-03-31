import { 
  collection, 
  doc, 
  getDocs, 
  writeBatch,
  query,
  limit,
  where,
  orderBy,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db as firestore, auth } from '../firebase';
import { db as local, setTransactions, getTransactions, isDataLoaded } from '../lib/db';
import { CompanyDetails } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 🔥 STEP 1: FIX FIRESTORE QUERY
export const fetchTransactions = async (userId: string, collectionName: string = 'sales') => {
  console.time("fetch");
  if (!userId) return [];

  const path = `users/${userId}/${collectionName}`;
  const colRef = collection(firestore, 'users', userId, collectionName);
  const q = query(
    colRef,
    orderBy("date", "desc"),
    limit(50)
  );

  try {
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.timeEnd("fetch");
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
};

// 🔥 STEP 3: USE CACHE INSTEAD OF REFETCH
export const loadTransactions = async (userId: string) => {
  if (isDataLoaded()) {
    return getTransactions(); // instant load
  }

  const data = await fetchTransactions(userId);
  setTransactions(data);

  return data;
};

const BATCH_SIZE = 500; // Reduced for faster commit
const PULL_BATCH_SIZE = 50; // 🔥 STEP 7: Ensure limit(50) is used

export class SyncService {
  private userId: string | null = null;
  private isSyncing = false;
  private syncInterval: any = null;
  private collections = ['customers', 'suppliers', 'products', 'employees', 'sales', 'purchases', 'cash'];

  setUserId(userId: string) {
    this.userId = userId;
  }

  /**
   * Pulls updates from Firestore for all collections in parallel.
   * Uses updatedAt to fetch only new/changed records.
   */
  async initialSync() {
    if (!this.userId || this.isSyncing) return;
    
    try {
      this.isSyncing = true;
      console.log('Starting sync pull...');

      // Pull settings first as it's critical
      await this.syncSettings();

      // Pull all other collections in parallel
      await Promise.all(this.collections.map(col => this.syncCollection(col)));

      // Update global last sync time
      await local.syncMetadata.put({ id: 'lastSync', lastSync: new Date().toISOString() });
      
      console.log('Sync pull complete');
    } catch (error) {
      console.error('Error during sync pull:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncSettings() {
    if (!this.userId) return;
    const path = `users/${this.userId}/settings`;
    const settingsRef = collection(firestore, 'users', this.userId, 'settings');
    const q = query(settingsRef, limit(1));
    try {
      const snapshot = await getDocs(q);
      const companyDoc = snapshot.docs.find(d => d.id === 'company');
      if (companyDoc) {
        await local.settings.put({ id: 'companyDetails', data: companyDoc.data() as CompanyDetails });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  /**
   * Syncs a single collection from Firestore to local DB.
   * Loops until all updates are fetched.
   */
  private async syncCollection(colName: string) {
    if (!this.userId) return;

    try {
      const syncMeta = await local.syncMetadata.get(`lastSync_${colName}`);
      let lastSync = syncMeta?.lastSync || new Date(0).toISOString();
      let hasMore = true;
      let totalFetched = 0;

      while (hasMore) {
        const path = `users/${this.userId}/${colName}`;
        const colRef = collection(firestore, 'users', this.userId, colName);
        const q = query(
          colRef, 
          where('updatedAt', '>', lastSync),
          orderBy('updatedAt', 'asc'),
          limit(PULL_BATCH_SIZE)
        );

        try {
          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            hasMore = false;
            break;
          }

          const items = snapshot.docs.map(doc => doc.data());
          await (local as any)[colName].bulkPut(items);
          
          totalFetched += items.length;
          
          // Update lastSync to the latest updatedAt in this batch to continue fetching
          const lastDoc = snapshot.docs[snapshot.docs.length - 1];
          lastSync = lastDoc.data().updatedAt;

          // If we got fewer than the batch size, we're done
          if (snapshot.docs.length < PULL_BATCH_SIZE) {
            hasMore = false;
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
          hasMore = false;
        }
      }

      if (totalFetched > 0) {
        await local.syncMetadata.put({ id: `lastSync_${colName}`, lastSync: new Date().toISOString() });
        console.log(`Synced ${totalFetched} items for ${colName}`);
      }
    } catch (error) {
      console.error(`Error syncing collection ${colName}:`, error);
    }
  }

  /**
   * Pushes pending local changes to Firestore using batched writes.
   */
  async pushPending() {
    if (!this.userId || this.isSyncing || !navigator.onLine) return;

    try {
      this.isSyncing = true;
      
      // Fetch a large batch of pending changes
      const pending = await local.syncQueue.orderBy('timestamp').limit(BATCH_SIZE).toArray();
      if (pending.length === 0) return;

      console.log(`Pushing ${pending.length} pending changes...`);

      const batch = writeBatch(firestore);
      const processedIds: number[] = [];

      for (const item of pending) {
        const docRef = doc(firestore, 'users', this.userId, item.collection, item.data.id);
        
        if (item.action === 'SET') {
          // Ensure updatedAt is set before pushing to cloud
          const dataToPush = { 
            ...item.data, 
            updatedAt: new Date().toISOString() 
          };
          batch.set(docRef, dataToPush);
        } else if (item.action === 'DELETE') {
          batch.delete(docRef);
        }
        
        if (item.id) processedIds.push(item.id);
      }

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'batch-commit');
      }
      
      // Remove successfully pushed items from the queue
      await local.syncQueue.bulkDelete(processedIds);
      
      console.log(`Successfully pushed ${processedIds.length} changes`);

      // If we hit the limit, there might be more pending. Trigger another push.
      if (pending.length === BATCH_SIZE) {
        setTimeout(() => this.pushPending(), 100);
      }
    } catch (error) {
      console.error('Error pushing pending changes:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Starts the background synchronization process.
   */
  startBackgroundSync() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    
    // Initial sync on start
    this.initialSync();
    this.pushPending();

    // Regular interval for background sync
    this.syncInterval = setInterval(() => {
      if (!navigator.onLine) return;

      // Prioritize pushing local changes
      this.pushPending();

      // Periodically pull remote updates (every 30 seconds)
      // We use a counter or timestamp to avoid pulling too frequently
      const now = Date.now();
      if (!(window as any)._lastPullTime || now - (window as any)._lastPullTime > 30000) {
        (window as any)._lastPullTime = now;
        this.initialSync();
      }
    }, 5000);
  }

  /**
   * Queues a local change to be synced to Firestore.
   */
  async queueChange(collection: string, action: 'SET' | 'DELETE', data: any) {
    // Update local updatedAt for consistency across devices
    const enrichedData = action === 'SET' ? { ...data, updatedAt: new Date().toISOString() } : data;
    
    await local.syncQueue.add({
      collection,
      action,
      data: enrichedData,
      timestamp: Date.now()
    });
    
    // Attempt immediate push if online
    if (navigator.onLine) {
      // Use a small timeout to allow multiple rapid changes to be batched
      if ((window as any)._pushTimeout) clearTimeout((window as any)._pushTimeout);
      (window as any)._pushTimeout = setTimeout(() => this.pushPending(), 500);
    }
  }
}

export const syncService = new SyncService();
