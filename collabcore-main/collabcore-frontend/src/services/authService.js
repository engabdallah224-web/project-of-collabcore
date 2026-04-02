import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import api, { authAPI } from './api';
import { ACCESS_TOKEN_KEY } from '../utils/constants';
import { syncFirebaseProfileToFirestore } from './firestoreService';

const mapSocialAuthError = (error, providerName) => {
  if (error?.code === 'auth/operation-not-allowed') {
    return new Error(
      `${providerName} sign-in is disabled in Firebase. Enable it in Firebase Console > Authentication > Sign-in method, then save.`
    );
  }

  if (error?.code === 'auth/unauthorized-domain') {
    return new Error(
      'This domain is not authorized for Firebase Auth. Add your Vercel domain in Firebase Console > Authentication > Settings > Authorized domains.'
    );
  }

  return error;
};

// ============ REGISTER ============

/**
 * Register a new user with Firebase and create profile in backend
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} User data
 */
export const register = async (userData) => {
  try {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      userData.email,
      userData.password
    );

    const user = userCredential.user;

    // Require real/accessible email by sending verification mail.
    await sendEmailVerification(user);

    // Get ID token
    const idToken = await user.getIdToken();
    localStorage.setItem(ACCESS_TOKEN_KEY, idToken);

    // Create user profile in backend
    await api.post('/api/auth/signup', {
      email: userData.email,
      password: userData.password,
      full_name: userData.full_name,
      university: userData.university,
      bio: userData.bio || '',
      skills: userData.skills || [],
      role: userData.role || 'student',
    });

    // Get user profile from backend
    const response = await authAPI.getMe();

    // Force verification-first flow for email/password accounts.
    await signOut(auth);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    
    return {
      user: response.data.user,
      idToken,
      requiresEmailVerification: true,
    };
  } catch (error) {
    console.error('Registration error:', error);

    // Friendly error handling for Firebase auth
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Email is already in use. Please login or use another email.');
    }

    if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address format.');
    }

    if (error.code === 'auth/weak-password') {
      throw new Error('Weak password. Please choose a stronger password with at least 6 characters.');
    }

    // If backend user creation failed after auth succeeded, delete Firebase user to avoid inconsistency
    if (auth.currentUser && !error.code) {
      try {
        await auth.currentUser.delete();
      } catch (cleanupError) {
        console.warn('Failed to cleanup user after failed signup:', cleanupError);
      }
    }

    // If backend returned 400 with detail, preserve that message
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }

    throw error;
  }
};

// ============ LOGIN ============

/**
 * Login user with email and password using Firebase
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User data and token
 */
export const login = async (email, password) => {
  try {
    // Sign in with Firebase
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Enforce verified email for email/password accounts.
    await reload(user);
    if (!user.emailVerified) {
      await sendEmailVerification(user);
      await signOut(auth);
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      throw new Error('Please verify your email first. We sent a new verification link to your inbox.');
    }

    await syncFirebaseProfileToFirestore(user);

    // Get ID token
    const idToken = await user.getIdToken();
    localStorage.setItem(ACCESS_TOKEN_KEY, idToken);

    // Try to get user profile from backend; fall back to Firebase data if backend unreachable
    try {
      const response = await authAPI.getMe();
      return {
        user: response.data.user,
        idToken,
      };
    } catch (backendError) {
      // No response means network/connection error (backend not deployed or offline)
      if (!backendError.response) {
        return {
          user: {
            uid: user.uid,
            email: user.email,
            full_name: user.displayName || '',
            avatar_url: user.photoURL || null,
            role: 'student',
          },
          idToken,
        };
      }
      throw backendError;
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Provide user-friendly error messages (includes newer auth/invalid-credential)
    if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    ) {
      throw new Error('Invalid email or password');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many failed login attempts. Please try again later.');
    } else if (error.code === 'auth/user-disabled') {
      throw new Error('This account has been disabled');
    }
    
    throw error;
  }
};

// ============ SOCIAL LOGIN ============

/**
 * Login with Google
 */
