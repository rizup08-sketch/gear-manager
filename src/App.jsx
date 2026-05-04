import React, { useState, useMemo, useEffect } from 'react';
import { 
  Camera, 
  Aperture, 
  Lightbulb, 
  Mic, 
  Plus, 
  Search, 
  Trash2, 
  X,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  LogOut,
  LogIn,
  Edit,
  LayoutGrid,
  Triangle,
  MoreHorizontal,
  Wand2,
  User,
  History,
  Loader2,
  Wifi,
  WifiOff
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// 환경 변수 안전 로드
const getEnv = (key, fallback) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
  return fallback;
};

// Firebase 설정
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyAw_hDTzzOXhbHpzIcZ4f58XYSZDa2u_cE"),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "shooting-gear-manger.firebaseapp.com"),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "shooting-gear-manger"),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "shooting-gear-manger.firebasestorage.app"),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "668298898658"),
  appId: getEnv('VITE_FIREBASE_APP_ID', "1:668298898658:web:69c5f84554775d8f48c2bb"),
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// appId 경로 오류 해결 (슬래시 완전 제거)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "gear-manager-app";
const sanitizedAppId = String(rawAppId).split('/').filter(Boolean).join('_');

// Cloudinary 설정
const CLOUDINARY_CLOUD_NAME = getEnv('VITE_CLOUDINARY_CLOUD_NAME', "dwjkpawch");
const CLOUDINARY_UPLOAD_PRESET = getEnv('VITE_CLOUDINARY_UPLOAD_PRESET', "shooting_gear");

const CATEGORIES = [
  { name: '전체', icon: LayoutGrid },
  { name: '카메라바디', icon: Camera },
  { name: '카메라렌즈', icon: Aperture },
  { name: '조명', icon: Lightbulb },
  { name: '삼각대', icon: Triangle },
  { name: '음향장비', icon: Mic },
  { name: '특수장비', icon: Wand2 },
  { name: '기타', icon: MoreHorizontal },
];

const STATUS_OPTIONS = ['대여가능', '사용중', '수리중'];

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpeg", { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.7);
      };
    };
  });
};

const EmptyPackageIcon = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.27 6.96 8.73 5.04 8.73-5.04"/><path d="M12 22.08V12"/></svg>
);

