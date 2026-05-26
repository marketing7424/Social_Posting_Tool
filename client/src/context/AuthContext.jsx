import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Modal, Button } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import api from '../api/client';

const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

function getTokenExpMs(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const refreshingRef = useRef(false);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const silentRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return;
    refreshingRef.current = true;
    try {
      const baseURL = import.meta.env.VITE_API_URL || '/api';
      const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.accessToken}`;
    } catch {
      // ignore — axios response interceptor handles 401 on the next real request
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  // Track user activity once logged in
  useEffect(() => {
    if (!user) return;
    ACTIVITY_EVENTS.forEach(ev =>
      window.addEventListener(ev, markActivity, { passive: true })
    );
    return () => {
      ACTIVITY_EVENTS.forEach(ev =>
        window.removeEventListener(ev, markActivity)
      );
    };
  }, [user, markActivity]);

  // Periodic check: idle-timeout modal + proactive silent token refresh
  useEffect(() => {
    if (!user || sessionExpired) return;

    const tick = () => {
      const now = Date.now();
      if (now - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        setSessionExpired(true);
        return;
      }
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      const expMs = getTokenExpMs(token);
      if (!expMs) return;
      if (expMs - now < TOKEN_REFRESH_BUFFER_MS) {
        silentRefresh();
      }
    };

    tick();
    const interval = setInterval(tick, CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, sessionExpired, silentRefresh]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      api.get('/auth/me')
        .then(res => {
          setUser(res.data);
          lastActivityRef.current = Date.now();
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          delete api.defaults.headers.common['Authorization'];
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: userData, accessToken, refreshToken } = res.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    setUser(userData);
    setSessionExpired(false);
    lastActivityRef.current = Date.now();
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
      <Modal
        open={sessionExpired}
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={null}
        centered
        title={
          <span>
            <ClockCircleOutlined style={{ color: '#FAAD14', marginRight: 8 }} />
            Phiên đăng nhập đã hết hạn
          </span>
        }
      >
        <p style={{ marginBottom: 16 }}>
          Bạn đã không sử dụng app trong 3 giờ. Vui lòng refresh trang để tiếp tục sử dụng.
        </p>
        <div style={{ textAlign: 'right' }}>
          <Button type="primary" size="large" onClick={() => window.location.reload()}>
            Refresh ngay
          </Button>
        </div>
      </Modal>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
