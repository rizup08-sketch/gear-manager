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

// 1. 환경 변수 안전 로드 및 폴백(Fallback) 설정
const getEnv = (key, fallback) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
  return fallback;
};

// 2. Firebase 설정 (Vercel 환경변수 또는 직접 입력된 키 사용)
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyAw_hDTzzOXhbHpzIcZ4f58XYSZDa2u_cE"),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "shooting-gear-manger.firebaseapp.com"),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "shooting-gear-manger"),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "shooting-gear-manger.firebasestorage.app"),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "668298898658"),
  appId: getEnv('VITE_FIREBASE_APP_ID', "1:668298898658:web:69c5f84554775d8f48c2bb"),
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 3. 데이터베이스 경로 최적화 (슬래시 포함 시 발생하는 6 segment 에러 방지)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "gear-manager-app";
const sanitizedAppId = String(rawAppId).split('/').filter(Boolean).join('_');

// 4. Cloudinary 설정 (이미지 업로드용)
const CLOUDINARY_CLOUD_NAME = getEnv('VITE_CLOUDINARY_CLOUD_NAME', "dwjkpawch");
const CLOUDINARY_UPLOAD_PRESET = getEnv('VITE_CLOUDINARY_UPLOAD_PRESET', "shooting_gear");

// 5. 상수 설정
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

