import { createContext } from 'react';
import type { IDynamicNotificationsContext } from './types';

export const DynamicNotificationsContext = createContext<IDynamicNotificationsContext | null>(null);
