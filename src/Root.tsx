/**
 * Decides what to show: the login screen, the shop app (logged in or demo) or the admin dashboard (/admin).
 * For a logged-in shop the khata is loaded from the server into the browser cache before the app starts,
 * and the app then saves changes back (see useShopSync in App.tsx).
 */
import React, { useCallback, useEffect, useState } from 'react';
import App from './App';
import { AdminApp } from './admin/AdminApp';
import { LoginScreen } from './components/auth/LoginScreen';
import { StatementPage } from './components/statement/StatementPage';
import { account, ApiError, Me, PublicShop } from './services/account';
import { clearLocalData, hasUnsynced, LAST_SHOP_KEY, localOwner, readLocalData, setLocalOwner, writeLocalData } from './lib/storage';
import { initialProducts, initialShopProfile } from './utils/seedData';

type View =
  | { kind: 'loading' }
  | { kind: 'login'; signupAllowed: boolean; apiError: string | null }
  | { kind: 'demo' }
  | { kind: 'shop'; shop: PublicShop }
  | { kind: 'admin' };

const DEMO_FLAG = 'ds_demo';
const isAdminPath = () => window.location.pathname.startsWith('/admin');

/** Empty khata for a brand-new shop account (the catalog starts with common items, status unknown). */
function freshShopData(shop: PublicShop) {
  return {
    profile: {
      ...initialShopProfile,
      id: shop.id,
      name: shop.name,
      owner: shop.owner,
      owner_phone: shop.phone,
      upi_id: shop.upi_id,
      created_at: shop.created_at,
      consent_accepted: false,
    },
    customers: [],
    transactions: [],
    reminders: [],
    catalog: initialProducts.map(({ status_updated_at: _s, ...p }) => ({ ...p, shop_id: shop.id, stock_status: 'unknown' as const })),
    scans: [],
    reorder: [],
    leads: [],
    scheduled: [],
  };
}

/** Put the shop's server copy into the browser cache. Returns false if loading failed. */
async function hydrateShop(shop: PublicShop): Promise<void> {
  // Offline queue: changes made without signal on this phone win; the app uploads them on start.
  if (localOwner() === shop.id && hasUnsynced() && readLocalData()) {
    rememberShop(shop);
    return;
  }
  const { data } = await account.loadData();
  if (data) {
    writeLocalData(data);
  } else if (!(localOwner() === shop.id && readLocalData())) {
    clearLocalData();
    writeLocalData(freshShopData(shop));
  }
  setLocalOwner(shop.id);
  rememberShop(shop);
}

function rememberShop(shop: PublicShop) {
  try {
    localStorage.setItem(LAST_SHOP_KEY, JSON.stringify(shop));
  } catch {
    // ignore
  }
}

/** The shop this phone was last logged in as, if its khata is cached here (for opening without signal). */
function cachedShop(): PublicShop | null {
  try {
    const shop = JSON.parse(localStorage.getItem(LAST_SHOP_KEY) ?? 'null') as PublicShop | null;
    return shop && localOwner() === shop.id && readLocalData() ? shop : null;
  } catch {
    return null;
  }
}

export default function Root() {
  // Customer statement links (/s/<token>) open without any login.
  const statementMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  if (statementMatch) return <StatementPage token={statementMatch[1]} />;
  return <ShopRoot />;
}

function ShopRoot() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [loadError, setLoadError] = useState<string | null>(null);

  const enterDemo = useCallback(() => {
    if (localOwner() !== 'demo') {
      clearLocalData();
      setLocalOwner('demo');
    }
    try {
      sessionStorage.setItem(DEMO_FLAG, '1');
    } catch {
      // ignore
    }
    setView({ kind: 'demo' });
  }, []);

  const handleMe = useCallback(
    async (me: Me) => {
      if (me.role === 'admin') {
        if (!isAdminPath()) window.history.replaceState(null, '', '/admin');
        setView({ kind: 'admin' });
        return;
      }
      if (me.role === 'shop') {
        if (isAdminPath()) window.history.replaceState(null, '', '/');
        try {
          setView({ kind: 'loading' });
          await hydrateShop(me.shop);
          try {
            sessionStorage.removeItem(DEMO_FLAG);
          } catch {
            // ignore
          }
          setView({ kind: 'shop', shop: me.shop });
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : 'Data load nahi hua');
          setView({ kind: 'login', signupAllowed: true, apiError: null });
        }
        return;
      }
      let demo = false;
      try {
        demo = sessionStorage.getItem(DEMO_FLAG) === '1';
      } catch {
        // ignore
      }
      if (demo && !isAdminPath()) return enterDemo();
      setView({ kind: 'login', signupAllowed: me.signupAllowed !== false, apiError: null });
    },
    [enterDemo],
  );

  useEffect(() => {
    account
      .me()
      .then(handleMe)
      .catch((err) => {
        // No signal but this phone has the shop's khata: open it offline; changes upload later.
        const offlineShop = err instanceof ApiError && err.status === 0 ? cachedShop() : null;
        if (offlineShop && !isAdminPath()) {
          setView({ kind: 'shop', shop: offlineShop });
          return;
        }
        const msg =
          err instanceof ApiError && err.status !== 401
            ? 'Server (API) se connect nahi ho paya, isliye login abhi kaam nahi karega. Demo chal sakta hai.'
            : null;
        setView({ kind: 'login', signupAllowed: true, apiError: msg });
      });
  }, [handleMe]);

  const logout = useCallback(async () => {
    try {
      await account.logout();
    } catch {
      // ignore: the cookie may already be gone
    }
    clearLocalData();
    try {
      sessionStorage.removeItem(DEMO_FLAG);
    } catch {
      // ignore
    }
    window.location.href = isAdminPath() ? '/admin' : '/';
  }, []);

  if (view.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2F8F5] text-sm font-bold text-[#1F7A5C]">
        Dukaan Saathi khul raha hai...
      </div>
    );
  }
  if (view.kind === 'admin') return <AdminApp onLogout={logout} />;
  if (view.kind === 'login') {
    return (
      <LoginScreen
        variant={isAdminPath() ? 'admin' : 'shop'}
        signupAllowed={view.signupAllowed}
        apiError={view.apiError ?? loadError}
        onLoggedIn={handleMe}
        onDemo={isAdminPath() ? undefined : enterDemo}
      />
    );
  }
  if (view.kind === 'demo') return <App mode="demo" onLogout={logout} />;
  return <App key={view.shop.id} mode="shop" shop={view.shop} onLogout={logout} />;
}