export const loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    await syncFirebaseProfileToFirestore(user);

    const idToken = await user.getIdToken();
    localStorage.setItem(ACCESS_TOKEN_KEY, idToken);

    // Try to get user profile; if backend is not available, keep using Firebase profile.
    try {
      const response = await authAPI.getMe();
      return {
        user: response.data.user,
        idToken,
      };
    } catch (error) {
      if (error.response?.status === 404 || !error.response) {
        return {
          user: {
            uid: user.uid,
            email: user.email,
            full_name: user.displayName || '',
            avatar_url: user.photoURL || null,
            role: 'student',
          },
          idToken,
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('Google login error:', error);
    throw mapSocialAuthError(error, 'Google');
  }
};

/**
 * Login with GitHub
 */
export const loginWithGithub = async () => {
  try {
    const provider = new GithubAuthProvider();
    provider.addScope('user:email');
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    await syncFirebaseProfileToFirestore(user);

    const idToken = await user.getIdToken();
    localStorage.setItem(ACCESS_TOKEN_KEY, idToken);

    // Try to get user profile; if backend is not available, keep using Firebase profile.
    try {
      const response = await authAPI.getMe();
      return {
        user: response.data.user,
        idToken,
      };
    } catch (error) {
      if (error.response?.status === 404 || !error.response) {
        return {
          user: {
            uid: user.uid,
            email: user.email,
            full_name: user.displayName || '',
            avatar_url: user.photoURL || null,
            role: 'student',
          },
          idToken,
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('GitHub login error:', error);
    throw mapSocialAuthError(error, 'GitHub');
  }
};

// ============ LOGOUT ============

/**
 * Logout current user
 */
export const logout = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Logout error:', error);
    // Clear local storage even if signOut fails
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    throw error;
  }
};

// ============ GET CURRENT USER ============

/**
 * Get current authenticated user's profile from backend
 * @returns {Promise<Object>} User data
 */
export const getCurrentUser = async () => {
  try {
    const response = await authAPI.getMe();
    return response.data.user;
  } catch (error) {
    console.error('Get current user error:', error);

    // Fallback: if profile is missing in Firestore, try backend login endpoint by email
    if (error.response?.status === 404) {
      const firebaseUser = auth.currentUser;
      if (firebaseUser?.email) {
        const loginResponse = await authAPI.loginBackend(firebaseUser.email);
        return loginResponse.data.user;
      }
    }

    // Network error: backend unreachable (e.g. only frontend deployed on Vercel)
    // Fall back to basic Firebase user data so the app stays usable
    if (!error.response) {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        await syncFirebaseProfileToFirestore(firebaseUser);
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          full_name: firebaseUser.displayName || '',
          avatar_url: firebaseUser.photoURL || null,
          role: 'student',
        };
      }
    }

    throw error;
  }
};

// ============ AUTH STATE LISTENER ============

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Callback function to handle auth state changes
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAuthChanges = (callback) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const isPasswordProvider = user.providerData?.some((p) => p.providerId === 'password');
        if (isPasswordProvider && !user.emailVerified) {
          await signOut(auth);
          localStorage.removeItem(ACCESS_TOKEN_KEY);
          callback({ user: null, idToken: null });
          return;
        }

        await syncFirebaseProfileToFirestore(user);
        // Get fresh ID token
        const idToken = await user.getIdToken();
        localStorage.setItem(ACCESS_TOKEN_KEY, idToken);
        
        // Get user profile from backend (falls back to Firebase user if backend unreachable)
        const userData = await getCurrentUser();
        callback({ user: userData, idToken });
      } catch (error) {
        console.error('Error getting user data:', error);
        // If backend is unreachable but Firebase user is valid, keep user logged in
        if (!error.response && user) {
          callback({
            user: {
              uid: user.uid,
              email: user.email,
              full_name: user.displayName || '',
              avatar_url: user.photoURL || null,
              role: 'student',
            },
            idToken,
          });
        } else {
          callback({ user: null, idToken: null });
        }
      }
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      callback({ user: null, idToken: null });
    }
  });
};

// ============ CHECK AUTHENTICATION ============

/**
 * Check if user is authenticated
 * @returns {boolean} True if user is authenticated
 */
export const isAuthenticated = () => {
  return !!auth.currentUser && !!localStorage.getItem(ACCESS_TOKEN_KEY);
};

// ============ REFRESH TOKEN ============

/**
 * Refresh Firebase ID token
 * @returns {Promise<string>} New ID token
 */
export const refreshToken = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user logged in');
    }

    const idToken = await user.getIdToken(true); // Force refresh
    localStorage.setItem(ACCESS_TOKEN_KEY, idToken);
    return idToken;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};
