import { useState, useEffect, ReactNode } from 'react';
import { auth, googleProvider } from './firebase/config';
import { signInWithPopup, User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';

const N_GREEN = '#03C75A';

export function AuthWrapper({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Sign in error', error);
      // Ignore common "cancelled" or "closed" errors
      const ignoredErrors = [
        'auth/popup-closed-by-user',
        'auth/cancelled-popup-request'
      ];
      if (!ignoredErrors.includes(error.code)) {
        if (error.code === 'auth/unauthorized-domain') {
          alert('현재 도메인이 Firebase에서 승인되지 않았습니다. Firebase 콘솔에서 승인된 도메인에 ncdst.vercel.app 을 추가해주세요.');
        } else {
          alert(`로그인에 실패했습니다 (${error.code}). 팝업 차단이 해제되어 있는지 확인해주세요.`);
        }
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error', error);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f5f6f8]">로딩중...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f6f8] px-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-sm w-full space-y-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: N_GREEN }}>NPay 영업 관리</h1>
            <p className="text-gray-500 mt-2 text-sm">타겟 가맹점 방문 영업 관리 앱</p>
          </div>
          <button 
            onClick={signIn}
            disabled={isSigningIn}
            className={`w-full py-3.5 rounded-xl text-white font-bold text-lg transition-all ${isSigningIn ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.99]'}`}
            style={{ backgroundColor: N_GREEN }}
          >
            {isSigningIn ? '로그인 중...' : 'Google로 로그인'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
    </>
  );
}
