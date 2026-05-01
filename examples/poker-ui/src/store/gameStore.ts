/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';

/**
 * Zustand store for client-only UI state
 * All on-chain state is managed via TanStack Query hooks
 */
interface UIStore {
  // Turn timer tracking (client-side only)
  turnStartedAt: number | null;
  
  // Showdown tracking
  sawShowdownComplete: boolean;
  
  // UI preferences
  soundEnabled: boolean;
  animationsEnabled: boolean;
  
  // Modal states
  showResultsModal: boolean;
  showSettingsModal: boolean;
  
  // Actions
  setTurnStartedAt: (timestamp: number | null) => void;
  setSawShowdownComplete: (saw: boolean) => void;
  setShowResultsModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  toggleSound: () => void;
  toggleAnimations: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  turnStartedAt: null,
  sawShowdownComplete: false,
  soundEnabled: true,
  animationsEnabled: true,
  showResultsModal: false,
  showSettingsModal: false,
  
  setTurnStartedAt: (timestamp) => set({ turnStartedAt: timestamp }),
  setSawShowdownComplete: (saw) => set({ sawShowdownComplete: saw }),
  setShowResultsModal: (show) => set({ showResultsModal: show }),
  setShowSettingsModal: (show) => set({ showSettingsModal: show }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  toggleAnimations: () => set((state) => ({ animationsEnabled: !state.animationsEnabled })),
}));
