import { create } from 'zustand';
import { AGENTS_DEFAULT } from '@/data/mock';
import type { AgentStatus } from '@/data/types';

interface AgentsState {
  agents: AgentStatus[];
  setState: (key: AgentStatus['key'], state: AgentStatus['state']) => void;
  isMockMode: () => boolean;
}

export const useAgents = create<AgentsState>((set, get) => ({
  agents: AGENTS_DEFAULT,
  setState: (key, state) =>
    set((s) => ({ agents: s.agents.map((a) => (a.key === key ? { ...a, state } : a)) })),
  isMockMode: () => get().agents.every((a) => a.state === 'mock'),
}));
