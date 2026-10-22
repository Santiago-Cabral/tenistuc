import type { WithSpringConfig } from 'react-native-reanimated';
import { EXIT_ANTICIPATION_VELOCITY } from './constants';

export const DROP_SPRING: WithSpringConfig = { duration: 1150, dampingRatio: 0.82 };
export const EXPAND_SPRING: WithSpringConfig = { duration: 1000, dampingRatio: 0.8 };
export const REVEAL_SPRING: WithSpringConfig = { duration: 700, dampingRatio: 1 };
export const TINT_SPRING: WithSpringConfig = { duration: 700, dampingRatio: 1 };
export const COLLAPSE_SPRING: WithSpringConfig = {
    duration: 660,
    dampingRatio: 0.92,
    velocity: EXIT_ANTICIPATION_VELOCITY,
};
export const RETURN_SPRING: WithSpringConfig = { duration: 1150, dampingRatio: 0.9 };
export const FADE_SPRING: WithSpringConfig = { duration: 360, dampingRatio: 1 };
export const DRAG_SPRING: WithSpringConfig = { duration: 560, dampingRatio: 0.7 };
