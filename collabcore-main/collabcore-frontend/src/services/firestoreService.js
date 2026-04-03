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
  updateDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

const PROJECTS_COLLECTION = 'projects';
const USERS_COLLECTION = 'users';
const APPLICATIONS_COLLECTION = 'applications';
const MESSAGES_COLLECTION = 'messages';
const NOTIFICATIONS_COLLECTION = 'notifications';

// ─── Direct Messages ─────────────────────────────────────────────────────────

const DM_COLLECTION = 'direct_messages';

/**
 * Get a deterministic conversation ID for two users.
 * Always sorted so uid1_uid2 === uid2_uid1.
 */
const getDmId = (uid1, uid2) => [uid1, uid2].sort().join('_');

/**
 * Send a direct message between two users.
 * Also sends a notification to the recipient.
 */
export const sendDirectMessage = async ({ toUserId, content }) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const sender = await fetchUserProfile(uid);
  const dmId = getDmId(uid, toUserId);
  const now = new Date().toISOString();
  const senderName = sender?.full_name || 'Someone';

  // Save the message
  await addDoc(collection(db, DM_COLLECTION), {
    dm_id: dmId,
    sender_id: uid,
    to_user_id: toUserId,
    content,
    is_read: false,
    created_at: now,
    sender: {
      uid,
      full_name: senderName,
    },
  });

  // Notify recipient
  await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    user_id: toUserId,
    type: 'direct_message',
    title: `💬 New message from ${senderName}`,
    message: content.length > 80 ? content.slice(0, 80) + '…' : content,
    sender_id: uid,
    link: `/messages?with=${uid}`,
    is_read: false,
    created_at: now,
  });
};

/**
 * Subscribe to real-time direct messages between two users.
 * Returns an unsubscribe function.
 */
export const subscribeToDirectMessages = (myUid, theirUid, onMessages) => {
  const dmId = getDmId(myUid, theirUid);
  const q = query(
    collection(db, DM_COLLECTION),
    where('dm_id', '==', dmId),
    orderBy('created_at', 'asc')
  );

  const unsub = onSnapshot(
    q,
    (snap) => onMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => {
      // Fallback without orderBy
      const q2 = query(collection(db, DM_COLLECTION), where('dm_id', '==', dmId));
      onSnapshot(q2, (snap) => {
        const msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
        onMessages(msgs);
      });
    }
  );
  return unsub;
};

/**
 * Subscribe to all DM conversations for the current user.
 * Returns an array of { dmId, otherUserId, otherUser, lastMessage, lastAt }.
 */
export const subscribeToMyDMConversations = (myUid, onConversations) => {
  const q1 = query(collection(db, DM_COLLECTION), where('sender_id', '==', myUid));
  const q2 = query(collection(db, DM_COLLECTION), where('to_user_id', '==', myUid));

  let msgs1 = [];
  let msgs2 = [];

  const merge = () => {
    const all = [...msgs1, ...msgs2];
    const byDmId = {};
    all.forEach((m) => {
      if (!byDmId[m.dm_id] || m.created_at > byDmId[m.dm_id].created_at) {
        byDmId[m.dm_id] = m;
      }
    });
    const convs = Object.values(byDmId).map((m) => ({
      dmId: m.dm_id,
      otherUserId: m.sender_id === myUid ? m.to_user_id : m.sender_id,
      otherUser: m.sender_id === myUid ? null : (m.sender || null),
      lastMessage: m.content,
      lastAt: m.created_at,
    }));
    convs.sort((a, b) => (a.lastAt > b.lastAt ? -1 : 1));
    onConversations(convs);
  };

  const unsub1 = onSnapshot(q1, (snap) => {
    msgs1 = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    merge();
  });
  const unsub2 = onSnapshot(q2, (snap) => {
    msgs2 = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    merge();
  });

  return () => { unsub1(); unsub2(); };
};

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

// ─── Meetings ─────────────────────────────────────────────────────────────────

const MEETINGS_COLLECTION = 'meetings';

/**
 * Generate a Jitsi room URL for a project.
 * Uses meet.jit.si — free, no sign-in required, works on all devices.
 */
export const generateJitsiUrl = (projectId, suffix = '') => {
  const room = `CollabCore-${projectId}${suffix ? '-' + suffix : ''}`.replace(/[^a-zA-Z0-9-]/g, '-');
  return `https://meet.jit.si/${room}`;
};

