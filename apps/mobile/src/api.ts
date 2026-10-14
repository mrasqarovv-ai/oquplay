import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
const base = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? '' : 'http://localhost:3001');
let token: string | null = null;
let loaded = false;
export class ApiError extends Error {
 constructor(public code: string, public fields?: { path: (string | number)[]; message: string }[]) { super(code); }
}
export async function api<T>(path: string, init: { method?: string; body?: unknown; key?: string } = {}): Promise<T> {
 const native = Platform.OS !== 'web';
 if (native && !loaded) { token = await SecureStore.getItemAsync('oquplay_session'); loaded = true; }
 let response: Response;
 try {
  response = await fetch(`${base}/api${path}`, { method: init.method ?? 'GET', credentials: native ? 'omit' : 'include',
   headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'X-Oquplay-Client': native ? 'native' : 'web', ...(native && token ? { Authorization: `Bearer ${token}` } : {}), ...(init.key ? { 'Idempotency-Key': init.key } : {}) },
   ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}), signal: AbortSignal.timeout(110000),
  });
 } catch { throw new ApiError('network_error'); }
 const data = await response.json().catch(() => { throw new ApiError('server_error'); });
 if (!response.ok) throw new ApiError(data.error ?? 'server_error', data.fields);
 if (native && typeof data.token === 'string') { const newToken: string = data.token; token = newToken; await SecureStore.setItemAsync('oquplay_session', newToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); }
 return data as T;
}
