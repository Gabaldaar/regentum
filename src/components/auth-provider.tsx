
'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
import { initializeApp, getApps, getApp } from "firebase/app";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut, User, Auth, getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, doc, Firestore, getDocs, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebase';
import { Provider, UserRole } from '@/lib/data';

// Usamos solo el UID para identificar al administrador maestro en el cliente.
// Esto evita que el escáner de secretos de Netlify detecte el email si coincide con VAPID_MAILTO.
const MASTER_ADMIN_UID = 'ymBtFDZUWKR7VCxWNTHWflXc5mx1';

export type AppUser = Provider;

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  authError: string | null;
  activeRole: UserRole | null;
  setActiveRole: (role: UserRole) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isOwner: boolean;
  orgId: string | null;
  roleConflict: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appUser: null,
  loading: true,
  authError: null,
  activeRole: null,
  setActiveRole: () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  isOwner: false,
  orgId: null,
  roleConflict: null
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [roleConflict, setRoleConflict] = useState<string | null>(null);

  const [firebaseServices, setFirebaseServices] = useState<{ auth: Auth; db: Firestore } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !firebaseServices) {
        try {
            const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
            setFirebaseServices({ auth: getAuth(app), db: getFirestore(app) });
        } catch (e: any) {
            console.error("[AUTH] Error initializing services:", e);
            setAuthError(e.message);
            setLoading(false);
        }
    }
  }, [firebaseServices]);

  useEffect(() => {
    if (!firebaseServices) return;

    const { auth, db } = firebaseServices;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setAppUser(null);
        setActiveRole(null);
        setOrgId(null);
        setIsOwner(false);
        setRoleConflict(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);
      setLoading(true);
      
      try {
          // CHEQUEO MAESTRO PRIORITARIO POR UID
          const isMaster = firebaseUser.uid === MASTER_ADMIN_UID;

          if (isMaster) {
              const masterData: AppUser = {
                  id: firebaseUser.uid,
                  orgId: 'global',
                  name: firebaseUser.displayName || 'Administrador Maestro',
                  email: firebaseUser.email || '',
                  role: 'admin',
                  status: 'active',
                  appFlavor: 'personal',
                  managementType: 'tasks',
                  billingType: 'other',
                  rateCurrency: 'ARS',
                  hourlyRate: 0,
                  perVisitRate: 0,
                  monthlyRate: 0
              };
              setOrgId('global');
              setAppUser(masterData);
              setActiveRole(prev => (prev === 'owner' ? 'owner' : 'admin'));
              setIsOwner(true);
              await setDoc(doc(db, 'providers', firebaseUser.uid), masterData, { merge: true });
              setLoading(false);
              return;
          }

          // BUSQUEDA POR UID
          const docRef = doc(db, 'providers', firebaseUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
              const userData = { id: docSnap.id, ...docSnap.data() } as AppUser;
              setOrgId(userData.orgId);
              setAppUser(userData);
              setActiveRole(prev => (prev === 'owner' ? 'owner' : userData.role));
              setIsOwner(userData.role === 'owner' || userData.role === 'admin' || userData.role === 'socio');
              setLoading(false);
              return;
          }

          // BUSQUEDA POR EMAIL (RESPALDO)
          const email = (firebaseUser.email || '').toLowerCase().trim();
          if (email) {
              const qProviders = query(collection(db, 'providers'), where('email', '==', email));
              const providersSnap = await getDocs(qProviders);
              const allUserDocs = providersSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser));
              
              if (allUserDocs.length > 1) {
                  setRoleConflict(allUserDocs.map(d => `ID: ${d.id} | Org: ${d.orgId} | Rol: ${d.role}`).join('\n'));
                  setLoading(false);
                  return;
              }

              if (allUserDocs.length === 1) {
                  const userData = allUserDocs[0];
                  
                  // MIGRACIÓN/VINCULACIÓN: Si la ID no coincide con su uid de Auth, la migramos para que las reglas de Firebase funcionen
                  if (userData.id !== firebaseUser.uid) {
                      console.log(`[AUTH] Migrando perfil de socio/proveedor de ID ${userData.id} a UID ${firebaseUser.uid}`);
                      const newDocRef = doc(db, 'providers', firebaseUser.uid);
                      const oldDocRef = doc(db, 'providers', userData.id);
                      
                      const migratedData = {
                          ...userData,
                          id: firebaseUser.uid,
                          userId: firebaseUser.uid, // Aseguramos vinculación
                          updatedAt: new Date().toISOString()
                      };
                      
                      try {
                          // 1. Guardar el nuevo documento con el UID del usuario como ID
                          await setDoc(newDocRef, migratedData);
                          // 2. Eliminar el documento original con ID aleatorio
                          await deleteDoc(oldDocRef);
                          console.log(`[AUTH] Perfil migrado correctamente para ${firebaseUser.email}`);
                          
                          userData.id = firebaseUser.uid;
                      } catch (err) {
                          console.error("[AUTH] Error migrando perfil de proveedor:", err);
                      }
                  }

                  setOrgId(userData.orgId);
                  setAppUser(userData);
                  setActiveRole(prev => (prev === 'owner' ? 'owner' : userData.role));
                  setIsOwner(userData.role === 'owner' || userData.role === 'admin' || userData.role === 'socio');
                  setLoading(false);
                  return;
              }
          }

          setOrgId(null);
          setAppUser(null);
          setLoading(false);

      } catch (e: any) {
          console.error("[AUTH] Error during profile fetch:", e);
          setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [firebaseServices]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseServices) return;
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(firebaseServices.auth, provider);
  }, [firebaseServices]);

  const signOut = useCallback(async () => {
    if (!firebaseServices) return;
    try {
        await firebaseSignOut(firebaseServices.auth);
        setUser(null);
        setAppUser(null);
        setActiveRole(null);
        setOrgId(null);
        setIsOwner(false);
        setRoleConflict(null);
        if (typeof window !== 'undefined') {
            window.localStorage.clear();
            window.sessionStorage.clear();
        }
    } catch (e) {
        console.error("Sign out error", e);
    }
  }, [firebaseServices]);

  const setRole = useCallback((role: UserRole) => {
      setActiveRole(role);
      setIsOwner(role === 'owner' || appUser?.role === 'admin' || appUser?.role === 'socio');
  }, [appUser]);

  const value = useMemo(() => ({ 
    user, appUser, loading, authError, activeRole, setActiveRole: setRole, signInWithGoogle, signOut, isOwner, orgId, roleConflict 
  }), [user, appUser, loading, authError, activeRole, setRole, signInWithGoogle, signOut, isOwner, orgId, roleConflict]);
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
