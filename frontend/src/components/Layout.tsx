import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isApp } from '../utils/isApp';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/query', label: '回饋查詢' },
  { path: '/calculate', label: '回饋計算' },
  { path: '/transactions', label: '記帳功能' },
  { path: '/quota', label: '額度查詢' },
  { path: '/settings', label: '管理設定' },
];

// 導航圖標映射
const navIcons: { [key: string]: string } = {
  '/query': '🔍',
  '/calculate': '🧮',
  '/transactions': '📝',
  '/quota': '📊',
  '/settings': '⚙️',
};

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [isAppMode, setIsAppMode] = useState(false);

  useEffect(() => {
    setIsAppMode(isApp());
    
    // 監聽窗口大小變化，自動調整模式
    const handleResize = () => {
      setIsAppMode(isApp());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navColors = [
    { path: '/query', color: 'from-blue-500 to-cyan-500' },
    { path: '/calculate', color: 'from-purple-500 to-pink-500' },
    { path: '/transactions', color: 'from-green-500 to-emerald-500' },
    { path: '/quota', color: 'from-orange-500 to-red-500' },
    { path: '/settings', color: 'from-indigo-500 to-blue-500' },
  ];

  // App 模式：底部導航
  if (isAppMode) {
    return (
      <div className="min-h-screen flex flex-col" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        {/* 主要內容 */}
        <main className="flex-1 overflow-y-auto px-4 py-4">
          {children}
        </main>

        {/* 底部導航列 */}
        <nav 
          className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-2xl border-t border-gray-200 z-50"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex justify-around items-center h-16 px-2 max-w-md mx-auto">
            {navItems.map((item) => {
              const navColor = navColors.find(nc => nc.path === item.path);
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex flex-col items-center justify-center flex-1 h-full min-w-0 px-2 transition-all duration-200 active:scale-95 ${
                    isActive ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <span className="text-2xl mb-0.5 leading-none">{navIcons[item.path] || '📄'}</span>
                  <span className={`text-xs font-medium truncate w-full text-center ${
                    isActive ? 'font-semibold' : ''
                  }`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gradient-to-r ${navColor?.color} rounded-b-full`} />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  // 桌面模式：頂部導航
  return (
    <div className="min-h-screen">
      {/* 導航列 */}
      <nav className="bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  💳 回饋查詢/計算與記帳系統
                </h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-2">
                {navItems.map((item) => {
                  const navColor = navColors.find(nc => nc.path === item.path);
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? `bg-gradient-to-r ${navColor?.color} text-white shadow-md`
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 手機版導航 */}
        <div className="sm:hidden">
          <div className="pt-2 pb-3 space-y-1">
            {navItems.map((item) => {
              const navColor = navColors.find(nc => nc.path === item.path);
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium rounded-r-lg transition-all ${
                    isActive
                      ? `bg-gradient-to-r ${navColor?.color} text-white border-transparent shadow-md`
                      : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* 主要內容 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">{children}</div>
      </main>
    </div>
  );
}