/**
 * Save a meeting record to Firestore and return it.
 */
export const createMeetingDirect = async ({
  projectId,
  title,
  description = '',
  meeting_type = 'other',
  scheduled_at,
  duration_minutes = 60,
  meeting_url,
  agenda = [],
  participants = [],
}) => {
  const uid = auth.currentUser?.uid;
  const meetingDoc = {
    project_id: projectId,
    title,
    description,
    meeting_type,
    scheduled_at: scheduled_at || new Date().toISOString(),
    duration_minutes,
    meeting_url,
    agenda,
    participants,
    created_by: uid || null,
    meeting_status: 'scheduled',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, MEETINGS_COLLECTION), meetingDoc);
  return { id: ref.id, ...meetingDoc };
};

/**
 * Fetch all meetings for a project.
 */
export const fetchMeetingsDirect = async (projectId) => {
  try {
    const q = query(
      collection(db, MEETINGS_COLLECTION),
      where('project_id', '==', projectId),
      orderBy('scheduled_at', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback without orderBy
    const snap = await getDocs(collection(db, MEETINGS_COLLECTION));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.project_id === projectId)
      .sort((a, b) => (String(b.scheduled_at) > String(a.scheduled_at) ? 1 : -1));
  }
};

/**
 * Delete a meeting by Firestore document id.
 */
export const deleteMeetingDirect = async (meetingId) => {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, MEETINGS_COLLECTION, meetingId));
};

// ─── Notifications ───────────────────────────────────────────────────────────

/**
 * Fetch notifications for a user, newest first.
 */
export const fetchNotificationsDirect = async (uid, limitCount = 50) => {
  if (!uid) return [];
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('user_id', '==', uid),
      orderBy('created_at', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((n) => n.user_id === uid)
      .sort((a, b) => (String(b.created_at) > String(a.created_at) ? 1 : -1))
      .slice(0, limitCount);
  }
};

/**
 * Real-time notifications listener for a user.
 */
export const subscribeToNotifications = (uid, onItems) => {
  if (!uid) {
    onItems([]);
    return () => {};
  }

  const ref = collection(db, NOTIFICATIONS_COLLECTION);
  let innerUnsub = null;

  const orderedQ = query(ref, where('user_id', '==', uid), orderBy('created_at', 'desc'));
  const outerUnsub = onSnapshot(
    orderedQ,
    (snap) => {
      onItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    () => {
      const fallbackQ = query(ref, where('user_id', '==', uid));
      innerUnsub = onSnapshot(fallbackQ, (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (String(b.created_at) > String(a.created_at) ? 1 : -1));
        onItems(items);
      });
    }
  );

  return () => {
    outerUnsub();
    if (innerUnsub) innerUnsub();
  };
};

/**
 * Get unread notification count for badge.
 */
export const fetchUnreadNotificationsCount = async (uid) => {
  if (!uid) return 0;
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('user_id', '==', uid),
      where('is_read', '==', false)
    );
    const snap = await getDocs(q);
    return snap.size;
  } catch {
    const all = await fetchNotificationsDirect(uid, 200);
    return all.filter((n) => !n.is_read).length;
  }
};

/**
 * Mark one notification as read.
 */
export const markNotificationAsRead = async (notificationId) => {
  await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
    is_read: true,
    updated_at: new Date().toISOString(),
  });
};

/**
 * Mark all unread notifications as read for a user.
 */
export const markAllNotificationsAsRead = async (uid) => {
  const unreadQ = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('user_id', '==', uid),
    where('is_read', '==', false)
  );
  const snap = await getDocs(unreadQ);
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, d.id), {
        is_read: true,
        updated_at: new Date().toISOString(),
      })
    )
  );
};

/**
 * Keep Firestore user profile in sync with Firebase Auth fields.
 * Useful for auto-filling avatar_url from Gmail/Google profile photo.
 */