// 날짜 포맷팅 함수
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 이미지 압축 유틸리티
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
  // 상태 관리
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

  // 6. 인증 초기화
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

  // 7. 실시간 데이터 연동 (Firestore)
  useEffect(() => {
    if (!user) return;

    const equipRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment');
    const unsubEquip = onSnapshot(equipRef, (snapshot) => {
      // 데이터 렌더링 시 객체 오류 방지를 위해 명시적 문자열 변환 및 복사
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: String(doc.id) }));
      setEquipmentList(data);
      setIsConnected(true);
    }, (err) => {
      console.error("Firestore error", err);
      setIsConnected(false);
    });

    const logsRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'logs');
    const unsubLogs = onSnapshot(logsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: String(doc.id) }));
      setLogs(data);
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

  // 이미지 업로드 핸들러
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

  // 장비 상태 변경 (반입/반납 처리)
  const handleStatusChange = async (id, newStatus) => {
    if (!user) return;
    const item = equipmentList.find(i => i.id === id);
    if (!item) return;
    const now = formatDate(new Date());
    
    // 반납 시 로그 업데이트
    if (item.status === '사용중' && (newStatus === '대여가능' || newStatus === '수리중')) {
      const log = logs.find(l => l.equipmentId === id && !l.returnDate);
      if (log) {
        await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'logs', String(log.id)), { ...log, returnDate: now });
      }
    }
    
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', String(id)), { 
      ...item, 
      status: String(newStatus), 
      currentUser: (newStatus === '대여가능' || newStatus === '수리중' ? '' : String(item.currentUser || '')) 
    });
  };

  // 대여(반출) 승인 핸들러
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!user || !checkoutUser.trim()) return;
    const now = formatDate(new Date());
    const logId = Date.now().toString();
    
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'logs', logId), {
      id: logId, 
      equipmentId: String(checkoutItem.id), 
      mgmtNum: String(checkoutItem.mgmtNum), 
      equipmentName: String(checkoutItem.name), 
      userName: String(checkoutUser), 
      checkoutDate: now, 
      returnDate: null
    });
    
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', String(checkoutItem.id)), { 
      ...checkoutItem, 
      status: '사용중', 
      currentUser: String(checkoutUser)
    });
    
    setCheckoutItem(null); 
    setCheckoutUser('');
  };

  // 장비 등록/수정 제출
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const id = editingItem ? String(editingItem.id) : Date.now().toString();
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', id), { ...formData, id });
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

  // 필터링된 목록 계산 (검색 및 카테고리)
  const filtered = useMemo(() => {
    const list = [...equipmentList].sort((a, b) => String(b.id).localeCompare(String(a.id)));
    return list.filter(i => 
      (activeCategory === '전체' || i.category === activeCategory) && 
      (String(i.name).toLowerCase().includes(searchQuery.toLowerCase()) || 
       String(i.mgmtNum).toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [equipmentList, activeCategory, searchQuery]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
        <p className="text-gray-500 font-medium">실시간 데이터 연결 중...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* 헤더 섹션 */}
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Camera className="text-indigo-600" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">촬영장비 통합관리</h1>
              <div className="flex items-center gap-1">
                {isConnected ? 
                  <span className="text-[10px] text-emerald-500 font-bold uppercase flex items-center gap-0.5"><Wifi className="w-2.5 h-2.5" /> 공유 중</span> : 
                  <span className="text-[10px] text-red-400 font-bold uppercase flex items-center gap-0.5"><WifiOff className="w-2.5 h-2.5" /> 연결 끊김</span>
                }
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsLogModalOpen(true)} className="p-2.5 border rounded-xl hover:bg-gray-50 transition-colors shadow-sm bg-white" title="히스토리">
              <History className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2">
              <Plus className="w-5 h-5" /> 등록
            </button>
          </div>
        </div>
      </header>

      {/* 메인 섹션 */}
      <main className="max-w-6xl mx-auto p-4 w-full flex-1">
        <div className="mb-6 space-y-4">
          {/* 검색 바 */}
          <div className="relative group">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="장비명 또는 관리번호로 검색..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm bg-white" 
            />
          </div>
          
          {/* 카테고리 필터 */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {CATEGORIES.map(c => {
              const CategoryIcon = c.icon;
              const isActive = activeCategory === c.name;
              return (
                <button 
                  key={c.name} 
                  onClick={() => setActiveCategory(c.name)} 
                  className={`px-4 py-2.5 rounded-xl whitespace-nowrap text-sm font-bold border transition-all flex items-center gap-2
                    ${isActive 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105' 
                      : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                >
                  <CategoryIcon className="w-4 h-4" /> {String(c.name)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 장비 리스트 그리드 */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(item => (
              <div key={String(item.id)} className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group flex flex-col">
                {/* 카드 상단 이미지 영역 */}
                <div className="h-44 bg-gray-100 relative overflow-hidden">
                  {item.imageUrl ? 
                    <img src={String(item.imageUrl)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" /> : 
                    <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-12 h-12" /></div>
                  }
                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/90 shadow-sm border
                      ${item.status === '대여가능' ? 'text-emerald-600 border-emerald-100' : 
                        item.status === '사용중' ? 'text-blue-600 border-blue-100' : 'text-red-600 border-red-100'}`}>
                      {String(item.status)}
                    </span>
                  </div>
                </div>
                
                {/* 카드 내용 영역 */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter mb-1">{String(item.mgmtNum)}</div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2 truncate">{String(item.name)}</h3>
                  
                  {item.status === '사용중' && item.currentUser && (
                    <div className="flex items-center gap-2 mb-4 p-2.5 bg-blue-50 rounded-xl border border-blue-100 animate-pulse-subtle">
                      <User className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-bold text-blue-900 truncate">{String(item.currentUser)} 사용 중</span>
                    </div>
                  )}

                  <div className="mt-auto flex gap-2 pt-4">
                    {item.status === '대여가능' ? (
                      <button onClick={() => setCheckoutItem(item)} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-colors">
                        <LogOut className="w-4 h-4 inline mr-2" /> 반출
                      </button>
                    ) : (
                      <button onClick={() => handleStatusChange(item.id, '대여가능')} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-colors">
                        <LogIn className="w-4 h-4 inline mr-2" /> 반입 완료
                      </button>
                    )}
                    <button onClick={() => { setEditingItem(item); setFormData(item); setIsModalOpen(true); }} className="p-2.5 border rounded-xl hover:bg-gray-50 transition-colors text-gray-500">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => setItemToDelete(item)} className="p-2.5 border rounded-xl text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-32 text-center bg-white rounded-3xl border-2 border-dashed border-gray-200">
            <EmptyPackageIcon className="mx-auto w-12 h-12 text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">검색된 장비가 없습니다.</p>
          </div>
        )}
      </main>

      {/* 등록 및 수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
              <h2 className="font-bold text-xl text-gray-900">{editingItem ? '장비 정보 수정' : '새 장비 등록'}</h2>
              <button onClick={handleCloseModal} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="flex items-center gap-5 p-4 bg-gray-50 rounded-2xl border">
                <div className="w-20 h-20 border-2 border-dashed rounded-2xl flex items-center justify-center relative overflow-hidden bg-white shrink-0">
                   {formData.imageUrl ? <img src={String(formData.imageUrl)} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="w-8 h-8 text-gray-200" />}
                   <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                   {isUploadingImage && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
                </div>
                <div className="text-xs text-gray-500 leading-relaxed">클릭하여 사진을 업로드하세요. {uploadErrorMsg && <span className="text-red-500 block font-bold">{String(uploadErrorMsg)}</span>}</div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input required placeholder="관리번호 (예: CAM-01)" value={formData.mgmtNum} onChange={e=>setFormData({...formData, mgmtNum: e.target.value})} className="border p-3 rounded-xl outline-none focus:border-indigo-500 transition-all font-bold text-sm" />
                  <select value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})} className="border p-3 rounded-xl outline-none bg-white font-bold text-sm">
                    {CATEGORIES.filter(c=>c.name!=='전체').map(c=><option key={c.name}>{String(c.name)}</option>)}
                  </select>
                </div>
                <input required placeholder="장비 이름 (모델명)" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:border-indigo-500 transition-all font-bold" />
                <textarea placeholder="특이사항 및 메모" value={formData.notes} onChange={e=>setFormData({...formData, notes: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:border-indigo-500 transition-all text-sm h-24 resize-none" />
              </div>
              <button type="submit" disabled={isUploadingImage} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-base shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:bg-gray-300">저장 완료</button>
            </form>
          </div>
        </div>
      )}

      {/* 반출(대여) 승인 모달 */}
      {checkoutItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCheckoutSubmit} className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="font-bold text-xl text-gray-900">장비 반출 승인</h2>
            <div className="bg-indigo-50 border p-4 rounded-2xl text-indigo-900 font-bold">[{String(checkoutItem.mgmtNum)}] {String(checkoutItem.name)}</div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 ml-1">대여자 성함 *</label>
              <input required autoFocus placeholder="이름을 입력하세요" value={checkoutUser} onChange={e=>setCheckoutUser(e.target.value)} className="w-full border p-4 rounded-2xl outline-none focus:border-indigo-500 font-bold bg-gray-50" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={()=>setCheckoutItem(null)} className="flex-1 border py-3.5 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-colors">취소</button>
              <button type="submit" className="flex-1 bg-indigo-600 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-indigo-100">반출 확인</button>
            </div>
          </form>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 text-center max-w-xs w-full shadow-2xl">
            <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-500 w-8 h-8" />
            </div>
            <h3 className="font-bold text-xl mb-2">정말 삭제하시겠습니까?</h3>
            <p className="text-sm text-gray-400 mb-8 font-medium">[{String(itemToDelete.mgmtNum)}] {String(itemToDelete.name)}가 목록에서 영구적으로 삭제됩니다.</p>
            <div className="flex gap-3">
              <button onClick={()=>setItemToDelete(null)} className="flex-1 border py-3 rounded-xl font-bold hover:bg-gray-50">취소</button>
              <button onClick={async () => { await deleteDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'equipment', String(itemToDelete.id))); setItemToDelete(null); }} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-red-100">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 히스토리 모달 */}
      {isLogModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <History className="text-indigo-600" />
                <h2 className="font-bold text-xl text-gray-900">장비 대여 히스토리</h2>
              </div>
              <button onClick={()=>setIsLogModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {logs.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-400 font-bold text-[10px] uppercase tracking-widest border-b">
                      <tr><th className="px-6 py-4">상태</th><th className="px-6 py-4">장비 정보</th><th className="px-6 py-4">사용자</th><th className="px-6 py-4">시간 기록</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...logs].sort((a,b)=>String(b.id).localeCompare(String(a.id))).map(l => (
                        <tr key={String(l.id)} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-6 py-4">
                            {l.returnDate ? 
                              <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded text-[10px] border border-emerald-100">반납완료</span> : 
                              <span className="text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded text-[10px] border border-blue-100 animate-pulse">사용중</span>
                            }
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{String(l.equipmentName)}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{String(l.mgmtNum)}</div>
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-700">{String(l.userName)}</td>
                          <td className="px-6 py-4 text-[10px] text-gray-500 leading-relaxed font-medium">
                            <div>반출: {String(l.checkoutDate)}</div>
                            {l.returnDate && <div className="text-emerald-500">반납: {String(l.returnDate)}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="py-24 text-center bg-gray-50 rounded-3xl"><History className="mx-auto w-12 h-12 text-gray-200 mb-4" /><p className="text-gray-400 font-medium">대여 기록이 아직 없습니다.</p></div>}
            </div>
          </div>
        </div>
      )}
      
      {/* 스타일 애니메이션 가이드 */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes pulse-subtle { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }
        .animate-pulse-subtle { animation: pulse-subtle 2s infinite ease-in-out; }
      `}</style>
    </div>
  );
}