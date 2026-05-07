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
      if (currentUser) {
        if (currentUser.email && !currentUser.email.endsWith('@placen.co.kr')) {
          await firebaseSignOut(auth);
          alert('@placen.co.kr 이메일만 로그인이 가능합니다.');
          setUser(null);
        } else {
          setUser(currentUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user.email && !result.user.email.endsWith('@placen.co.kr')) {
         await firebaseSignOut(auth);
         alert('@placen.co.kr 이메일만 로그인이 가능합니다.');
      }
    } catch (error: any) {
      console.error('Sign in error', error);
      // Ignore common "cancelled" or "closed" errors
      const ignoredErrors = [
        'auth/popup-closed-by-user',
        'auth/cancelled-popup-request'
      ];
      if (!ignoredErrors.includes(error.code)) {
        alert('로그인에 실패했습니다. 팝업 차단이 해제되어 있는지 확인해주세요.');
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
