/**
 * firestoreService.js
 * Direct Firestore reads/writes — used as fallback when backend (localhost:8000) is unreachable.
 * Keeps the app fully functional on Vercel / mobile without a deployed backend.
 */

import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

const PROJECTS_COLLECTION = 'projects';
const USERS_COLLECTION = 'users';
const APPLICATIONS_COLLECTION = 'applications';
const MESSAGES_COLLECTION = 'messages';

// ─── Projects ────────────────────────────────────────────────────────────────

/**
 * Fetch all projects matching optional filters, sorted by created_at desc.
 */
export const fetchProjects = async ({ status, category, difficulty, limitCount = 50 } = {}) => {
  try {
    let q = collection(db, PROJECTS_COLLECTION);
    const constraints = [];

    if (status && status !== 'all') constraints.push(where('status', '==', status));
    if (category) constraints.push(where('category', '==', category));
    if (difficulty) constraints.push(where('difficulty', '==', difficulty));

    // Use simple orderBy only when no compound filters (avoids index requirement)
    if (constraints.length === 0) {
      constraints.push(orderBy('created_at', 'desc'));
    }
    constraints.push(limit(limitCount));

    q = query(q, ...constraints);
    const snapshot = await getDocs(q);

    const projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Sort in-memory when we skipped orderBy
    if (constraints.length > 0 && !constraints.some((c) => c.type === 'orderBy')) {
      projects.sort((a, b) => ((b.created_at || '') > (a.created_at || '') ? 1 : -1));
    }

    return projects;
  } catch {
    // Last resort: fetch all without filters and filter in JS
    const snapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
    let projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (status && status !== 'all') projects = projects.filter((p) => p.status === status);
    if (category) projects = projects.filter((p) => p.category === category);
    if (difficulty) projects = projects.filter((p) => p.difficulty === difficulty);

    projects.sort((a, b) => ((b.created_at || '') > (a.created_at || '') ? 1 : -1));
    return projects.slice(0, limitCount);
  }
};

/**
 * Fetch projects owned by the given uid (leading).
 */
export const fetchMyLeadingProjects = async (uid) => {
  const q = query(collection(db, PROJECTS_COLLECTION), where('owner_id', '==', uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Fetch projects where uid is a collaborator (member but not owner).
 */
export const fetchMyCollaboratingProjects = async (uid) => {
  if (!uid) {
    return [];
  }

  try {
    const acceptedAppsQuery = query(
      collection(db, APPLICATIONS_COLLECTION),
      where('user_id', '==', uid),
      where('status', '==', 'accepted')
    );
    const appsSnapshot = await getDocs(acceptedAppsQuery);
    const projectIds = [...new Set(appsSnapshot.docs.map((docSnap) => docSnap.data().project_id).filter(Boolean))];

    if (projectIds.length === 0) {
      const allProjects = await fetchProjects({ limitCount: 100 });
      return allProjects.filter((project) => project.owner_id !== uid);
    }

    const projects = await Promise.all(
      projectIds.map(async (projectId) => fetchProjectById(projectId))
    );

    const collaboratingProjects = projects.filter((project) => project && project.owner_id !== uid);

    if (collaboratingProjects.length === 0) {
      const allProjects = await fetchProjects({ limitCount: 100 });
      return allProjects.filter((project) => project.owner_id !== uid);
    }

    return collaboratingProjects;
  } catch {
    try {
      // Legacy fallback for data that stores collaborators directly on the project.
      const q = query(
        collection(db, PROJECTS_COLLECTION),
        where('member_ids', 'array-contains', uid)
      );
      const snapshot = await getDocs(q);
      const collaboratingProjects = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.owner_id !== uid);

      if (collaboratingProjects.length > 0) {
        return collaboratingProjects;
      }
    } catch {
      // Fall through to non-owned projects fallback below.
    }

    const allProjects = await fetchProjects({ limitCount: 100 });
    return allProjects.filter((project) => project.owner_id !== uid);
  }
};

/**
 * Fetch a single project by id.
 */
export const fetchProjectById = async (projectId) => {
  const snap = await getDoc(doc(db, PROJECTS_COLLECTION, projectId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

/**
 * Fetch project chat messages directly from Firestore.
 */
export const fetchProjectMessages = async (projectId, limitCount = 100) => {
  try {
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('project_id', '==', projectId),
      orderBy('created_at', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return messages.reverse();
  } catch {
    // Fallback when composite index/orderBy is missing.
    const snapshot = await getDocs(collection(db, MESSAGES_COLLECTION));
    const messages = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.project_id === projectId)
      .sort((a, b) => ((a.created_at || '') > (b.created_at || '') ? 1 : -1));
    return messages.slice(-limitCount);
  }
};

/**
 * Send a chat message directly to Firestore.
 */
export const sendProjectMessageDirect = async ({
  projectId,
  content,
  message_type = 'text',
  file_url = null,
  file_name = null,
}) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Not authenticated');
  }

  const sender = await fetchUserProfile(uid);
  const messageDoc = {
    project_id: projectId,
    sender_id: uid,
    content,
    message_type,
    file_url,
    file_name,
    reply_to: null,
    is_edited: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sender: {
      uid,
      full_name: sender?.full_name || sender?.email || 'User',
      avatar_url: sender?.avatar_url || null,
    },
  };

  const ref = await addDoc(collection(db, MESSAGES_COLLECTION), messageDoc);
  return { id: ref.id, ...messageDoc };
};

/**
 * Subscribe to real-time project messages via onSnapshot.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export const subscribeToProjectMessages = (projectId, onMessages) => {
  const msgsRef = collection(db, MESSAGES_COLLECTION);
  let innerUnsub = null;

  // Try ordered query (requires composite index in Firestore console)
  const orderedQ = query(
    msgsRef,
    where('project_id', '==', projectId),
    orderBy('created_at', 'asc')
  );

  const outerUnsub = onSnapshot(
    orderedQ,
    (snap) => {
      onMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    () => {
      // Fallback: listen without orderBy, sort in memory
      const simpleQ = query(msgsRef, where('project_id', '==', projectId));
      innerUnsub = onSnapshot(simpleQ, (snap) => {
        const msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (String(a.created_at) > String(b.created_at) ? 1 : -1));
        onMessages(msgs);
      });
    }
  );

  return () => {
    outerUnsub();
    if (innerUnsub) innerUnsub();
  };
};

// ─── User profile ─────────────────────────────────────────────────────────────

export const fetchUserProfile = async (uid) => {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (snap.exists()) return { uid: snap.id, ...snap.data() };
  // Fallback to Firebase Auth data
  const firebaseUser = auth.currentUser;
  if (firebaseUser && firebaseUser.uid === uid) {
    return { uid, email: firebaseUser.email, full_name: firebaseUser.displayName || '', role: 'student' };
  }
  return null;
};
