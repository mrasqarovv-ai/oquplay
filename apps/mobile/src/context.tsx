import React, { createContext, useContext, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { translations, type Language, type TranslationKey, type User } from '@oquplay/shared';
import { api } from './api';
import { applySession, type SessionData } from './session';
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20000 }, mutations: { retry: false } } });
type Context = { lang: Language; setLang: (l: Language) => void; t: (k: TranslationKey) => string; user: User | null; loading: boolean; sessionError: Error | null; mode: 'demo' | 'live'; refreshSession: () => Promise<void>; logout: () => Promise<void> };
const Ctx = createContext<Context>(null!);
function Session({ children }: { children: React.ReactNode }) {
 const [lang, setLang] = useState<Language>('kk'), qc = useQueryClient();
 const session = useQuery({ queryKey: ['session'], queryFn: () => api<SessionData>('/auth/session', { method: 'POST' }), staleTime: Infinity });
 const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ mode: 'demo' | 'live' }>('/health') });
 const refreshSession = async () => { await qc.invalidateQueries({ queryKey: ['session'] }); };
 const logout = async () => { const session = await api<SessionData>('/auth/logout', { method: 'POST' }); await applySession(qc, session); };
 return <Ctx.Provider value={{ lang, setLang, t: k => translations[lang][k], user: session.data?.user ?? null, loading: session.isPending, sessionError: session.error, mode: health.data?.mode ?? 'demo', refreshSession, logout }}>{children}</Ctx.Provider>;
}
export function Providers({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={client}><Session>{children}</Session></QueryClientProvider>; }
export const useApp = () => useContext(Ctx);