export default function App() {
  const [equipmentList, setEquipmentList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadErrorMsg, setUploadErrorMsg] = useState("");
  const [activeCategory, setActiveCategory] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [checkoutUser, setCheckoutUser] = useState('');

  const [formData, setFormData] = useState({
    mgmtNum: '', name: '', category: '카메라바디', status: '대여가능', notes: '', imageUrl: null, currentUser: ''
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        if (initialToken) {
          try {
            await signInWithCustomToken(auth, initialToken);
          } catch (tokenError) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth error", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const equipRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment');
    const unsubEquip = onSnapshot(equipRef, (snapshot) => {
      setEquipmentList(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setIsConnected(true);
    }, (err) => {
      console.error("Firestore error", err);
      setIsConnected(false);
    });

    const logsRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'logs');
    const unsubLogs = onSnapshot(logsRef, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setLoading(false);
    }, (err) => {
      console.error("Firestore logs error", err);
      setLoading(false);
    });

    return () => {
      unsubEquip();
      unsubLogs();
    };
  }, [user]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploadingImage(true);
    setUploadErrorMsg("");
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('file', compressed);
      fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { 
        method: 'POST', 
        body: fd 
      });
      const data = await res.json();
      if (data.secure_url) {
        setFormData(prev => ({ ...prev, imageUrl: String(data.secure_url) }));
      }
    } catch (err) { 
      setUploadErrorMsg("이미지 업로드 실패"); 
    } finally { 
      setIsUploadingImage(false); 
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    if (!user) return;
    const item = equipmentList.find(i => i.id === id);
    if (!item) return;
    const now = formatDate(new Date());
    if (item.status === '사용중' && (newStatus === '대여가능' || newStatus === '수리중')) {
      const log = logs.find(l => l.equipmentId === id && !l.returnDate);
      if (log) {
        await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'logs', log.id), { ...log, returnDate: now });
      }
    }
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', id.toString()), { 
      ...item, 
      status: String(newStatus), 
      currentUser: (newStatus === '대여가능' || newStatus === '수리중' ? '' : String(item.currentUser || '')) 
    });
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!user || !checkoutUser.trim()) return;
    const now = formatDate(new Date());
    const logId = Date.now().toString();
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'logs', logId), {
      id: logId, 
      equipmentId: checkoutItem.id, 
      mgmtNum: String(checkoutItem.mgmtNum), 
      equipmentName: String(checkoutItem.name), 
      userName: String(checkoutUser), 
      checkoutDate: now, 
      returnDate: null
    });
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', checkoutItem.id.toString()), { 
      ...checkoutItem, 
      status: '사용중', 
      currentUser: String(checkoutUser)
    });
    setCheckoutItem(null); 
    setCheckoutUser('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const id = editingItem ? editingItem.id : Date.now().toString();
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', id.toString()), { ...formData, id });
    handleCloseModal();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false); 
    setEditingItem(null); 
    setUploadErrorMsg("");
    setFormData({ 
      mgmtNum: '', name: '', category: '카메라바디', status: '대여가능', notes: '', imageUrl: null, currentUser: '' 
    });
  };

  const filtered = useMemo(() => equipmentList.filter(i => 
    (activeCategory === '전체' || i.category === activeCategory) && 
    (String(i.name).toLowerCase().includes(searchQuery.toLowerCase()) || 
     String(i.mgmtNum).toLowerCase().includes(searchQuery.toLowerCase()))
  ), [equipmentList, activeCategory, searchQuery]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-indigo-600 w-8 h-8" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Camera className="text-indigo-600" />
            <h1 className="font-bold text-lg leading-tight">촬영장비 통합관리</h1>
            {isConnected ? <Wifi className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-red-400" />}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsLogModalOpen(true)} className="p-2 border rounded-xl hover:bg-gray-50 transition-colors"><History className="w-5 h-5" /></button>
            <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2"><Plus className="w-5 h-5" /> 등록</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 w-full flex-1">
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm bg-white" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {CATEGORIES.map(c => {
              const Icon = c.icon;
              return (
                <button key={c.name} onClick={() => setActiveCategory(c.name)} className={`px-4 py-2.5 rounded-xl whitespace-nowrap text-sm font-bold border transition-all flex items-center gap-2 ${activeCategory === c.name ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}>
                  <Icon className="w-4 h-4" /> {String(c.name)}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group flex flex-col">
                <div className="h-44 bg-gray-100 relative overflow-hidden">
                  {item.imageUrl ? <img src={String(item.imageUrl)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-12 h-12" /></div>}
                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/90 shadow-sm border ${item.status === '대여가능' ? 'text-emerald-600 border-emerald-100' : item.status === '사용중' ? 'text-blue-600 border-blue-100' : 'text-red-600 border-red-100'}`}>
                      {String(item.status)}
                    </span>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="text-[10px] font-bold text-indigo-500 uppercase mb-1">{String(item.mgmtNum)}</div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">{String(item.name)}</h3>
                  {item.status === '사용중' && item.currentUser && (
                    <div className="flex items-center gap-2 mb-4 p-2 bg-blue-50 rounded-lg text-sm font-bold text-blue-900"><User className="w-4 h-4" /> {String(item.currentUser)} 사용 중</div>
                  )}
                  <div className="mt-auto flex gap-2 pt-4">
                    {item.status === '대여가능' ? (
                      <button onClick={() => setCheckoutItem(item)} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-colors"><LogOut className="w-4 h-4 inline mr-2" /> 반출</button>
                    ) : (
                      <button onClick={() => handleStatusChange(item.id, '대여가능')} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-colors"><LogIn className="w-4 h-4 inline mr-2" /> 반입</button>
                    )}
                    <button onClick={() => { setEditingItem(item); setFormData(item); setIsModalOpen(true); }} className="p-2.5 border rounded-xl hover:bg-gray-50 transition-colors"><Edit className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => setItemToDelete(item)} className="p-2.5 border rounded-xl text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-32 text-center bg-white rounded-3xl border-2 border-dashed border-gray-200">
            <EmptyPackageIcon className="mx-auto w-12 h-12 text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">검색 결과가 없습니다.</p>
          </div>
        )}
      </main>

      {/* 모달 창들 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
              <h2 className="font-bold text-xl text-gray-900">{editingItem ? '장비 정보 수정' : '새 장비 등록'}</h2>
              <button onClick={handleCloseModal}><X className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="flex items-center gap-5 p-4 bg-gray-50 rounded-2xl border">
                <div className="w-20 h-20 border-2 border-dashed rounded-2xl flex items-center justify-center relative overflow-hidden bg-white">
                   {formData.imageUrl ? <img src={String(formData.imageUrl)} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="w-8 h-8 text-gray-200" />}
                   <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                   {isUploadingImage && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
                </div>
                <div className="text-xs text-gray-500">이미지를 업로드하거나 변경할 수 있습니다.</div>
              </div>
              <input required placeholder="관리번호" value={formData.mgmtNum} onChange={e=>setFormData({...formData, mgmtNum: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:border-indigo-500 transition-all font-bold" />
              <input required placeholder="장비 이름" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:border-indigo-500 transition-all font-bold" />
              <select value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})} className="w-full border p-3 rounded-xl outline-none bg-white font-bold">
                {CATEGORIES.filter(c=>c.name!=='전체').map(c=><option key={c.name}>{String(c.name)}</option>)}
              </select>
              <button type="submit" disabled={isUploadingImage} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-base shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:bg-gray-300">저장 완료</button>
            </form>
          </div>
        </div>
      )}

      {checkoutItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCheckoutSubmit} className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="font-bold text-xl text-gray-900">장비 반출 승인</h2>
            <div className="bg-indigo-50 border p-4 rounded-2xl text-indigo-900 font-bold">[{String(checkoutItem.mgmtNum)}] {String(checkoutItem.name)}</div>
            <input required autoFocus placeholder="대여자 성함" value={checkoutUser} onChange={e=>setCheckoutUser(e.target.value)} className="w-full border p-4 rounded-2xl outline-none focus:border-indigo-500 font-bold bg-gray-50" />
            <div className="flex gap-3">
              <button type="button" onClick={()=>setCheckoutItem(null)} className="flex-1 border py-3 rounded-2xl font-bold text-gray-500">취소</button>
              <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100">승인 완료</button>
            </div>
          </form>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 text-center max-w-xs w-full shadow-2xl">
            <AlertTriangle className="text-red-500 w-12 h-12 mx-auto mb-4" />
            <h3 className="font-bold text-xl mb-6">정말 삭제하시겠습니까?</h3>
            <div className="flex gap-3">
              <button onClick={()=>setItemToDelete(null)} className="flex-1 border py-3 rounded-xl font-bold">취소</button>
              <button onClick={async () => { await deleteDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', itemToDelete.id.toString())); setItemToDelete(null); }} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold">삭제</button>
            </div>
          </div>
        </div>
      )}

      {isLogModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
              <h2 className="font-bold text-xl text-gray-900">장비 반출/반입 히스토리</h2>
              <button onClick={()=>setIsLogModalOpen(false)}><X className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {logs.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-400 font-bold">
                      <tr><th className="px-6 py-4">상태</th><th className="px-6 py-4">장비 정보</th><th className="px-6 py-4">대여자</th><th className="px-6 py-4">시간</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...logs].sort((a,b)=>String(b.id).localeCompare(String(a.id))).map(l => (
                        <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">{l.returnDate ? <span className="text-emerald-600 font-bold">반납완료</span> : <span className="text-blue-600 font-bold animate-pulse">대여중</span>}</td>
                          <td className="px-6 py-4 font-bold">{String(l.equipmentName)} <span className="text-xs text-gray-400">({String(l.mgmtNum)})</span></td>
                          <td className="px-6 py-4 font-bold">{String(l.userName)}</td>
                          <td className="px-6 py-4 text-[10px] text-gray-400"><div>반출: {String(l.checkoutDate)}</div>{l.returnDate && <div>반납: {String(l.returnDate)}</div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-24 text-center text-gray-400 font-medium">대여 기록이 없습니다.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}