export const createUserProfileInFirestore = async (uid, profileData) => {
  await setDoc(
    doc(db, USERS_COLLECTION, uid),
    {
      uid,
      email: profileData.email || '',
      full_name: profileData.full_name || '',
      university: profileData.university || '',
      bio: profileData.bio || '',
      skills: profileData.skills || [],
      role: profileData.role || 'student',
      avatar_url: profileData.avatar_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
};

export const syncFirebaseProfileToFirestore = async (firebaseUser) => {
  if (!firebaseUser?.uid) return;

  await setDoc(
    doc(db, USERS_COLLECTION, firebaseUser.uid),
    {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      full_name: firebaseUser.displayName || '',
      avatar_url: firebaseUser.photoURL || null,
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
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

// ─── Notifications ────────────────────────────────────────────────────────────

/**
 * Create a notification for a user in Firestore.
 */
export const createNotification = async (userId, { title, message, type = 'info', link = null }) => {
  if (!userId) return;
  await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    user_id: userId,
    title,
    message,
    type,
    link,
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
};

// ─── Applications ─────────────────────────────────────────────────────────────

/**
 * Submit a project application directly to Firestore.
 * Returns the new application document.
 */
export const createApplicationInFirestore = async ({ projectId, userId, message, applicantName }) => {
  const existing = await checkExistingApplication(projectId, userId);
  if (existing) throw new Error('You have already applied to this project.');

  const ref = await addDoc(collection(db, APPLICATIONS_COLLECTION), {
    project_id: projectId,
    user_id: userId,
    message,
    applicant_name: applicantName || '',
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return { id: ref.id, project_id: projectId, user_id: userId, status: 'pending' };
};

/**
 * Check if a user has already applied to a project.
 */
export const checkExistingApplication = async (projectId, userId) => {
  if (!projectId || !userId) return null;
  const q = query(
    collection(db, APPLICATIONS_COLLECTION),
    where('project_id', '==', projectId),
    where('user_id', '==', userId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

/**
 * Fetch all applications for a project (for the owner), enriched with user profiles.
 */
export const fetchProjectApplications = async (projectId) => {
  const q = query(
    collection(db, APPLICATIONS_COLLECTION),
    where('project_id', '==', projectId)
  );
  const snap = await getDocs(q);
  const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Enrich with user profile data
  const enriched = await Promise.all(
    apps.map(async (app) => {
      if (!app.user_id) return app;
      try {
        const userSnap = await getDoc(doc(db, USERS_COLLECTION, app.user_id));
        const userData = userSnap.exists() ? userSnap.data() : {};
        return {
          ...app,
          applied_at: app.created_at,
          user: {
            full_name: userData.full_name || app.applicant_name || 'Unknown',
            university: userData.university || '',
            skills: userData.skills || [],
            bio: userData.bio || '',
            uid: app.user_id,
          },
        };
      } catch {
        return { ...app, applied_at: app.created_at, user: { full_name: app.applicant_name || 'Unknown', skills: [] } };
      }
    })
  );
  return enriched;
};

/**
 * Remove a team member from a project (sets their application to 'removed').
 * Sends a notification to the removed member.
 */
export const removeMemberFromProject = async (projectId, userId, projectTitle) => {
  // Find the accepted application for this user in this project
  const q = query(
    collection(db, APPLICATIONS_COLLECTION),
    where('project_id', '==', projectId),
    where('user_id', '==', userId),
    where('status', '==', 'accepted')
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const appDoc = snap.docs[0];
  await updateDoc(doc(db, APPLICATIONS_COLLECTION, appDoc.id), {
    status: 'removed',
    updated_at: new Date().toISOString(),
  });

  // Notify the removed member
  await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    user_id: userId,
    type: 'removed_from_project',
    title: 'Removed from Project',
    message: `You have been removed from the project "${projectTitle || 'a project'}".`,
    project_id: projectId,
    is_read: false,
    created_at: new Date().toISOString(),
  });
};

/**
 * Accept or reject an application.
 * - Notifies the applicant of the decision.
 * - If accepted: notifies all existing team members that a new member joined.
 * - If rejected: notifies all existing team members that the application was declined.
 */
export const updateApplicationStatusInFirestore = async (applicationId, status, projectTitle) => {
  const ref = doc(db, APPLICATIONS_COLLECTION, applicationId);
  await updateDoc(ref, {
    status,
    updated_at: new Date().toISOString(),
  });

  // Read the application to get user_id and project_id
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const appData = snap.data();
  const { user_id, project_id } = appData;

  if (!user_id) return;

  const isAccepted = status === 'accepted';
  const now = new Date().toISOString();

  // 1. Notify the applicant
  await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    user_id,
    type: isAccepted ? 'application_accepted' : 'application_rejected',
    title: isAccepted ? 'Application Accepted! 🎉' : 'Application Update',
    message: isAccepted
      ? `Your application to "${projectTitle || 'a project'}" has been accepted! You are now a team member.`
      : `Your application to "${projectTitle || 'a project'}" was not accepted this time.`,
    project_id,
    application_id: applicationId,
    is_read: false,
    created_at: now,
  });

  // 2. Get applicant's name for team notifications
  let applicantName = 'Someone';
  try {
    const userSnap = await getDoc(doc(db, USERS_COLLECTION, user_id));
    if (userSnap.exists()) applicantName = userSnap.data().full_name || applicantName;
  } catch { /* ignore */ }

  // 3. Collect existing team member IDs (accepted members + owner), excluding the applicant
  const teamMemberIds = new Set();

  // Get project owner
  try {
    const projectSnap = await getDoc(doc(db, PROJECTS_COLLECTION, project_id));
    if (projectSnap.exists()) {
      const ownerId = projectSnap.data().owner_id;
      if (ownerId && ownerId !== user_id) teamMemberIds.add(ownerId);
    }
  } catch { /* ignore */ }

  // Get accepted applications
  try {
    const acceptedQ = query(
      collection(db, APPLICATIONS_COLLECTION),
      where('project_id', '==', project_id),
      where('status', '==', 'accepted')
    );
    const acceptedSnap = await getDocs(acceptedQ);
    acceptedSnap.docs.forEach((d) => {
      const uid = d.data().user_id;
      if (uid && uid !== user_id) teamMemberIds.add(uid);
    });
  } catch { /* ignore */ }

  if (teamMemberIds.size === 0) return;

  // 4. Send notification to each existing team member
  const teamNotifications = [...teamMemberIds].map((memberId) =>
    addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
      user_id: memberId,
      type: isAccepted ? 'new_team_member' : 'application_reviewed',
      title: isAccepted ? 'New Team Member 🎉' : 'Application Reviewed',
      message: isAccepted
        ? `${applicantName} has joined "${projectTitle || 'your project'}" as a new team member.`
        : `${applicantName}'s application to "${projectTitle || 'your project'}" was not accepted.`,
      project_id,
      is_read: false,
      created_at: now,
    })
  );
  await Promise.all(teamNotifications);
};

// ─── Project status ───────────────────────────────────────────────────────────

/**
 * Update a project's status field in Firestore.
 */
export const updateProjectStatus = async (projectId, status) => {
  await updateDoc(doc(db, PROJECTS_COLLECTION, projectId), {
    status,
    updated_at: new Date().toISOString(),
  });
};

// ─── Users search ─────────────────────────────────────────────────────────────

/**
 * Fetch all users from Firestore (for search).
 */
export const fetchAllUsers = async (limitCount = 100) => {
  try {
    const q = query(collection(db, USERS_COLLECTION), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

// ─── Likes & Saves ────────────────────────────────────────────────────────────

const LIKES_COLLECTION = 'project_likes';
const SAVES_COLLECTION = 'project_saves';

/**
 * Fetch all project IDs that a user has liked.
 */
export const fetchUserLikes = async (userId) => {
  if (!userId) return [];
  const q = query(collection(db, LIKES_COLLECTION), where('user_id', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().project_id);
};

/**
 * Fetch all project IDs that a user has saved.
 */
export const fetchUserSaves = async (userId) => {
  if (!userId) return [];
  const q = query(collection(db, SAVES_COLLECTION), where('user_id', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().project_id);
};

/**
 * Toggle like on a project. Returns true if liked, false if unliked.
 */
export const toggleProjectLike = async (userId, projectId) => {
  if (!userId || !projectId) return false;
  const docId = `${userId}_${projectId}`;
  const ref = doc(db, LIKES_COLLECTION, docId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  } else {
    await setDoc(ref, { user_id: userId, project_id: projectId, created_at: new Date().toISOString() });
    return true;
  }
};

/**
 * Toggle save on a project. Returns true if saved, false if unsaved.
 */
export const toggleProjectSave = async (userId, projectId) => {
  if (!userId || !projectId) return false;
  const docId = `${userId}_${projectId}`;
  const ref = doc(db, SAVES_COLLECTION, docId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  } else {
    await setDoc(ref, { user_id: userId, project_id: projectId, created_at: new Date().toISOString() });
    return true;
  }
};

/**
 * Delete ALL likes for a user — used for cleanup.
 */
export const clearAllUserLikes = async (userId) => {
  if (!userId) return;
  const q = query(collection(db, LIKES_COLLECTION), where('user_id', '==', userId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
};

/**
 * Delete ALL saves for a user — used for cleanup.
 */
export const clearAllUserSaves = async (userId) => {
  if (!userId) return;
  const q = query(collection(db, SAVES_COLLECTION), where('user_id', '==', userId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
};

/**
 * Fetch how many users have liked each project.
 * Returns { [projectId]: count }
 */
export const fetchProjectLikeCounts = async (projectIds) => {
  if (!projectIds?.length) return {};
  const counts = {};
  await Promise.all(
    projectIds.map(async (pid) => {
      const q = query(collection(db, LIKES_COLLECTION), where('project_id', '==', pid));
      const snap = await getDocs(q);
      counts[pid] = snap.size;
    })
  );
  return counts;
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

const TASKS_COLLECTION = 'tasks';

export const createTaskInFirestore = async (projectId, taskData) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, TASKS_COLLECTION), {
    project_id: projectId,
    title: taskData.title,
    description: taskData.description || '',
    priority: taskData.priority || 'medium',
    status: taskData.status || 'todo',
    due_date: taskData.due_date || null,
    assigned_to: taskData.assigned_to || null,
    created_by: uid,
    created_at: now,
    updated_at: now,
  });
  return { id: ref.id };
};

export const subscribeToProjectTasks = (projectId, onTasks) => {
  const q = query(
    collection(db, TASKS_COLLECTION),
    where('project_id', '==', projectId),
    orderBy('created_at', 'asc')
  );
  const unsub = onSnapshot(
    q,
    (snap) => onTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => {
      // Fallback without orderBy
      const q2 = query(collection(db, TASKS_COLLECTION), where('project_id', '==', projectId));
      onSnapshot(q2, (snap) => {
        const tasks = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
        onTasks(tasks);
      });
    }
  );
  return unsub;
};

export const updateTaskInFirestore = async (taskId, data) => {
  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    ...data,
    updated_at: new Date().toISOString(),
  });
};

export const deleteTaskFromFirestore = async (taskId) => {
  await deleteDoc(doc(db, TASKS_COLLECTION, taskId));
};

// ─── Repository Files ─────────────────────────────────────────────────────────

import { storage } from '../config/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const REPO_FILES_COLLECTION = 'repo_files';

/**
 * Upload a file to Firebase Storage and save metadata to Firestore.
 * onProgress(percent) is called during upload.
 */
export const uploadRepoFile = ({ projectId, file, onProgress }) => {
  return new Promise(async (resolve, reject) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return reject(new Error('Not authenticated'));

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `repo_files/${projectId}/${Date.now()}_${safeName}`;
    const sRef = storageRef(storage, path);

    const uploadTask = uploadBytesResumable(sRef, file);

    uploadTask.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      reject,
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const uploader = await fetchUserProfile(uid);
          const docRef = await addDoc(collection(db, REPO_FILES_COLLECTION), {
            project_id: projectId,
            name: file.name,
            size: file.size,
            type: file.type,
            storage_path: path,
            download_url: downloadURL,
            uploaded_by: uid,
            uploader_name: uploader?.full_name || 'Unknown',
            created_at: new Date().toISOString(),
          });
          resolve({ id: docRef.id, download_url: downloadURL, name: file.name });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export const subscribeToRepoFiles = (projectId, onFiles) => {
  const q = query(
    collection(db, REPO_FILES_COLLECTION),
    where('project_id', '==', projectId),
    orderBy('created_at', 'desc')
  );
  const unsub = onSnapshot(
    q,
    (snap) => onFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => {
      const q2 = query(collection(db, REPO_FILES_COLLECTION), where('project_id', '==', projectId));
      onSnapshot(q2, (snap) => {
        const files = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
        onFiles(files);
      });
    }
  );
  return unsub;
};

export const deleteRepoFile = async (fileId, storagePath) => {
  await deleteDoc(doc(db, REPO_FILES_COLLECTION, fileId));
  try {
    await deleteObject(storageRef(storage, storagePath));
  } catch { /* file may not exist in storage */ }
};


