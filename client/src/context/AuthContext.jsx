import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import api from '../api/client';

const AuthContext = createContext(null);

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
  const timeoutRef = useRef(null);

  const clearExpiryTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scheduleExpiry = useCallback(() => {
    clearExpiryTimer();
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const expMs = getTokenExpMs(token);
    if (!expMs) return;
    const delay = expMs - Date.now();
    if (delay <= 0) {
      setSessionExpired(true);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      setSessionExpired(true);
    }, delay);
  }, [clearExpiryTimer]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      api.get('/auth/me')
        .then(res => {
          setUser(res.data);
          scheduleExpiry();
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

    return clearExpiryTimer;
  }, [scheduleExpiry, clearExpiryTimer]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: userData, accessToken, refreshToken } = res.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    setUser(userData);
    setSessionExpired(false);
    scheduleExpiry();
    return userData;
  }, [scheduleExpiry]);

  const logout = useCallback(() => {
    clearExpiryTimer();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setSessionExpired(false);
  }, [clearExpiryTimer]);

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
          Phiên đăng nhập đã hết hạn sau 3 giờ. Vui lòng refresh trang để tiếp tục sử dụng.
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
