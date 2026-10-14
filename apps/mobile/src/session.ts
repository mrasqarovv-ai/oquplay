import type { QueryClient } from '@tanstack/react-query';
import type { User } from '@oquplay/shared';

export type SessionData = { user: User | null };

export async function applySession(client: QueryClient, session: SessionData): Promise<void> {
 await client.cancelQueries({ predicate: query => query.queryKey[0] !== 'health' });
 client.removeQueries({ predicate: query => !['session', 'health'].includes(String(query.queryKey[0])) });
 client.setQueryData<SessionData>(['session'], session);
}
